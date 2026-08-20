import type { ConnectorDiagnostic } from "./connector-profile.ts";

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function present(body: unknown, fields: unknown): boolean {
  const object = record(body);
  return strings(fields) && object !== undefined && fields.every((field) => Object.prototype.hasOwnProperty.call(object, field));
}

function fail(code: string, path: string, message: string): ConnectorDiagnostic {
  return { code, path, message };
}

export function evaluateSyntheticPayload(profile: Record<string, unknown>, operationId: string, payload: unknown): ConnectorDiagnostic | undefined {
  const operation = (Array.isArray(profile.operations) ? profile.operations : []).map(record).find((candidate) => candidate?.id === operationId);
  if (operation === undefined) return fail("CONNECTOR_PAYLOAD_OPERATION_UNKNOWN", "/operationId", "Payload operation is not declared by the connector profile.");
  const request = record(operation.request);
  const contract = record(profile.connectorContract);
  const payloadPolicy = record(contract?.payload);
  const object = record(payload);
  if (object === undefined) return fail("CONNECTOR_PAYLOAD_NOT_OBJECT", "/payload", "Synthetic payload must be an object.");
  const allowlist = strings(request?.allowlist) ? request.allowlist : [];
  const required = strings(request?.required) ? request.required : [];
  const forbidden = new Set([...(strings(request?.forbidden) ? request.forbidden : []), ...(strings(payloadPolicy?.forbiddenFields) ? payloadPolicy.forbiddenFields : [])]);
  const policyRequired = strings(payloadPolicy?.requiredFields) ? payloadPolicy.requiredFields : [];
  if (required.some((field) => !Object.prototype.hasOwnProperty.call(object, field))) return fail("CONNECTOR_PAYLOAD_REQUIRED_MISSING", "/payload", "Required operation payload field is missing.");
  if (operation.kind !== "read" && policyRequired.some((field) => !Object.prototype.hasOwnProperty.call(object, field))) return fail("CONNECTOR_PAYLOAD_POLICY_REQUIRED", "/payload", "Connector payload policy field is missing from the mutation payload.");
  for (const key of Object.keys(object)) {
    if (forbidden.has(key)) return fail("CONNECTOR_PAYLOAD_FORBIDDEN", "/payload/" + key, "Forbidden payload field is present.");
    if (!allowlist.includes(key)) return fail("CONNECTOR_PAYLOAD_NOT_ALLOWLISTED", "/payload/" + key, "Payload field is not allowlisted by the operation.");
  }
  return undefined;
}

export interface SyntheticPermissionTrace {
  readonly status: number;
  readonly body?: unknown;
}

export function evaluateSyntheticPermissionReadback(profile: Record<string, unknown>, trace: SyntheticPermissionTrace): ConnectorDiagnostic | undefined {
  const contract = record(profile.connectorContract);
  const permission = record(contract?.permission);
  const fields = permission?.readbackFields;
  if (trace.status < 200 || trace.status >= 300) return fail("CONNECTOR_PERMISSION_STATUS_FAILED", "/status", "Permission readback requires a successful response status.");
  if (!present(trace.body, fields)) return fail("CONNECTOR_PERMISSION_READBACK", "/body", "Permission readback is missing declared principal, role, or effective fields.");
  const body = record(trace.body);
  if (body?.role !== permission?.mutationRole) return fail("CONNECTOR_PERMISSION_ROLE_MISMATCH", "/body/role", "Permission readback role does not match the connector contract.");
  if (typeof body?.effective !== "boolean") return fail("CONNECTOR_PERMISSION_EFFECTIVE_INVALID", "/body/effective", "Permission effective readback must be boolean.");
  return undefined;
}

export interface SyntheticPaginationPage {
  readonly status: number;
  readonly items: readonly unknown[];
  readonly continuation?: string;
  readonly token?: string;
  readonly offset?: number;
}

export function evaluateSyntheticPaginationTrace(profile: Record<string, unknown>, pages: readonly SyntheticPaginationPage[]): ConnectorDiagnostic | undefined {
  const contract = record(profile.connectorContract);
  const pagination = record(contract?.pagination);
  const mode = pagination?.mode;
  const pageSize = typeof pagination?.pageSize === "number" ? pagination.pageSize : 0;
  const readOperation = (Array.isArray(profile.operations) ? profile.operations : []).map(record).find((candidate) => candidate?.id === "read-record");
  const response = record(readOperation?.response);
  const success = Array.isArray(response?.successStatuses) ? response.successStatuses : [];
  if (pages.length === 0) return fail("CONNECTOR_PAGINATION_EMPTY", "/pages", "Pagination trace must contain at least one page.");
  const seen = new Set<string>();
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page === undefined) return fail("CONNECTOR_PAGINATION_PAGE_MISSING", "/pages/" + index, "Pagination trace page is missing.");
    if (!success.includes(page.status)) return fail("CONNECTOR_PAGINATION_STATUS", "/pages/" + index + "/status", "Pagination cannot consume a failed response.");
    if (!Array.isArray(page.items) || page.items.length > pageSize) return fail("CONNECTOR_PAGINATION_BODY", "/pages/" + index + "/items", "Pagination page body must be an array within the declared page size.");
    const last = index === pages.length - 1;
    if (mode === "none" && pages.length !== 1) return fail("CONNECTOR_PAGINATION_UNEXPECTED", "/pages", "A non-paginated connector cannot return multiple pages.");
    if (mode === "continuation-url") {
      if (!last && typeof page.continuation !== "string") return fail("CONNECTOR_PAGINATION_CONTINUATION_MISSING", "/pages/" + index + "/continuation", "A non-final continuation page requires a continuation value.");
      if (page.continuation !== undefined && seen.has(page.continuation)) return fail("CONNECTOR_PAGINATION_CONTINUATION_CYCLE", "/pages/" + index + "/continuation", "Continuation values must not repeat.");
      if (page.continuation !== undefined) seen.add(page.continuation);
      if (last && page.continuation !== undefined) return fail("CONNECTOR_PAGINATION_CONTINUATION_FINAL", "/pages/" + index + "/continuation", "The final page must not advertise another continuation.");
    }
    if (mode === "page-token") {
      if (!last && typeof page.token !== "string") return fail("CONNECTOR_PAGINATION_TOKEN_MISSING", "/pages/" + index + "/token", "A non-final token page requires a page token.");
      if (page.token !== undefined && seen.has(page.token)) return fail("CONNECTOR_PAGINATION_TOKEN_CYCLE", "/pages/" + index + "/token", "Page tokens must not repeat.");
      if (page.token !== undefined) seen.add(page.token);
      if (last && page.token !== undefined) return fail("CONNECTOR_PAGINATION_TOKEN_FINAL", "/pages/" + index + "/token", "The final page must not advertise another token.");
    }
    if (mode === "offset" && (typeof page.offset !== "number" || page.offset !== index * pageSize)) return fail("CONNECTOR_PAGINATION_OFFSET", "/pages/" + index + "/offset", "Offset pages must start at zero and advance by page size.");
  }
  return undefined;
}
