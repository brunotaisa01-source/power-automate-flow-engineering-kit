import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolute));
    } else {
      files.push(absolute);
    }
  }
  return files.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function command(label, executable, args, cwd) {
  return { label, executable, args, cwd, shell: false };
}

export function buildCheckCommands(root) {
  const node = process.execPath;
  const npm = npmExecutable();
  const cli = join(root, "packages", "cli", "dist", "bin", "spflow.js");
  const example = join(root, "examples", "minimal-public-app");
  const connectorProfiles = walkFiles(join(example, "connectors"))
    .filter((file) => file.endsWith(".profile.json"));
  const testFiles = walkFiles(join(root, "tests"))
    .filter((file) => file.endsWith(".test.ts") || file.endsWith(".test.mjs"));

  return [
    command("build", npm, ["run", "build"], root),
    command("test", node, ["--experimental-strip-types", "--test", ...testFiles], root),
    command(
      "validate contract",
      node,
      [cli, "validate", "contract", join(example, "project.contract.json"), "--format", "text"],
      root,
    ),
    ...connectorProfiles.map((profile) => command(
      `validate connector ${relative(root, profile)}`,
      node,
      [cli, "validate", "connector", profile, "--format", "text"],
      root,
    )),
    command(
      "validate rules",
      node,
      [cli, "validate", "rules", "--root", example, "--format", "text"],
      root,
    ),
    command(
      "validate rules required-only",
      node,
      [cli, "validate", "rules", "--root", example, "--required-only", "--format", "text"],
      root,
    ),
    command(
      "validate artifact",
      node,
      [
        cli,
        "validate",
        "artifact",
        join(example, "artifacts", "example-solution.zip"),
        "--contract",
        join(example, "project.contract.json"),
        "--format",
        "text",
      ],
      root,
    ),
    command("plugin readonly manifest", node, [cli, "plugin", "readonly", "getManifest", "--format", "json"], root),
    command("plugin readonly discover", node, [cli, "plugin", "readonly", "discover", "--connector", "excel", "--format", "json"], root),
    command("plugin readonly preflight", node, [cli, "plugin", "readonly", "preflight", "--format", "json"], root),
    command("npm audit", npm, ["audit", "--audit-level=high"], root),
  ];
}

export function runPortableCheck(root = process.cwd()) {
  const commands = buildCheckCommands(root);
  for (const current of commands) {
    process.stdout.write(`\n[portable-check] ${current.label}\n`);
    const result = spawnSync(current.executable, current.args, {
      cwd: current.cwd,
      shell: current.shell,
      stdio: "inherit",
    });
    if (result.error !== undefined || result.status !== 0) {
      const detail = result.error?.message ?? `exit ${result.status ?? "unknown"}`;
      throw new Error(`${current.label} failed: ${detail}`);
    }
  }
  process.stdout.write(`\n[portable-check] PASS (${commands.length} gates)\n`);
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  try {
    runPortableCheck();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "portable check failed"}\n`);
    process.exitCode = 1;
  }
}
