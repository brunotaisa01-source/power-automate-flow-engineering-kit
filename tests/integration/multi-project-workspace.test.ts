import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const CLI = resolve(ROOT, "packages/cli/dist/bin/spflow.js");
const FIXTURE_ROOT = resolve(ROOT, "examples/multi-project-workspace");
const FIXTURE_MANIFEST = resolve(FIXTURE_ROOT, "workspace.manifest.json");
const APPROVED_REGISTRY_FILES = [
  "knowledge/self-improvement/registry.json",
  "knowledge/self-improvement/registry.sha256",
  "tests/rules/wp-06-raw-artifact-authority.test.ts",
  "tests/integration/wp-06-built-cli.test.ts",
  "docs/reviews/wp-16-operation-specific-endpoint-authority-remediation-record.md",
  "docs/reviews/wp-16-operation-specific-endpoint-authority-independent-review-r01.md",
] as const;
const CANDIDATE_SUPPORT_FILES = [
  "tests/skills/sharepoint-flow-engineering-kit-skill.test.ts",
  "tests/unit/core/self-improvement.test.ts",
  "docs/specs/self-improvement.md",
  "docs/reviews/wp-17-skill-loophole-review-r01.md",
  "docs/plans/wp-17-global-self-improvement-control-plane-plan.md",
] as const;
const CANDIDATE_SOURCE = "knowledge/self-improvement/candidates/wp-17-skill-tdd-loophole.json";

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
  readonly stdout: string;
  readonly stderr: string;
  readonly report: {
    readonly exitCode: number;
    readonly data: WorkspaceData;
    readonly diagnostics: readonly Array<{ readonly code: string }>;
  };
}

interface CliOutput {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
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

async function runCliOutput(manifestPath: string, format: "json" | "text"): Promise<CliOutput> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [
      CLI,
      "workspace",
      "check",
      "--manifest",
      manifestPath,
      "--format",
      format,
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
          stdout,
          stderr,
        });
      } catch (error) { rejectRun(error); }
    });
  });
}

async function runCli(manifestPath: string): Promise<CliResult> {
  const output = await runCliOutput(manifestPath, "json");
  return { ...output, report: JSON.parse(output.stdout) as CliResult["report"] };
}

async function copyRepositoryFiles(workspaceRoot: string, paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map(async (path) => {
    const destination = join(workspaceRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(ROOT, path), destination);
  }));
}

async function installApprovedRegistry(workspaceRoot: string): Promise<readonly [string, string]> {
  await copyRepositoryFiles(workspaceRoot, APPROVED_REGISTRY_FILES);
  const registry = JSON.parse(await readFile(join(workspaceRoot, "knowledge/self-improvement/registry.json"), "utf8")) as {
    readonly lessons: readonly Array<{ readonly id: string; readonly invariant: string }>;
  };
  const lesson = registry.lessons[0];
  if (lesson === undefined) throw new Error("Canonical APPROVED fixture registry must contain one lesson.");
  return [lesson.id, lesson.invariant];
}

async function installUnresolvedHistory(workspaceRoot: string, status: "CANDIDATE" | "BLOCKED"): Promise<string> {
  await copyRepositoryFiles(workspaceRoot, CANDIDATE_SUPPORT_FILES);
  const candidate = JSON.parse(await readFile(resolve(ROOT, CANDIDATE_SOURCE), "utf8")) as {
    status: string;
    invariant: string;
    lifecycle: { current: string; history: unknown[] };
  };
  candidate.status = status;
  candidate.lifecycle = {
    current: status,
    history: status === "BLOCKED" ? candidate.lifecycle.history.slice(0, 2) : candidate.lifecycle.history,
  };
  const destination = join(workspaceRoot, CANDIDATE_SOURCE);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(candidate, null, 2) + "\n", "utf8");
  return candidate.invariant;
}

function projects(data: WorkspaceData): Array<[string, string, number]> {
  return data.projects.map(({ id, result, exitCode }) => [id, result, exitCode]);
}

test("compiled workspace control plane keeps project outcomes isolated", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "spflow-multi-project-workspace-"));
  const workspaceRoot = join(temporaryDirectory, "workspace");
  const greenManifestPath = join(workspaceRoot, "workspace.manifest.json");
  const redManifestPath = join(workspaceRoot, "with-red.manifest.json");
  const optionalManifestPath = join(workspaceRoot, "with-optional-missing.manifest.json");

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

  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("compiled workspace audits a copied APPROVED lesson and reports registry metadata only", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "spflow-approved-registry-"));
  const workspaceRoot = join(temporaryDirectory, "workspace");
  const manifestPath = join(workspaceRoot, "workspace.manifest.json");

  try {
    await cp(FIXTURE_ROOT, workspaceRoot, { recursive: true });
    const [lessonId, lessonText] = await installApprovedRegistry(workspaceRoot);

    const json = await runCli(manifestPath);
    const text = await runCliOutput(manifestPath, "text");

    assert.equal(json.exitCode, 0);
    assert.equal(json.report.data.result, "PASS");
    assert.deepEqual(Object.keys(json.report.data.registry).sort(), ["audit", "digest", "revision"]);
    assert.equal(text.exitCode, 0);
    for (const output of [json.stdout, text.stdout]) {
      assert.ok(!output.includes(lessonId));
      assert.ok(!output.includes(lessonText));
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

async function assertUnresolvedHistoryFailsClosed(status: "CANDIDATE" | "BLOCKED"): Promise<void> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), `spflow-${status.toLowerCase()}-registry-`));
  const workspaceRoot = join(temporaryDirectory, "workspace");
  const manifestPath = join(workspaceRoot, "workspace.manifest.json");
  const markerRequest = join(workspaceRoot, "projects/green-a/.workspace-run-marker.request");
  const markerRan = join(workspaceRoot, "projects/green-a/.workspace-run-marker.ran");

  try {
    await cp(FIXTURE_ROOT, workspaceRoot, { recursive: true });
    await installApprovedRegistry(workspaceRoot);
    const lessonText = await installUnresolvedHistory(workspaceRoot, status);
    await writeFile(markerRequest, "request\n", "utf8");

    const json = await runCli(manifestPath);
    const text = await runCliOutput(manifestPath, "text");

    assert.notEqual(json.exitCode, 0);
    assert.equal(json.report.data.result, "FAIL");
    assert.equal(json.report.data.registry.audit, "FAIL");
    assert.deepEqual(projects(json.report.data), [
      ["green-a", "NOT_RUN", 8],
      ["green-b", "NOT_RUN", 8],
    ]);
    assert.deepEqual(json.report.data.summary, { total: 2, passed: 0, failed: 0, notRun: 2, blocked: 0 });
    assert.ok(json.report.diagnostics.every(({ code }) => code === "WORKSPACE_REGISTRY_AUDIT_FAILED"));
    assert.notEqual(text.exitCode, 0);
    for (const output of [json.stdout, text.stdout]) assert.ok(!output.includes(lessonText));
    await assert.rejects(access(markerRan));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

test("compiled workspace treats a CANDIDATE history file as a fail-closed audit gate", async () => {
  await assertUnresolvedHistoryFailsClosed("CANDIDATE");
});

test("compiled workspace treats a BLOCKED history file as a fail-closed audit gate", async () => {
  await assertUnresolvedHistoryFailsClosed("BLOCKED");
});
