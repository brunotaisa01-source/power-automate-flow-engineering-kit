import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { workspaceCheckCommand, type WorkspaceRunner } from "../../packages/cli/src/commands/workspace.ts";
import { executeCli, HELP_TEXT } from "../../packages/cli/src/bin/spflow.ts";
import { CliUsageError, createCommandReport, parseCliArgs, type CommandReport } from "../../packages/cli/src/parse-args.ts";

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

test("workspace check redacts compound credential-shaped child output before direct and formatted reports", async () => {
  const fixture = await writeWorkspace([
    { id: "red", root: "projects/red", check: "npm run check", required: true },
  ]);
  const runner: WorkspaceRunner = () => ({
    exitCode: 1,
    stdout: "client_secret=unsafe-client access_token:unsafe-access refresh_token=unsafe-refresh clientSecret=unsafe-camel-client accessToken:unsafe-camel-access refreshToken=unsafe-camel-refresh",
    stderr: "client-secret=unsafe-delimiter-client access-token=unsafe-delimiter-access refresh-token=unsafe-delimiter-refresh",
  });
  const args = ["workspace", "check", "--manifest", fixture.manifestPath, "--format", "json"] as const;

  const direct = await workspaceCheckCommand(args, { runner });
  let formatted = "";
  const exitCode = await executeCli(args, {
    stdout(value) { formatted += value; },
    stderr() {},
    env: {},
    handlers: {
      "workspace-check": { run: (commandArgs) => workspaceCheckCommand(commandArgs, { runner }) },
    },
  });
  const serialized = `${JSON.stringify(direct)}\n${formatted}`;

  assert.equal(exitCode, 1);
  assert.doesNotMatch(serialized, /unsafe-(?:client|access|refresh|camel-client|camel-access|camel-refresh|delimiter-client|delimiter-access|delimiter-refresh)/);
  assert.match(serialized, /client_secret=<redacted>/);
  assert.match(serialized, /clientSecret=<redacted>/);
  assert.match(serialized, /refresh-token=<redacted>/);
});

test("workspace check keeps rejected manifest path diagnostics value-free while retaining codes and pointers", async () => {
  const fixture = await writeWorkspace([
    { id: "traversal", root: "../private-traversal-value", check: "npm run check", required: true },
    { id: "absolute", root: "/private/absolute-private-value", check: "npm run check", required: true },
    { id: "symlink", root: "projects/symlink-private-value", check: "npm run check", required: true },
  ], ["projects/symlink-private-value"]);
  const escapedDirectory = await mkdtemp(join(tmpdir(), "spflow-workspace-escaped-private-"));
  await mkdir(join(fixture.directory, "projects"), { recursive: true });
  await symlink(escapedDirectory, join(fixture.directory, "projects", "symlink-private-value"));

  const report = await workspaceCheckCommand(["workspace", "check", "--manifest", fixture.manifestPath]);
  const serialized = JSON.stringify(report);

  assert.equal(report.exitCode, 1);
  assert.doesNotMatch(serialized, /private-traversal-value|absolute-private-value|symlink-private-value|\.\.\/private-traversal-value|\/private\/absolute-private-value/);
  assert.deepEqual(report.diagnostics.map(({ code, jsonPointer }) => [code, jsonPointer]), [
    ["WORKSPACE_PATH_INVALID", "/projects/0/root"],
    ["WORKSPACE_PATH_INVALID", "/projects/1/root"],
  ]);
  assert.ok(report.diagnostics.every(({ remediation }) => remediation.includes("safe relative paths")));
});

test("workspace check does not echo a symlink-escape project path", async () => {
  const fixture = await writeWorkspace([
    { id: "symlink", root: "projects/symlink-private-value", check: "npm run check", required: true },
  ], ["projects/symlink-private-value"]);
  const escapedDirectory = await mkdtemp(join(tmpdir(), "spflow-workspace-escaped-private-"));
  await mkdir(join(fixture.directory, "projects"), { recursive: true });
  await symlink(escapedDirectory, join(fixture.directory, "projects", "symlink-private-value"));
  let calls = 0;
  const runner: WorkspaceRunner = () => {
    calls += 1;
    return { exitCode: 0, stdout: "", stderr: "" };
  };

  const report = await workspaceCheckCommand(["workspace", "check", "--manifest", fixture.manifestPath], { runner });

  assert.equal(calls, 0);
  assert.equal(report.exitCode, 2);
  assert.doesNotMatch(JSON.stringify(report), /symlink-private-value|spflow-workspace-escaped-private/);
  assert.deepEqual(report.diagnostics.map(({ code, jsonPointer }) => [code, jsonPointer]), [
    ["WORKSPACE_PROJECT_ROOT_MISSING", undefined],
  ]);
});

