import type {
  ArtifactNodeInput,
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import { posix } from "node:path";
import {
  compareText,
  isRecord,
  manifestArtifacts,
  missingPackageEvidenceDiagnostic,
  packageDiagnostic,
  packageEvidence,
} from "./common.ts";

const MESSAGE = "Artifact manifest inventory does not exactly match final release artifacts.";

interface ManifestEntry {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly role: string;
}

function compareEntries(left: ManifestEntry, right: ManifestEntry): number {
  return compareText(left.path, right.path)
    || compareText(left.role, right.role)
    || compareText(left.mediaType, right.mediaType)
    || left.bytes - right.bytes
    || compareText(left.sha256, right.sha256);
}

function parseEntries(value: unknown): ManifestEntry[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries: ManifestEntry[] = [];
  for (const valueEntry of value) {
    if (!isRecord(valueEntry)) {
      return undefined;
    }
    const { path, mediaType, bytes, sha256, role } = valueEntry;
    if (
      typeof path !== "string"
      || typeof mediaType !== "string"
      || typeof bytes !== "number"
      || !Number.isSafeInteger(bytes)
      || bytes < 0
      || typeof sha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(sha256)
      || typeof role !== "string"
    ) {
      return undefined;
    }
    entries.push({ path, mediaType, bytes, sha256, role });
  }
  return entries;
}

function physicalNode(
  context: ValidationContext,
  path: string,
  kind: string,
  sourceProfile: string,
): ArtifactNodeInput | undefined {
  const matches = context.graph.nodes.filter((node) =>
    node.relativePath === path
    && node.kind === kind
    && node.sourceProfile === sourceProfile
  );
  if (matches.length !== 1 || matches[0]?.byteLength === undefined) {
    return undefined;
  }
  return matches[0];
}

function fileEntry(
  node: ArtifactNodeInput,
  role: "contract" | "definition",
): ManifestEntry {
  return {
    path: node.relativePath,
    mediaType: "application/json",
    bytes: node.byteLength!,
    sha256: node.digest,
    role,
  };
}

function exactStringInventory(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  const sortedActual = [...actual].sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return new Set(sortedActual).size === sortedActual.length
    && new Set(sortedExpected).size === sortedExpected.length
    && sortedActual.length === sortedExpected.length
    && sortedActual.every((value, index) => value === sortedExpected[index]);
}

function sourceDefinitionIdentity(
  node: ArtifactNodeInput,
  declaredByPath: ReadonlyMap<string, string>,
): string | undefined {
  const declared = declaredByPath.get(node.relativePath);
  if (declared !== undefined) {
    return declared;
  }
  const data = isRecord(node.data) ? node.data : undefined;
  const properties = data !== undefined && isRecord(data.properties)
    ? data.properties
    : undefined;
  const definition = properties !== undefined && isRecord(properties.definition)
    ? properties.definition
    : data !== undefined && isRecord(data.definition)
      ? data.definition
      : undefined;
  for (const candidate of [
    data?.id,
    data?.name,
    properties?.id,
    properties?.name,
    definition?.id,
    definition?.name,
  ]) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  const basename = posix.basename(node.relativePath);
  return basename.toLowerCase() === "definition.json"
    ? posix.basename(posix.dirname(node.relativePath))
    : basename.toLowerCase().endsWith(".json")
      ? basename.slice(0, -".json".length)
      : undefined;
}

function expectedEntries(context: ValidationContext): ManifestEntry[] | undefined {
  const expected: ManifestEntry[] = [];
  const contractCandidates = context.graph.nodes.filter((node) =>
    node.relativePath === "project.contract.json"
    && node.kind === "contract"
    && node.sourceProfile === "project-contract-v1"
  );
  if (contractCandidates.length !== 1) {
    return undefined;
  }
  const contractNode = physicalNode(
    context,
    "project.contract.json",
    "contract",
    "project-contract-v1",
  );
  if (contractNode === undefined) {
    return undefined;
  }
  expected.push(fileEntry(contractNode, "contract"));

  const declaredDefinitions = new Map(
    context.contract.flows.map(({ id, definitionPath }) => [definitionPath, id]),
  );
  const sourceDefinitions = context.graph.nodes.filter((node) =>
    node.kind === "definition" && node.sourceProfile === "normalized-flow-v1"
  );
  const sourceIdentities = sourceDefinitions.map((node) =>
    sourceDefinitionIdentity(node, declaredDefinitions)
  );
  if (
    !exactStringInventory(
      sourceDefinitions.map(({ relativePath }) => relativePath),
      [...declaredDefinitions.keys()],
    )
    || sourceIdentities.some((identity) => identity === undefined)
    || new Set(sourceIdentities.map((identity) => identity?.toLowerCase())).size
      !== sourceIdentities.length
    || !exactStringInventory(
      sourceIdentities.filter((identity): identity is string => identity !== undefined),
      context.contract.flows.map(({ id }) => id),
    )
  ) {
    return undefined;
  }

  for (const flow of [...context.contract.flows].sort((left, right) =>
    compareText(left.definitionPath, right.definitionPath)
  )) {
    const definitionCandidates = context.graph.nodes.filter((node) =>
      node.relativePath === flow.definitionPath
    );
    if (definitionCandidates.length !== 1) {
      return undefined;
    }
    const node = physicalNode(context, flow.definitionPath, "definition", "normalized-flow-v1");
    if (node === undefined) {
      return undefined;
    }
    expected.push(fileEntry(node, "definition"));
  }

  for (const packaged of packageEvidence(context)) {
    if (packaged.contract === undefined) {
      return undefined;
    }
    const declaredFlowIds = packaged.contract.flowIds;
    const contractFlowIds = context.contract.flows
      .filter(({ packageId }) => packageId === packaged.packageId)
      .map(({ id }) => id);
    const discoveredFlowIds = packaged.inspection?.flows.map(({ id }) => id);
    if (
      packaged.bytes === undefined
      || packaged.sha256 === undefined
      || discoveredFlowIds === undefined
      || !exactStringInventory(contractFlowIds, declaredFlowIds)
      || !exactStringInventory(discoveredFlowIds, declaredFlowIds)
    ) {
      return undefined;
    }
    const graphNodes = context.graph.nodes.filter((node) =>
      node.relativePath === packaged.relativePath && node.kind === "zip"
    );
    if (
      graphNodes.length !== 1
      || graphNodes[0]?.digest !== packaged.sha256
      || graphNodes[0]?.byteLength !== packaged.bytes
      || graphNodes[0]?.sourceProfile !== "package-bytes-v1"
    ) {
      return undefined;
    }
    expected.push({
      path: packaged.relativePath,
      mediaType: "application/zip",
      bytes: packaged.bytes,
      sha256: packaged.sha256,
      role: "package",
    });
  }

  const sorted = expected.sort(compareEntries);
  return new Set(sorted.map(({ path }) => path)).size === sorted.length ? sorted : undefined;
}

function exactMatch(
  manifestPath: string,
  actual: readonly ManifestEntry[],
  expected: readonly ManifestEntry[],
): boolean {
  if (
    actual.some(({ path }) => path === manifestPath)
    || new Set(actual.map(({ path }) => path)).size !== actual.length
  ) {
    return false;
  }
  const sortedActual = [...actual].sort(compareEntries);
  return sortedActual.length === expected.length
    && sortedActual.every((entry, index) => {
      const expectedEntry = expected[index];
      return expectedEntry !== undefined
        && entry.path === expectedEntry.path
        && entry.mediaType === expectedEntry.mediaType
        && entry.bytes === expectedEntry.bytes
        && entry.sha256 === expectedEntry.sha256
        && entry.role === expectedEntry.role;
    });
}

export const pkgIntegrity001: RuleDetector = Object.freeze({
  id: "PKG-INTEGRITY-001",
  async validate(context: ValidationContext) {
    const missing = missingPackageEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    const expected = expectedEntries(context);
    for (const packageContract of [...context.contract.packages].sort((left, right) =>
      compareText(left.manifestPath, right.manifestPath)
    )) {
      const manifests = manifestArtifacts(context).filter(
        ({ node }) => node.relativePath === packageContract.manifestPath,
      );
      const manifest = manifests[0];
      const entries = manifest === undefined ? undefined : parseEntries(manifest.data.files);
      if (
        expected === undefined
        || manifests.length !== 1
        || manifest === undefined
        || entries === undefined
        || !exactMatch(manifest.node.relativePath, entries, expected)
      ) {
        return [packageDiagnostic(
          this.id,
          packageContract.manifestPath,
          "/files",
          MESSAGE,
        )];
      }
    }
    return [];
  },
});
