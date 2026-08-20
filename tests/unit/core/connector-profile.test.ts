import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";

import { evaluateSyntheticConnectorTrace, getSyntheticConnectorAdapter, validateConnectorProfileFile } from "../../../packages/core/src/connector-profile.ts";
import { evaluateSyntheticPayload, evaluateSyntheticPermissionReadback, evaluateSyntheticPaginationTrace } from "../../../packages/core/src/connector-runtime-harness.ts";

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
      const connectorContract = result.profile?.connectorContract as Record<string, unknown>;
      assert.equal(connectorContract.connectionKind, adapter.connectionKind);
      const nativeOperations = connectorContract.nativeOperations as Record<string, unknown>;
      assert.equal(nativeOperations.read, adapter.nativeReadOperation);
      assert.equal(nativeOperations.mutation, adapter.nativeMutationOperation);
      const permission = connectorContract.permission as Record<string, unknown>;
      assert.equal(permission.required, true);
      assert.equal(permission.mutationRole, adapter.mutationRole);
      const pagination = connectorContract.pagination as Record<string, unknown>;
      assert.equal(pagination.mode, adapter.paginationMode);
      const payload = connectorContract.payload as Record<string, unknown>;
      assert.equal(payload.mode, adapter.payloadMode);
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

      const contractRed = JSON.parse(await readFile(join(PROFILE_DIR, "excel.profile.json"), "utf8"));
      contractRed.connectorContract.nativeOperations.mutation = "WrongMutation";
      contractRed.connectorContract.pagination.mode = "page-token";
      contractRed.connectorContract.payload.mode = "future";
      const contractPath = join(root, "contract-red.profile.json");
      await writeFile(contractPath, JSON.stringify(contractRed), "utf8");
      const contractResult = await validateConnectorProfileFile(contractPath);
      assert.ok(contractResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_NATIVE_OPERATIONS"));
      assert.ok(contractResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_PAGINATION_CONTRACT"));
      assert.ok(contractResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_PAYLOAD_CONTRACT"));

      contractRed.connectorContract.permission.readbackFields = ["principal"];
      contractRed.connectorContract.pagination.pageSize = 25;
      contractRed.connectorContract.payload.requiredFields = ["recordId"];
      contractRed.connectorContract.payload.forbiddenFields = ["tenantId"];
      const dimensionPath = join(root, "dimension-red.profile.json");
      await writeFile(dimensionPath, JSON.stringify(contractRed), "utf8");
      const dimensionResult = await validateConnectorProfileFile(dimensionPath);
      assert.ok(dimensionResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_PERMISSION_CONTRACT"));
      assert.ok(dimensionResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_PAGINATION_CONTRACT"));
      assert.ok(dimensionResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_PAYLOAD_CONTRACT"));

      const readMismatch = JSON.parse(await readFile(join(PROFILE_DIR, "excel.profile.json"), "utf8"));
      readMismatch.operations[0].transport.action = "WrongRead";
      const readMismatchPath = join(root, "native-read-red.profile.json");
      await writeFile(readMismatchPath, JSON.stringify(readMismatch), "utf8");
      const readMismatchResult = await validateConnectorProfileFile(readMismatchPath);
      assert.ok(readMismatchResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_NATIVE_OPERATION"));

      const mutationMismatch = JSON.parse(await readFile(join(PROFILE_DIR, "excel.profile.json"), "utf8"));
      mutationMismatch.operations[1].transport.action = "WrongMutation";
      const mutationMismatchPath = join(root, "native-mutation-red.profile.json");
      await writeFile(mutationMismatchPath, JSON.stringify(mutationMismatch), "utf8");
      const mutationMismatchResult = await validateConnectorProfileFile(mutationMismatchPath);
      assert.ok(mutationMismatchResult.diagnostics.some(({ code }) => code === "CONNECTOR_PROFILE_NATIVE_OPERATION"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("synthetic payload, permission, and pagination gates are executable", async () => {
    const excelResult = await validateConnectorProfileFile(join(PROFILE_DIR, "excel.profile.json"));
    const excel = excelResult.profile!;
    assert.equal(evaluateSyntheticPayload(excel, "update-record", { recordId: "row-1", value: "new", idempotencyKey: "idem-1", RowVersion: "v1" }), undefined);
    assert.equal(evaluateSyntheticPayload(excel, "update-record", { recordId: "row-1", value: "new", idempotencyKey: "idem-1", RowVersion: "v1", rawQuery: "SELECT *" })?.code, "CONNECTOR_PAYLOAD_FORBIDDEN");
    assert.equal(evaluateSyntheticPayload(excel, "update-record", { recordId: "row-1", value: "new", RowVersion: "v1" })?.code, "CONNECTOR_PAYLOAD_REQUIRED_MISSING");
    assert.equal(evaluateSyntheticPermissionReadback(excel, { status: 200, body: { principal: "synthetic", role: "workbook-table-write", effective: true } }), undefined);
    assert.equal(evaluateSyntheticPermissionReadback(excel, { status: 500, body: { principal: "synthetic", role: "workbook-table-write", effective: true } })?.code, "CONNECTOR_PERMISSION_STATUS_FAILED");
    assert.equal(evaluateSyntheticPermissionReadback(excel, { status: 200, body: { principal: "synthetic", effective: true } })?.code, "CONNECTOR_PERMISSION_READBACK");
    assert.equal(evaluateSyntheticPermissionReadback(excel, { status: 200, body: { principal: "synthetic", role: "wrong-role", effective: true } })?.code, "CONNECTOR_PERMISSION_ROLE_MISMATCH");
    assert.equal(evaluateSyntheticPermissionReadback(excel, { status: 200, body: { principal: "synthetic", role: "workbook-table-write", effective: "yes" } })?.code, "CONNECTOR_PERMISSION_EFFECTIVE_INVALID");
    assert.equal(evaluateSyntheticPaginationTrace(excel, [{ status: 200, items: [1], offset: 0 }, { status: 200, items: [2], offset: 50 }]), undefined);
    assert.equal(evaluateSyntheticPaginationTrace(excel, [{ status: 200, items: [1], offset: 1 }])?.code, "CONNECTOR_PAGINATION_OFFSET");
    const httpResult = await validateConnectorProfileFile(join(PROFILE_DIR, "http.profile.json"));
    const http = httpResult.profile!;
    assert.equal(evaluateSyntheticPaginationTrace(http, [{ status: 200, items: [1], continuation: "next-1" }, { status: 200, items: [2] }]), undefined);
    assert.equal(evaluateSyntheticPaginationTrace(http, [{ status: 200, items: [1], continuation: "same" }, { status: 200, items: [2], continuation: "same" }])?.code, "CONNECTOR_PAGINATION_CONTINUATION_CYCLE");
    const approvalsResult = await validateConnectorProfileFile(join(PROFILE_DIR, "approvals.profile.json"));
    const approvals = approvalsResult.profile!;
    assert.equal(evaluateSyntheticPaginationTrace(approvals, [{ status: 200, items: [1], token: "next-1" }, { status: 200, items: [2] }]), undefined);
    assert.equal(evaluateSyntheticPaginationTrace(approvals, [{ status: 200, items: [1] }, { status: 200, items: [2] }])?.code, "CONNECTOR_PAGINATION_TOKEN_MISSING");
    assert.equal(evaluateSyntheticPaginationTrace(approvals, [{ status: 200, items: [1], token: "same" }, { status: 200, items: [2], token: "same" }])?.code, "CONNECTOR_PAGINATION_TOKEN_CYCLE");
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
