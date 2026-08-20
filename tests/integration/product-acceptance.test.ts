import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { describe, test } from "node:test";
import { join, resolve } from "node:path";

import { auditLearningRegistry, captureLearningCandidate, consumeApprovedLessons, promoteLearningCandidate } from "../../packages/core/src/self-improvement.ts";
import { FORBIDDEN_PLUGIN_OPERATIONS, runReadonlyPlugin } from "../../packages/core/src/readonly-plugin.ts";

import { evaluateSyntheticConnectorTrace, validateConnectorProfileFile } from "../../packages/core/src/connector-profile.ts";
import { evaluateSyntheticPayload, evaluateSyntheticPermissionReadback, evaluateSyntheticPaginationTrace } from "../../packages/core/src/connector-runtime-harness.ts";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const CLI = resolve(ROOT, "packages/cli/dist/bin/spflow.js");
const PROFILE_DIR = resolve(ROOT, "examples/minimal-public-app/connectors");
const FLOW_FIXTURE = resolve(PROFILE_DIR, "flow-fixtures.json");
const TOKEN_FIELDS: Record<string, string> = {
  sharepoint: "ETag",
  excel: "RowVersion",
  dataverse: "@odata.etag",
  "power-apps": "version",
  outlook: "version",
  graph: "version",
  http: "version",
  sql: "version",
  approvals: "version",
};

async function runCli(args: readonly string[]): Promise<{ report: Record<string, unknown>; stdout: string }> {
  const result = await execFileAsync(process.execPath, [CLI, ...args], { cwd: ROOT, timeout: 180000, windowsHide: true });
  return { report: JSON.parse(result.stdout) as Record<string, unknown>, stdout: result.stdout };
}

function profileContract(profile: Record<string, unknown>): Record<string, unknown> {
  return profile.connectorContract as Record<string, unknown>;
}

function operation(profile: Record<string, unknown>, id: string): Record<string, unknown> {
  return (profile.operations as Array<Record<string, unknown>>).find((item) => item.id === id)!;
}

