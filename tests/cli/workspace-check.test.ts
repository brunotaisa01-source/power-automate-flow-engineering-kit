import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { workspaceCheckCommand, type WorkspaceRunner } from "../../packages/cli/src/commands/workspace.ts";
import { CliUsageError, parseCliArgs, type CommandReport } from "../../packages/cli/src/parse-args.ts";

interface WorkspaceFixture {
  readonly directory: string;
  readonly manifestPath: string;
}

async function writeRegistry(directory: string): Promise<void> {
  const registryDirectory = join(directory, "knowledge", "self-improvement");
  await mkdir(registryDirectory, { recursive: true });
  const registry = `${JSON.stringify({
    schemaVersion: "1.0",
    registryId: "sharepoint-flow-engineering-kit-global",
    revision: 7,
    lessons: [],
  }, null, 2)}\n`;
  await writeFile(join(registryDirectory, "registry.json"), registry, "utf8");
  await writeFile(
    join(registryDirectory, "registry.sha256"),
    `${createHash("sha256").update(registry, "utf8").digest("hex")}\n`,
    "utf8",
  );
}

async function writeWorkspace(
  projects: readonly Record<string, unknown>[],
  missingRoots: readonly string[] = [],
): Promise<WorkspaceFixture> {
  const directory = await mkdtemp(join(tmpdir(), "spflow-workspace-check-"));
  await writeRegistry(directory);
  for (const project of projects) {
    if (typeof project.root === "string" && !missingRoots.includes(project.root)) {
      await mkdir(join(directory, project.root), { recursive: true });
    }
  }
  const manifestPath = join(directory, "workspace.manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    schemaVersion: "1.0",
    workspaceId: "synthetic-workspace",
    registryPath: "knowledge/self-improvement/registry.json",
    projects,
  }, null, 2), "utf8");
  return { directory, manifestPath };
}

function reportData(report: CommandReport) {
  return report.data as {
    result: string;
    registry: { audit: string; revision: number; digest: string };
    projects: Array<{ id: string; required: boolean; result: string; exitCode: number; evidenceClass: string }>;
    summary: { total: number; passed: number; failed: number; notRun: number; blocked: number };
  };
}

test("workspace check runs only the fixed command with an isolated environment and stable GREEN aggregate", async () => {
  const fixture = await writeWorkspace([
    { id: "zeta", root: "projects/zeta", check: "npm run check", required: true },
    { id: "alpha", root: "projects/alpha", check: "npm run check", required: true },
  ]);
  const calls: Array<{ command: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv; shell: boolean }> = [];
  const runner: WorkspaceRunner = (command, args, options) => {
    calls.push({ command, args, ...options });
    return { exitCode: 0, stdout: "synthetic pass", stderr: "" };
  };

  const report = await workspaceCheckCommand([
    "workspace", "check", "--manifest", fixture.manifestPath, "--format", "json",
  ], { runner, env: { PATH: "/synthetic/bin", SPFLOW_BINDING_TOKEN: "controller-secret", HOME: "/private/home" } });
  const data = reportData(report);

  assert.equal(report.exitCode, 0);
  assert.equal(data.result, "PASS");
  assert.deepEqual(data.projects.map(({ id }) => id), ["alpha", "zeta"]);
  assert.deepEqual(data.summary, { total: 2, passed: 2, failed: 0, notRun: 0, blocked: 0 });
  assert.equal(data.registry.audit, "PASS");
  assert.equal(data.registry.revision, 7);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ["npm", ["run", "check"]],
    ["npm", ["run", "check"]],
  ]);
  const realDirectory = await realpath(fixture.directory);
  assert.ok(calls.every(({ cwd }) => cwd.startsWith(realDirectory)));
  assert.ok(calls.every(({ shell }) => shell === false));
  assert.deepEqual(calls.map(({ env }) => env), [
    { PATH: "/synthetic/bin", npm_config_loglevel: "error" },
    { PATH: "/synthetic/bin", npm_config_loglevel: "error" },
  ]);
});

test("workspace check preserves a required RED while continuing through later projects", async () => {
  const fixture = await writeWorkspace([
    { id: "red", root: "projects/red", check: "npm run check", required: true },
    { id: "green", root: "projects/green", check: "npm run check", required: true },
  ]);
  const calls: string[] = [];
  const runner: WorkspaceRunner = (_command, _args, options) => {
    calls.push(options.cwd);
    return options.cwd.endsWith("/red")
      ? { exitCode: 1, stdout: "red", stderr: "" }
      : { exitCode: 0, stdout: "green", stderr: "" };
  };

  const report = await workspaceCheckCommand(["workspace", "check", "--manifest", fixture.manifestPath], { runner });
  const data = reportData(report);

  assert.equal(report.exitCode, 1);
  assert.equal(data.result, "FAIL");
  assert.deepEqual(data.projects.map(({ id, result, exitCode }) => [id, result, exitCode]), [
    ["green", "PASS", 0],
    ["red", "FAIL", 1],
  ]);
  assert.equal(calls.length, 2);
});

test("workspace check keeps an optional missing project visible as NOT_RUN", async () => {
  const fixture = await writeWorkspace([
    { id: "required", root: "projects/required", check: "npm run check", required: true },
    { id: "optional", root: "missing", check: "npm run check", required: false },
  ], ["missing"]);
  const runner: WorkspaceRunner = () => ({ exitCode: 0, stdout: "green", stderr: "" });

  const report = await workspaceCheckCommand(["workspace", "check", "--manifest", fixture.manifestPath], { runner });
  const data = reportData(report);

  assert.equal(report.exitCode, 0);
  assert.deepEqual(data.projects.map(({ id, result, exitCode }) => [id, result, exitCode]), [
    ["optional", "NOT_RUN", 8],
    ["required", "PASS", 0],
  ]);
  assert.deepEqual(data.summary, { total: 2, passed: 1, failed: 0, notRun: 1, blocked: 0 });
});

test("workspace check fails closed for malformed manifests and parser rejects unknown commands", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spflow-workspace-malformed-"));
  const manifestPath = join(directory, "workspace.manifest.json");
  await writeFile(manifestPath, "{", "utf8");
  let invoked = false;
  const runner: WorkspaceRunner = () => {
    invoked = true;
    return { exitCode: 0, stdout: "", stderr: "" };
  };

  const report = await workspaceCheckCommand(["workspace", "check", "--manifest", manifestPath], { runner });

  assert.equal(report.exitCode, 2);
  assert.equal(invoked, false);
  assert.ok(report.diagnostics.some(({ code }) => code === "WORKSPACE_MANIFEST_UNREADABLE"));
  assert.throws(() => parseCliArgs(["workspace", "unknown"]), CliUsageError);
});

test("workspace check redacts child output before aggregate reporting", async () => {
  const fixture = await writeWorkspace([
    { id: "green", root: "projects/green", check: "npm run check", required: true },
  ]);
  const runner: WorkspaceRunner = () => ({
    exitCode: 1,
    stdout: "password=unsafe /private/projects/green alice@example.com 123e4567-e89b-12d3-a456-426614174000",
    stderr: "token=unsafe",
  });

  const report = await workspaceCheckCommand(["workspace", "check", "--manifest", fixture.manifestPath], {
    runner,
    env: { SPFLOW_BINDING_SECRET: "controller-secret" },
  });
  const serialized = JSON.stringify(report);

  assert.doesNotMatch(serialized, /\/private\/projects\/green|alice@example\.com|123e4567-e89b-12d3-a456-426614174000|password=unsafe|token=unsafe|controller-secret/);
  assert.match(serialized, /<redacted>/);
});
