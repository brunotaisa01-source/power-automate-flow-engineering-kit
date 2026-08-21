import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const CLI = resolve(ROOT, "packages/cli/dist/bin/spflow.js");
const FIXTURE_ROOT = resolve(ROOT, "examples/multi-project-workspace");
const FIXTURE_MANIFEST = resolve(FIXTURE_ROOT, "workspace.manifest.json");

interface WorkspaceData {
  readonly result: "PASS" | "FAIL";
  readonly registry: { readonly audit: "PASS" | "FAIL" };
  readonly projects: readonly Array<{
    readonly id: string;
    readonly required: boolean;
    readonly result: "PASS" | "FAIL" | "NOT_RUN" | "BLOCKED";
    readonly exitCode: number;
    readonly evidenceClass: "LOCAL_SYNTHETIC";
  }>;
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly notRun: number;
    readonly blocked: number;
  };
}

interface CliResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly report: {
    readonly exitCode: number;
    readonly data: WorkspaceData;
    readonly diagnostics: readonly Array<{ readonly code: string }>;
  };
}

interface WorkspaceManifest {
  readonly schemaVersion: "1.0";
  readonly workspaceId: string;
  readonly registryPath: string;
  readonly projects: readonly Array<{
    readonly id: string;
    readonly root: string;
    readonly check: "npm run check";
    readonly required: boolean;
  }>;
}

async function runCli(manifestPath: string): Promise<CliResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [
      CLI,
      "workspace",
      "check",
      "--manifest",
      manifestPath,
      "--format",
      "json",
    ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", (exitCode) => {
      try {
        resolveRun({
          exitCode: exitCode ?? 1,
          stderr,
          report: JSON.parse(stdout) as CliResult["report"],
        });
      } catch (error) {
        rejectRun(error);
      }
    });
  });
}

function projects(data: WorkspaceData): Array<[string, string, number]> {
  return data.projects.map(({ id, result, exitCode }) => [id, result, exitCode]);
}

test("compiled workspace control plane keeps project outcomes isolated and blocks an unresolved global registry", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "spflow-multi-project-workspace-"));
  const workspaceRoot = join(temporaryDirectory, "workspace");
  const greenManifestPath = join(workspaceRoot, "workspace.manifest.json");
  const redManifestPath = join(workspaceRoot, "with-red.manifest.json");
  const optionalManifestPath = join(workspaceRoot, "with-optional-missing.manifest.json");
  const globalManifestPath = join(ROOT, `.multi-project-workspace-global-${process.pid}.manifest.json`);
  const markerRequest = join(FIXTURE_ROOT, "projects/green-a/.workspace-run-marker.request");
  const markerRan = join(FIXTURE_ROOT, "projects/green-a/.workspace-run-marker.ran");

  try {
    await cp(FIXTURE_ROOT, workspaceRoot, { recursive: true });
    await writeFile(greenManifestPath, await readFile(FIXTURE_MANIFEST, "utf8"), "utf8");

    const green = await runCli(greenManifestPath);
    assert.equal(green.exitCode, 0);
    assert.equal(green.stderr, "");
    assert.equal(green.report.exitCode, 0);
    assert.equal(green.report.data.result, "PASS");
    assert.equal(green.report.data.registry.audit, "PASS");
    assert.deepEqual(projects(green.report.data), [
      ["green-a", "PASS", 0],
      ["green-b", "PASS", 0],
    ]);
    assert.deepEqual(green.report.data.summary, { total: 2, passed: 2, failed: 0, notRun: 0, blocked: 0 });

    const greenManifest = JSON.parse(await readFile(greenManifestPath, "utf8")) as WorkspaceManifest;
    await writeFile(redManifestPath, JSON.stringify({
      ...greenManifest,
      projects: [...greenManifest.projects, {
        id: "red",
        root: "projects/red",
        check: "npm run check",
        required: true,
      }],
    }, null, 2) + "\n", "utf8");
    const red = await runCli(redManifestPath);
    assert.equal(red.exitCode, 1);
    assert.equal(red.report.data.result, "FAIL");
    assert.deepEqual(projects(red.report.data), [
      ["green-a", "PASS", 0],
      ["green-b", "PASS", 0],
      ["red", "FAIL", 1],
    ]);
    assert.deepEqual(red.report.data.summary, { total: 3, passed: 2, failed: 1, notRun: 0, blocked: 0 });

    await writeFile(optionalManifestPath, JSON.stringify({
      ...greenManifest,
      projects: [...greenManifest.projects, {
        id: "optional-missing",
        root: "projects/optional-missing",
        check: "npm run check",
        required: false,
      }],
    }, null, 2) + "\n", "utf8");
    const optional = await runCli(optionalManifestPath);
    assert.equal(optional.exitCode, 0);
    assert.equal(optional.report.data.result, "PASS");
    assert.deepEqual(projects(optional.report.data), [
      ["green-a", "PASS", 0],
      ["green-b", "PASS", 0],
      ["optional-missing", "NOT_RUN", 8],
    ]);
    assert.deepEqual(optional.report.data.summary, { total: 3, passed: 2, failed: 0, notRun: 1, blocked: 0 });

    await rm(markerRequest, { force: true });
    await rm(markerRan, { force: true });
    await writeFile(markerRequest, "request\n", "utf8");
    await writeFile(globalManifestPath, JSON.stringify({
      schemaVersion: "1.0",
      workspaceId: "global-registry-gate",
      registryPath: "knowledge/self-improvement/registry.json",
      projects: [{
        id: "runner-must-not-start",
        root: "examples/multi-project-workspace/projects/green-a",
        check: "npm run check",
        required: true,
      }],
    }, null, 2) + "\n", "utf8");
    const blocked = await runCli(globalManifestPath);
    assert.notEqual(blocked.exitCode, 0);
    assert.equal(blocked.report.data.result, "FAIL");
    assert.equal(blocked.report.data.registry.audit, "FAIL");
    assert.deepEqual(projects(blocked.report.data), [["runner-must-not-start", "NOT_RUN", 8]]);
    assert.deepEqual(blocked.report.data.summary, { total: 1, passed: 0, failed: 0, notRun: 1, blocked: 0 });
    assert.ok(blocked.report.diagnostics.some(({ code }) => code === "WORKSPACE_REGISTRY_AUDIT_FAILED"));
    await assert.rejects(access(markerRan));
  } finally {
    await rm(markerRequest, { force: true });
    await rm(markerRan, { force: true });
    await rm(globalManifestPath, { force: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