test("workspace check blocks every runner invocation when registry audit fails", async () => {
  const fixture = await writeWorkspace([
    { id: "green", root: "projects/green", check: "npm run check", required: true },
  ]);
  await writeFile(join(fixture.directory, "knowledge", "self-improvement", "registry.sha256"), "0".repeat(64) + "\n", "utf8");
  let calls = 0;
  const runner: WorkspaceRunner = () => {
    calls += 1;
    return { exitCode: 0, stdout: "", stderr: "" };
  };

  const report = await workspaceCheckCommand(["workspace", "check", "--manifest", fixture.manifestPath], { runner });
  const data = reportData(report);

  assert.equal(calls, 0);
  assert.equal(report.exitCode, 1);
  assert.equal(data.registry.audit, "FAIL");
  assert.equal(data.projects[0]?.result, "NOT_RUN");
  assert.ok(report.diagnostics.every(({ code }) => code === "WORKSPACE_REGISTRY_AUDIT_FAILED"));
});

test("workspace check preserves required failure exit precedence while optional failures remain warnings", async () => {
  const fixture = await writeWorkspace([
    { id: "required", root: "projects/required", check: "npm run check", required: true },
    { id: "optional", root: "projects/optional", check: "npm run check", required: false },
  ]);
  const runner: WorkspaceRunner = (_command, _args, options) => options.cwd.endsWith("/required")
    ? { exitCode: 2, stdout: "required failure", stderr: "" }
    : { exitCode: 5, stdout: "optional failure", stderr: "" };

  const report = await workspaceCheckCommand(["workspace", "check", "--manifest", fixture.manifestPath], { runner });
  const data = reportData(report);

  assert.equal(report.exitCode, 2);
  assert.equal(data.result, "FAIL");
  assert.deepEqual(data.projects.map(({ id, result, exitCode }) => [id, result, exitCode]), [
    ["optional", "FAIL", 5],
    ["required", "FAIL", 2],
  ]);
  assert.deepEqual(report.diagnostics.map(({ severity }) => severity), ["error", "warning"]);
});

test("workspace check uses the Windows npm command, shell, and minimal SystemRoot environment", async () => {
  const fixture = await writeWorkspace([
    { id: "green", root: "projects/green", check: "npm run check", required: true },
  ]);
  const calls: Array<{ command: string; args: readonly string[]; env: NodeJS.ProcessEnv; shell: boolean }> = [];
  const runner: WorkspaceRunner = (command, args, options) => {
    calls.push({ command, args, env: options.env, shell: options.shell });
    return { exitCode: 0, stdout: "", stderr: "" };
  };

  const report = await workspaceCheckCommand(["workspace", "check", "--manifest", fixture.manifestPath], {
    runner,
    platform: "win32",
    env: { PATH: "C:\\synthetic\\bin", SystemRoot: "C:\\Windows", SPFLOW_BINDING_TOKEN: "private-token" },
  });

  assert.equal(report.exitCode, 0);
  assert.deepEqual(calls, [{
    command: "npm.cmd",
    args: ["run", "check"],
    env: { PATH: "C:\\synthetic\\bin", SystemRoot: "C:\\Windows", npm_config_loglevel: "error" },
    shell: true,
  }]);
});

test("workspace check parser, help, and handler dispatch remain wired", async () => {
  const args = ["workspace", "check", "--manifest", "synthetic.manifest.json", "--format", "json"] as const;
  assert.deepEqual(parseCliArgs(args), {
    kind: "command",
    route: "workspace-check",
    command: "workspace check",
    format: "json",
    manifestPath: "synthetic.manifest.json",
  });
  assert.match(HELP_TEXT, /^  workspace check --manifest <workspace-manifest> \[--format text\|json\]$/m);

  let dispatched: readonly string[] | undefined;
  let stdout = "";
  const exitCode = await executeCli(args, {
    stdout(value) { stdout += value; },
    stderr() {},
    env: {},
    handlers: {
      "workspace-check": {
        async run(commandArgs) {
          dispatched = commandArgs;
          return createCommandReport("workspace check", []);
        },
      },
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(dispatched, args);
  assert.equal(JSON.parse(stdout).command, "workspace check");
});
