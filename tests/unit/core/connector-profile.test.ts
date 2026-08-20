import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";

import { evaluateSyntheticConnectorTrace, getSyntheticConnectorAdapter, validateConnectorProfileFile } from "../../../packages/core/src/connector-profile.ts";

const ROOT = process.cwd();
const PROFILE_DIR = resolve(ROOT, "examples/minimal-public-app/connectors");

describe("connector-neutral synthetic profiles", () => {
  test("all supported connector profiles validate GREEN", async () => {
    const names = ["sharepoint", "excel", "power-apps", "dataverse", "outlook", "graph", "http", "sql", "approvals"];
    for (const name of names) {
      const result = await validateConnectorProfileFile(join(PROFILE_DIR, name + ".profile.json"));
      assert.equal(result.valid, true, name + ": " + JSON.stringify(result.diagnostics));
    }
  });

  test("connector-specific transport and concurrency bindings remain distinct", async () => {
    const expectedConcurrency: Record<string, string> = { sharepoint: "etag", excel: "row-version", dataverse: "version-token", "power-apps": "optimistic", outlook: "optimistic", graph: "optimistic", http: "optimistic", sql: "optimistic", approvals: "optimistic" };
    for (const name of Object.keys(expectedConcurrency)) {
      const result = await validateConnectorProfileFile(join(PROFILE_DIR, name + ".profile.json"));
      assert.equal(result.valid, true);
      const adapter = getSyntheticConnectorAdapter(name);
      assert.ok(adapter);
      assert.equal(adapter.transportMode, name === "http" ? "http" : "connector-action");
      assert.equal(adapter.mutationConcurrency, expectedConcurrency[name]);
      const operations = result.profile?.operations as Array<Record<string, unknown>>;
      const read = operations.find((operation) => operation.id === "read-record")!;
      const update = operations.find((operation) => operation.id === "update-record")!;
      const readTransport = read.transport as Record<string, unknown>;
      const updateTransport = update.transport as Record<string, unknown>;
      assert.equal(readTransport.mode, name === "http" ? "http" : "connector-action");
      assert.equal(updateTransport.mode, name === "http" ? "http" : "connector-action");
      assert.equal((update.concurrency as Record<string, unknown>).mode, expectedConcurrency[name]);
    }
  });

  test("permanent RED fixture rejects failed-status authority", async () => {
    const result = await validateConnectorProfileFile(resolve(ROOT, "fixtures/connectors/red/status-overlap.profile.json"));
    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_STATUS_OVERLAP"));
  });

  test("profile mutations fail closed for status, idempotency, and readback bypasses", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-connector-red-"));
    try {
      const source = JSON.parse(await readFile(join(PROFILE_DIR, "excel.profile.json"), "utf8"));
      source.operations[1].response.failureStatuses.push(200);
      source.operations[1].idempotency.required = false;
      source.operations[1].response.semanticReadback.fields = [];
      const path = join(root, "red.profile.json");
      await writeFile(path, JSON.stringify(source), "utf8");
      const result = await validateConnectorProfileFile(path);
      assert.equal(result.valid, false);
      assert.ok(result.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_STATUS_OVERLAP"));
      assert.ok(result.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_IDEMPOTENCY_MISSING"));
      assert.ok(result.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_READBACK_REQUIRED"));

      const binding = JSON.parse(await readFile(join(PROFILE_DIR, "excel.profile.json"), "utf8"));
      binding.operations[1].idempotency.keyFields = ["missingKey"];
      binding.operations[1].retry.retryableStatuses.push(418);
      binding.operations[1].request.required = binding.operations[1].request.required.filter((field: string) => field !== "RowVersion");
      binding.operations[1].preRead.fields = binding.operations[1].preRead.fields.filter((field: string) => field !== "RowVersion");
      const bindingPath = join(root, "binding-red.profile.json");
      await writeFile(bindingPath, JSON.stringify(binding), "utf8");
      const bindingResult = await validateConnectorProfileFile(bindingPath);
      assert.ok(bindingResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_IDEMPOTENCY_BINDING"));
      assert.ok(bindingResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_CONCURRENCY_BINDING"));
      assert.ok(bindingResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_RETRY_NOT_FAILURE"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("synthetic traces enforce status-before-body and mutation readback", async () => {
    const result = await validateConnectorProfileFile(join(PROFILE_DIR, "http.profile.json"));
    assert.equal(result.valid, true);
    const profile = result.profile!;
    assert.equal(evaluateSyntheticConnectorTrace(profile, "update-record", { before: { status: 200, body: { recordId: "synthetic", value: "old", version: "v1" } }, write: { status: 204 }, readback: { status: 200, body: { recordId: "synthetic", value: "new" } }, expected: { recordId: "synthetic", value: "new" } }), undefined);
    assert.equal(evaluateSyntheticConnectorTrace(profile, "update-record", { before: { status: 200, body: { recordId: "synthetic", value: "old", version: "v1" } }, write: { status: 500, body: { recordId: "synthetic" } }, readback: { status: 200, body: { recordId: "synthetic", value: "new" } } })?.code, "CONNECTOR_TRACE_WRITE_FAILED");
    assert.equal(evaluateSyntheticConnectorTrace(profile, "update-record", { before: { status: 200, body: { recordId: "synthetic", value: "old", version: "v1" } }, write: { status: 204 } })?.code, "CONNECTOR_TRACE_READBACK_MISSING");
    assert.equal(evaluateSyntheticConnectorTrace(profile, "update-record", { before: { status: 200, body: { recordId: "synthetic", value: "old", version: "v1" } }, write: { status: 204 }, readback: { status: 200, body: { recordId: "synthetic" } } })?.code, "CONNECTOR_TRACE_SEMANTIC_READBACK");
    assert.equal(evaluateSyntheticConnectorTrace(profile, "update-record", { before: { status: 200, body: { recordId: "synthetic", value: "old", version: "v1" } }, write: { status: 204 }, readback: { status: 200, body: { recordId: "synthetic", value: "wrong" } }, expected: { recordId: "synthetic", value: "new" } })?.code, "CONNECTOR_TRACE_SEMANTIC_READBACK_MISMATCH");
    assert.equal(evaluateSyntheticConnectorTrace(profile, "read-record", { before: { status: 500, body: { value: "decoy" } } })?.code, "CONNECTOR_TRACE_STATUS_FAILED");
    assert.equal(evaluateSyntheticConnectorTrace(profile, "read-record", { before: { status: 200, body: { recordId: "synthetic" } } })?.code, "CONNECTOR_TRACE_SEMANTIC_READBACK");
  });
});
