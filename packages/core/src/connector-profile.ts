import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";

export const SUPPORTED_CONNECTORS = [
  "sharepoint", "excel", "power-apps", "dataverse", "outlook",
  "graph", "http", "sql", "approvals",
] as const;

export interface ConnectorDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ConnectorValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly ConnectorDiagnostic[];
  readonly profile?: Record<string, unknown>;
}

export interface SyntheticConnectorResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface SyntheticConnectorTrace {
  readonly before?: SyntheticConnectorResponse;
  readonly write?: SyntheticConnectorResponse;
  readonly readback?: SyntheticConnectorResponse;
  readonly expected?: Record<string, unknown>;
}

const SCHEMA_PATH = resolve(import.meta.dirname, "../../../contracts/connector-profile.schema.json");

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function add(diagnostics: ConnectorDiagnostic[], code: string, path: string, message: string): void {
  diagnostics.push({ code, path, message });
}

function semanticDiagnostics(profile: Record<string, unknown>): ConnectorDiagnostic[] {
  const diagnostics: ConnectorDiagnostic[] = [];
  const connector = profile.connector;
  if (typeof connector !== "string" || (!SUPPORTED_CONNECTORS.includes(connector as never) && connector !== "custom" && !connector.startsWith("future-"))) {
    add(diagnostics, "CONNECTOR_PROFILE_UNKNOWN_CONNECTOR", "/connector", "Connector must be supported or explicitly future/custom.");
  }
  const operations = Array.isArray(profile.operations) ? profile.operations : [];
  const ids = new Set<string>();
  operations.forEach((raw, index) => {
    const path = "/operations/" + index;
    const operation = record(raw);
    if (operation === undefined) return;
    const id = operation.id;
    if (typeof id !== "string" || ids.has(id)) add(diagnostics, "CONNECTOR_PROFILE_OPERATION_DUPLICATE", path + "/id", "Operation IDs must be unique.");
    else ids.add(id);
    const kind = operation.kind;
    const transport = record(operation.transport);
    const request = record(operation.request);
    const response = record(operation.response);
    const concurrency = record(operation.concurrency);
    const retry = record(operation.retry);
    const idempotency = record(operation.idempotency);
    const closure = record(operation.mutationClosure);
    const preRead = record(operation.preRead);
    if (transport?.mode === "connector-action" && (transport.method !== "ACTION" || typeof transport.action !== "string")) add(diagnostics, "CONNECTOR_PROFILE_ACTION_TRANSPORT", path + "/transport", "Connector-action transport requires ACTION and a named action.");
    if (transport?.mode === "http" && (transport.method === "ACTION" || transport.action !== undefined)) add(diagnostics, "CONNECTOR_PROFILE_HTTP_TRANSPORT", path + "/transport", "HTTP transport requires an HTTP method and cannot declare a connector action.");
    const allowlist = request !== undefined && stringArray(request.allowlist) ? request.allowlist : undefined;
    const required = request !== undefined && stringArray(request.required) ? request.required : undefined;
    if (allowlist !== undefined && required !== undefined) {
      if (required.some((field) => !allowlist.includes(field))) add(diagnostics, "CONNECTOR_PROFILE_REQUEST_NOT_ALLOWLISTED", path + "/request/required", "Required request fields must be allowlisted.");
      if (request !== undefined && stringArray(request.forbidden) && request.forbidden.some((field) => allowlist.includes(field))) add(diagnostics, "CONNECTOR_PROFILE_REQUEST_CONFLICT", path + "/request/forbidden", "Forbidden request fields cannot be allowlisted.");
    }
    if (response !== undefined) {
      const success = Array.isArray(response.successStatuses) ? response.successStatuses : [];
      const failure = Array.isArray(response.failureStatuses) ? response.failureStatuses : [];
      if (success.some((status) => failure.includes(status))) add(diagnostics, "CONNECTOR_PROFILE_STATUS_OVERLAP", path + "/response", "Success and failure statuses must be disjoint.");
      const readback = record(response.semanticReadback);
      if (kind !== "read" && (readback?.required !== true || !stringArray(readback.fields) || readback.fields.length === 0)) add(diagnostics, "CONNECTOR_PROFILE_READBACK_REQUIRED", path + "/response/semanticReadback", "Mutations require non-empty semantic readback fields.");
    }
    const retryableStatuses = retry !== undefined && Array.isArray(retry.retryableStatuses) ? retry.retryableStatuses : undefined;
    const successStatuses = response !== undefined && Array.isArray(response.successStatuses) ? response.successStatuses : undefined;
    const failureStatuses = response !== undefined && Array.isArray(response.failureStatuses) ? response.failureStatuses : undefined;
    if (retryableStatuses !== undefined && successStatuses !== undefined && retryableStatuses.some((status) => successStatuses.includes(status))) add(diagnostics, "CONNECTOR_PROFILE_RETRY_SUCCESS_OVERLAP", path + "/retry/retryableStatuses", "Retryable statuses cannot be successful statuses.");
    if (retryableStatuses !== undefined && failureStatuses !== undefined && retryableStatuses.some((status) => !failureStatuses.includes(status))) add(diagnostics, "CONNECTOR_PROFILE_RETRY_NOT_FAILURE", path + "/retry/retryableStatuses", "Every retryable status must be declared as a failure status.");
    if (kind !== "read") {
      if (transport?.method === "GET") add(diagnostics, "CONNECTOR_PROFILE_MUTATION_GET", path + "/transport/method", "A mutation cannot use GET.");
      const preReadFields = preRead !== undefined && stringArray(preRead.fields) ? preRead.fields : undefined;
      const keyFields = idempotency !== undefined && stringArray(idempotency.keyFields) ? idempotency.keyFields : undefined;
      if (idempotency?.required !== true || keyFields === undefined || keyFields.length === 0) add(diagnostics, "CONNECTOR_PROFILE_IDEMPOTENCY_MISSING", path + "/idempotency", "Mutations require idempotency key fields.");
      else if (allowlist === undefined || required === undefined || keyFields.some((field) => !allowlist.includes(field) || !required.includes(field))) add(diagnostics, "CONNECTOR_PROFILE_IDEMPOTENCY_BINDING", path + "/idempotency/keyFields", "Every idempotency key must be required by the request contract.");
      if (preRead?.required !== true || preReadFields === undefined || preReadFields.length === 0) add(diagnostics, "CONNECTOR_PROFILE_PREREAD_REQUIRED", path + "/preRead", "Mutations require explicit pre-read fields.");
      const tokenField = concurrency !== undefined && typeof concurrency.tokenField === "string" ? concurrency.tokenField : undefined;
      if (concurrency?.mode !== "none" && tokenField !== undefined && (preReadFields === undefined || !preReadFields.includes(tokenField) || allowlist === undefined || required === undefined || !allowlist.includes(tokenField) || !required.includes(tokenField))) add(diagnostics, "CONNECTOR_PROFILE_CONCURRENCY_BINDING", path + "/concurrency/tokenField", "The concurrency token must be required by both pre-read and request contracts.");
      if (closure?.plan !== true || closure.status !== true || closure.audit !== true || closure.readback !== true) add(diagnostics, "CONNECTOR_PROFILE_MUTATION_CLOSURE", path + "/mutationClosure", "Mutations require plan, status, audit, and readback closure.");
      if (retry?.ambiguousMutation !== "reconcile" && retry?.ambiguousMutation !== "fail") add(diagnostics, "CONNECTOR_PROFILE_AMBIGUOUS_RETRY", path + "/retry/ambiguousMutation", "Mutations require explicit ambiguous-response handling.");
    } else if (closure?.plan === true || closure?.audit === true) {
      add(diagnostics, "CONNECTOR_PROFILE_READ_MUTATION_CLOSURE", path + "/mutationClosure", "Read operations cannot claim mutation closure.");
    }
    if (concurrency?.mode !== "none" && (concurrency === undefined || typeof concurrency.tokenField !== "string")) add(diagnostics, "CONNECTOR_PROFILE_CONCURRENCY_TOKEN", path + "/concurrency/tokenField", "A concurrency mode requires a token field.");
  });
  return diagnostics;
}

