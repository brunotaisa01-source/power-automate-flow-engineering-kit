import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function relativePosix(root, file) {
  return relative(root, file).split(sep).join("/");
}

function slashNormalize(value) {
  return value.replaceAll("\\", "/");
}

export function normalizeTestInventory(root, files) {
  const normalizedRoot = slashNormalize(root).replace(/\/+$/, "") || "/";
  const rootPrefix = normalizedRoot === "/" ? "/" : `${normalizedRoot}/`;

  return files.map((file) => {
    const normalizedFile = slashNormalize(file);
    if (!normalizedFile.startsWith(rootPrefix)) {
      throw new Error(`test inventory path is outside root: ${file}`);
    }
    return normalizedFile.slice(rootPrefix.length);
  }).sort(compare);
}

export function nativeTestPath(root, inventoryPath) {
  return join(root, ...inventoryPath.split("/"));
}

export function walkFiles(root) {
  const files = [];

  function visit(directory) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => compare(left.name, right.name));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(absolute);
    }
  }

  visit(root);
  return files.sort((left, right) => compare(relativePosix(root, left), relativePosix(root, right)));
}

export function discoverTestFiles(root = process.cwd()) {
  const projectRoot = resolve(root);
  const candidates = walkFiles(join(projectRoot, "tests"))
    .filter((file) => file.endsWith(".test.ts") || file.endsWith(".test.mjs"));
  return normalizeTestInventory(projectRoot, candidates);
}

export function buildTestCommand(root = process.cwd()) {
  const testFiles = discoverTestFiles(root);
  return {
    executable: process.execPath,
    args: ["--experimental-strip-types", "--test", ...testFiles.map((file) => nativeTestPath(root, file))],
    cwd: root,
    shell: false,
  };
}

export function runTestSuite(root = process.cwd()) {
  const command = buildTestCommand(root);
  const result = spawnSync(command.executable, command.args, {
    cwd: command.cwd,
    shell: command.shell,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  try {
    process.exitCode = runTestSuite();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "test suite failed"}\n`);
    process.exitCode = 1;
  }
}
