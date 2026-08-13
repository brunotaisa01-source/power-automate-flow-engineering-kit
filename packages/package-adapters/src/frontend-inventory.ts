import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type {
  FrontendBundleRuleEvidence,
  FrontendFileRuleEvidence,
} from "@spflow/core/types/rule-input";

type UnknownRecord = Record<string, unknown>;

interface FrontendManifest {
  readonly contractRevision: number;
  readonly entrypoint: string;
  readonly files: readonly FrontendFileRuleEvidence[];
  readonly sourcePaths: readonly string[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function pathIsWithinRoot(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot === ""
    || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== ".." && !isAbsolute(fromRoot));
}

function safeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    return false;
  }
  const segments = value.replaceAll("\\", "/").split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function exactRecord(value: unknown, keys: readonly string[]): value is UnknownRecord {
  return isRecord(value)
    && keys.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => keys.includes(key));
}

function parseManifest(value: unknown): FrontendManifest | undefined {
  if (!exactRecord(value, [
    "artifactProfile", "artifactRevision", "contractRevision", "entrypoint", "files", "sources",
  ])) return undefined;
  if (
    value.artifactProfile !== "spflow.frontend-bundle-v2"
    || value.artifactRevision !== 2
    || !Number.isSafeInteger(value.contractRevision)
    || (value.contractRevision as number) < 1
    || !safeRelativePath(value.entrypoint)
    || !Array.isArray(value.files)
    || value.files.length === 0
    || !Array.isArray(value.sources)
    || value.sources.length === 0
    || !value.sources.every(safeRelativePath)
  ) return undefined;

  const files: FrontendFileRuleEvidence[] = [];
  for (const item of value.files) {
    if (
      !exactRecord(item, ["path", "sha256", "bytes"])
      || !safeRelativePath(item.path)
      || typeof item.sha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(item.sha256)
      || !Number.isSafeInteger(item.bytes)
      || (item.bytes as number) < 1
    ) return undefined;
    files.push({
      relativePath: item.path,
      sha256: item.sha256,
      bytes: item.bytes as number,
    });
  }
  const paths = files.map(({ relativePath }) => relativePath);
  if (
    new Set(paths).size !== paths.length
    || new Set(value.sources).size !== value.sources.length
    || !paths.includes(value.entrypoint)
    || !value.sources.every((path) => paths.includes(path))
  ) return undefined;
  return {
    contractRevision: value.contractRevision as number,
    entrypoint: value.entrypoint,
    files: Object.freeze(files.sort((left, right) => compareText(left.relativePath, right.relativePath))),
    sourcePaths: Object.freeze([...value.sources].sort(compareText)),
  };
}

async function enumerateFiles(root: string, directory = ""): Promise<string[]> {
  const target = directory.length === 0 ? root : resolve(root, ...directory.split("/"));
  const entries = await readdir(target, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const path = directory.length === 0 ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await enumerateFiles(root, path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function inspectFrontendInventory(
  repositoryRoot: string,
  frontendRoot: string,
  contractRevision: number,
): Promise<FrontendBundleRuleEvidence> {
  const target = resolve(repositoryRoot, ...frontendRoot.replaceAll("\\", "/").split("/"));
  let resolvedRoot: string;
  try {
    resolvedRoot = await realpath(target);
  } catch (error) {
    if (isMissing(error)) {
      return Object.freeze({
        root: frontendRoot,
        files: Object.freeze([]),
        sourcePaths: Object.freeze([]),
        valid: false,
        failure: "missing",
      });
    }
    return Object.freeze({
      root: frontendRoot,
      files: Object.freeze([]),
      sourcePaths: Object.freeze([]),
      valid: false,
      failure: "invalid",
    });
  }
  if (!pathIsWithinRoot(repositoryRoot, resolvedRoot)) {
    return Object.freeze({
      root: frontendRoot,
      files: Object.freeze([]),
      sourcePaths: Object.freeze([]),
      valid: false,
      failure: "invalid",
    });
  }

  try {
    const paths = await enumerateFiles(resolvedRoot);
    const manifestCandidates: Array<{ path: string; manifest: FrontendManifest }> = [];
    const actualFiles: FrontendFileRuleEvidence[] = [];
    for (const path of paths) {
      const bytes = await readFile(resolve(resolvedRoot, ...path.split("/")));
      if (path.toLowerCase().endsWith(".json")) {
        try {
          const manifest = parseManifest(JSON.parse(bytes.toString("utf8")) as unknown);
          if (manifest !== undefined) manifestCandidates.push({ path, manifest });
        } catch {
          // Non-manifest JSON remains ordinary bundle content.
        }
      }
      actualFiles.push({ relativePath: path, bytes: bytes.byteLength, sha256: digest(bytes) });
    }
    if (manifestCandidates.length !== 1) {
      return Object.freeze({
        root: frontendRoot,
        files: Object.freeze(actualFiles),
        sourcePaths: Object.freeze([]),
        valid: false,
        failure: "invalid",
      });
    }
    const candidate = manifestCandidates[0]!;
    const deployable = actualFiles.filter(({ relativePath }) => relativePath !== candidate.path);
    const matches = candidate.manifest.contractRevision === contractRevision
      && deployable.length === candidate.manifest.files.length
      && deployable.every((file, index) => {
        const expected = candidate.manifest.files[index];
        return expected !== undefined
          && file.relativePath === expected.relativePath
          && file.bytes === expected.bytes
          && file.sha256 === expected.sha256;
      });
    return Object.freeze({
      root: frontendRoot,
      manifestPath: `${frontendRoot}/${candidate.path}`,
      entrypoint: `${frontendRoot}/${candidate.manifest.entrypoint}`,
      files: Object.freeze(deployable.map((file) => Object.freeze({
        relativePath: `${frontendRoot}/${file.relativePath}`,
        bytes: file.bytes,
        sha256: file.sha256,
      }))),
      sourcePaths: Object.freeze(candidate.manifest.sourcePaths.map((path) => `${frontendRoot}/${path}`)),
      valid: matches,
      ...(matches ? {} : { failure: "invalid" as const }),
    });
  } catch {
    return Object.freeze({
      root: frontendRoot,
      files: Object.freeze([]),
      sourcePaths: Object.freeze([]),
      valid: false,
      failure: "invalid",
    });
  }
}