export async function validateConnectorProfileFile(path: string): Promise<ConnectorValidationResult> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return { valid: false, diagnostics: [{ code: "CONNECTOR_PROFILE_UNREADABLE", path, message: "Connector profile is not readable JSON." }] };
  }
  try {
    const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8")) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    const validate = ajv.compile(schema);
    const diagnostics: ConnectorDiagnostic[] = [];
    if (!validate(value)) for (const error of validate.errors ?? []) add(diagnostics, "CONNECTOR_PROFILE_SCHEMA_INVALID", error.instancePath || "/", error.message ?? "Profile schema validation failed.");
    const profile = record(value);
    if (profile !== undefined) diagnostics.push(...semanticDiagnostics(profile));
    return { valid: diagnostics.length === 0, diagnostics, ...(profile === undefined ? {} : { profile }) };
  } catch {
    return { valid: false, diagnostics: [{ code: "CONNECTOR_PROFILE_SCHEMA_UNAVAILABLE", path: SCHEMA_PATH, message: "Connector profile schema could not be loaded." }] };
  }
}

function bodyShapeMatches(body: unknown, shape: unknown): boolean {
  if (shape === "none") return body === undefined;
  if (shape === "object") return body !== null && typeof body === "object" && !Array.isArray(body);
  if (shape === "array") return Array.isArray(body);
  return false;
}