describe("product-level offline acceptance", () => {
  test("reference project passes the complete compiled product path", async () => {
    const contract = await runCli(["validate", "contract", "examples/minimal-public-app/project.contract.json", "--format", "json"]);
    assert.equal(contract.report.exitCode, 0);
    const rules = await runCli(["validate", "rules", "--root", "examples/minimal-public-app", "--format", "json"]);
    assert.equal(rules.report.exitCode, 0);
    const artifact = await runCli(["validate", "artifact", "examples/minimal-public-app/artifacts/example-solution.zip", "--contract", "examples/minimal-public-app/project.contract.json", "--format", "json"]);
    assert.equal(artifact.report.exitCode, 0);
    const sharePoint = await runCli(["validate", "connector", "examples/minimal-public-app/connectors/sharepoint.profile.json", "--format", "json"]);
    assert.equal(sharePoint.report.exitCode, 0);
  });

  test("every connector completes the synthetic product journey", async () => {
    const fixture = JSON.parse(await readFile(FLOW_FIXTURE, "utf8")) as { claimClass: string; tenantRuntime: boolean; flows: Array<Record<string, unknown>> };
    assert.equal(fixture.claimClass, "RUNTIME_SYNTHETIC");
    assert.equal(fixture.tenantRuntime, false);
    const acceptance = [];
    for (const flow of fixture.flows) {
      const connector = String(flow.connector);
      const profileResult = await validateConnectorProfileFile(join(PROFILE_DIR, connector + ".profile.json"));
      assert.equal(profileResult.valid, true, connector + ": " + JSON.stringify(profileResult.diagnostics));
      const profile = profileResult.profile!;
      const contract = profileContract(profile);
      assert.equal(contract.pagination && (contract.pagination as Record<string, unknown>).mode, flow.paginationMode);
      const actions = flow.actions as Array<Record<string, unknown>>;
      assert.deepEqual(actions.map((item) => item.operation), ["read-record", "update-record", "read-record"]);
      const update = operation(profile, "update-record");
      const token = TOKEN_FIELDS[connector];
      const payload: Record<string, unknown> = { recordId: "synthetic-record", value: "updated", idempotencyKey: "synthetic-idempotency", [token]: "synthetic-version" };
      assert.equal(evaluateSyntheticPayload(profile, "update-record", payload), undefined);
      const permission = contract.permission as Record<string, unknown>;
      assert.equal(evaluateSyntheticPermissionReadback(profile, { status: 200, body: { principal: "synthetic-principal", role: permission.mutationRole, effective: true } }), undefined);
      const mode = String(flow.paginationMode);
      const pages = mode === "offset"
        ? [{ status: 200, items: ["first"], offset: 0 }, { status: 200, items: ["second"], offset: 50 }]
        : mode === "page-token"
          ? [{ status: 200, items: ["first"], token: "next-token" }, { status: 200, items: ["second"] }]
          : [{ status: 200, items: ["first"], continuation: "next-continuation" }, { status: 200, items: ["second"] }];
      assert.equal(evaluateSyntheticPaginationTrace(profile, pages), undefined);
      const trace = evaluateSyntheticConnectorTrace(profile, "update-record", {
        before: { status: 200, body: { recordId: "synthetic-record", value: "old", [token]: "synthetic-version" } },
        write: { status: 204 },
        readback: { status: 200, body: { recordId: "synthetic-record", value: "updated" } },
        expected: { recordId: "synthetic-record", value: "updated" },
      });
      assert.equal(trace, undefined, connector + ": synthetic mutation trace failed");
      assert.equal((update.mutationClosure as Record<string, unknown>).readback, true);
      acceptance.push({ connector, flowId: flow.flowId, claimClass: "RUNTIME_SYNTHETIC", status: "PASS" });
    }
    assert.equal(acceptance.length, 9);
    assert.equal(acceptance.every((item) => item.status === "PASS"), true);
  });

  test("automatic self-improvement captures audits promotes and consumes a lesson", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-product-learning-"));
    try {
      await mkdir(join(root, "knowledge/self-improvement/candidates"), { recursive: true });
      await mkdir(join(root, "tests"), { recursive: true });
      await mkdir(join(root, "docs"), { recursive: true });
      const prefix = "import { test } from \"node:test\";\n";
      await writeFile(join(root, "tests/red.test.ts"), prefix + "test(\"red product control\", () => {});\n", "utf8");
      await writeFile(join(root, "tests/green.test.ts"), prefix + "test(\"green product control\", () => {});\n", "utf8");
      await writeFile(join(root, "tests/positive.test.ts"), prefix + "test(\"positive product control\", () => {});\n", "utf8");
      await writeFile(join(root, "docs/source.md"), "WP20 synthetic source record\n", "utf8");
      await writeFile(join(root, "docs/review.md"), "Decision: APPROVED\nReviewer role: independent-luna-max-reviewer\nReview evidence: RED/GREEN/positive-control tests; local synthetic only.\n", "utf8");
      const candidatePath = join(root, "knowledge/self-improvement/candidates/product-status-readback.json");
      const candidate = {
        id: "product-status-readback",
        version: 1,
        status: "CANDIDATE",
        scope: ["power-automate", "connectors", "evidence"],
        trigger: { kind: "red-test", summary: "A product connector response must classify status before body and read back semantic state." },
        invariant: "Every product connector journey classifies status before body and requires semantic readback.",
        red: { path: "tests/red.test.ts", testName: "red product control", runner: "node-test", expectedExitCode: 0 },
        green: { path: "tests/green.test.ts", testName: "green product control", runner: "node-test", expectedExitCode: 0 },
        positiveControl: { path: "tests/positive.test.ts", testName: "positive product control", runner: "node-test", expectedExitCode: 0 },
        claimBoundary: "RUNTIME_SYNTHETIC",
        provenance: { workPackage: "WP-20", recordPath: "docs/source.md" },
        review: { decision: "PENDING", recordPath: "docs/review.md", reviewerRole: "pending" },
        privacy: "synthetic-public",
        lifecycle: { current: "CANDIDATE", history: [{ status: "CANDIDATE", recordPath: "docs/source.md" }] },
      };
      const registryPath = join(root, "knowledge/self-improvement/registry.json");
      const registryText = JSON.stringify({ schemaVersion: "1.0", registryId: "sharepoint-flow-engineering-kit-global", revision: 1, lessons: [] });
      await writeFile(registryPath, registryText, "utf8");
      await writeFile(join(root, "knowledge/self-improvement/registry.sha256"), createHash("sha256").update(registryText, "utf8").digest("hex") + "\n", "utf8");
      await captureLearningCandidate(root, candidatePath, candidate);
      const red = await auditLearningRegistry(root, registryPath, { executeBindings: true });
      assert.deepEqual(red.diagnostics.map(({ code }) => code), ["SELF_LEARNING_CANDIDATE_OPEN"]);
      await promoteLearningCandidate(root, candidatePath, "docs/review.md", "independent-luna-max-reviewer");
      const green = await auditLearningRegistry(root, registryPath, { executeBindings: true });
      assert.deepEqual(green.diagnostics, []);
      const consumed = await consumeApprovedLessons(root, registryPath, ["power-automate"]);
      assert.equal(consumed.length, 1);
      assert.equal(consumed[0]?.id, "product-status-readback");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("read-only plugin manifest, discovery, preflight, and forbidden operations pass", async () => {
    const manifest = await runReadonlyPlugin(ROOT, { operation: "getManifest" }) as Record<string, unknown>;
    assert.equal(manifest.pluginId, "spflow-readonly");
    assert.equal(manifest.networkMode, "offline");
    assert.equal(manifest.tenantMutation, false);
    const discovery = await runReadonlyPlugin(ROOT, { operation: "discover", connector: "excel" }) as Record<string, unknown>;
    assert.equal((discovery.flows as unknown[]).length, 1);
    const preflight = await runReadonlyPlugin(ROOT, { operation: "preflight" }) as Record<string, unknown>;
    assert.equal(preflight.flowCount, 9);
    for (const operation of FORBIDDEN_PLUGIN_OPERATIONS) await assert.rejects(runReadonlyPlugin(ROOT, { operation }), /READONLY_PLUGIN_FORBIDDEN_OPERATION/);
  });

  test("every connector journey fails closed on forbidden payload and failed write", async () => {
    const fixture = JSON.parse(await readFile(FLOW_FIXTURE, "utf8")) as { flows: Array<Record<string, unknown>> };
    for (const flow of fixture.flows) {
      const connector = String(flow.connector);
      const profileResult = await validateConnectorProfileFile(join(PROFILE_DIR, connector + ".profile.json"));
      const profile = profileResult.profile!;
      const token = TOKEN_FIELDS[connector];
      const forbidden = evaluateSyntheticPayload(profile, "update-record", { recordId: "synthetic-record", value: "bad", idempotencyKey: "idempotency", [token]: "version", accessToken: "forbidden" });
      assert.equal(forbidden?.code, "CONNECTOR_PAYLOAD_FORBIDDEN", connector);
      const failed = evaluateSyntheticConnectorTrace(profile, "update-record", {
        before: { status: 200, body: { recordId: "synthetic-record", value: "old", [token]: "version" } },
        write: { status: 500, body: { recordId: "synthetic-record" } },
        readback: { status: 200, body: { recordId: "synthetic-record", value: "bad" } },
        expected: { recordId: "synthetic-record", value: "bad" },
      });
      assert.equal(failed?.code, "CONNECTOR_TRACE_WRITE_FAILED", connector);
    }
  });
});