function fieldsPresent(body: unknown, fields: unknown): boolean {
  if (!stringArray(fields) || body === null || typeof body !== "object" || Array.isArray(body)) return false;
  return fields.every((field) => Object.prototype.hasOwnProperty.call(body, field));
}

function fieldsEqual(body: unknown, fields: unknown, expected: Record<string, unknown> | undefined): boolean {
  if (expected === undefined || !stringArray(fields) || body === null || typeof body !== "object" || Array.isArray(body)) return false;
  return fields.every((field) => JSON.stringify((body as Record<string, unknown>)[field]) === JSON.stringify(expected[field]));
}

function traceBodyDiagnostic(item: SyntheticConnectorResponse, response: Record<string, unknown> | undefined, path: string, allowEmpty204 = false): ConnectorDiagnostic | undefined {
  if (allowEmpty204 && item.status === 204 && item.body === undefined) return undefined;
  if (!bodyShapeMatches(item.body, response?.body)) return { code: "CONNECTOR_TRACE_BODY_SHAPE", path: path + "/body", message: "Successful response body does not match the declared profile shape." };
  return undefined;
}

export function evaluateSyntheticConnectorTrace(profile: Record<string, unknown>, operationId: string, trace: SyntheticConnectorTrace): ConnectorDiagnostic | undefined {
  const operations = Array.isArray(profile.operations) ? profile.operations : [];
  const operation = operations.map(record).find((candidate) => candidate?.id === operationId);
  if (operation === undefined) return { code: "CONNECTOR_TRACE_OPERATION_UNKNOWN", path: "/operationId", message: "Synthetic trace operation is not declared by the profile." };
  const response = record(operation.response);
  const success = Array.isArray(response?.successStatuses) ? response.successStatuses : [];
  const kind = operation.kind;
  const preRead = record(operation.preRead);
  const preReadFields = preRead?.fields;
  const readback = record(response?.semanticReadback);
  const fields = readback?.fields;
  const isSuccess = (item: SyntheticConnectorResponse | undefined): boolean => item !== undefined && success.includes(item.status);
  if (kind === "read") {
    if (!isSuccess(trace.before)) return { code: "CONNECTOR_TRACE_STATUS_FAILED", path: "/before/status", message: "Read trace must pass status validation before body use." };
    const bodyError = traceBodyDiagnostic(trace.before!, response, "/before");
    if (bodyError !== undefined) return bodyError;
    if (!fieldsPresent(trace.before!.body, fields)) return { code: "CONNECTOR_TRACE_SEMANTIC_READBACK", path: "/before/body", message: "Read trace body is missing declared semantic fields." };
    return undefined;
  }
  if (!isSuccess(trace.before)) return { code: "CONNECTOR_TRACE_PREFLIGHT_FAILED", path: "/before/status", message: "Mutation trace requires a successful authoritative pre-read." };
  if (!bodyShapeMatches(trace.before!.body, "object") || !fieldsPresent(trace.before!.body, preReadFields)) return { code: "CONNECTOR_TRACE_PREFLIGHT_BODY", path: "/before/body", message: "Mutation pre-read must contain the declared pre-read fields, including concurrency authority." };
  if (!isSuccess(trace.write)) return { code: "CONNECTOR_TRACE_WRITE_FAILED", path: "/write/status", message: "Mutation trace cannot succeed after a failed write response." };
  const writeBodyError = traceBodyDiagnostic(trace.write!, response, "/write", true);
  if (writeBodyError !== undefined) return writeBodyError;
  if (readback?.required === true && !isSuccess(trace.readback)) return { code: "CONNECTOR_TRACE_READBACK_MISSING", path: "/readback/status", message: "Mutation trace requires successful semantic readback." };
  if (readback?.required === true) {
    const readbackBodyError = traceBodyDiagnostic(trace.readback!, response, "/readback");
    if (readbackBodyError !== undefined) return readbackBodyError;
    if (!fieldsPresent(trace.readback!.body, fields)) return { code: "CONNECTOR_TRACE_SEMANTIC_READBACK", path: "/readback/body", message: "Readback body is missing declared semantic fields." };
    if (trace.expected === undefined) return { code: "CONNECTOR_TRACE_EXPECTED_READBACK_MISSING", path: "/expected", message: "Synthetic mutation readback requires expected field values for semantic comparison." };
    if (!fieldsEqual(trace.readback!.body, fields, trace.expected)) return { code: "CONNECTOR_TRACE_SEMANTIC_READBACK_MISMATCH", path: "/readback/body", message: "Readback fields do not match the expected semantic values." };
  }
  return undefined;
}
