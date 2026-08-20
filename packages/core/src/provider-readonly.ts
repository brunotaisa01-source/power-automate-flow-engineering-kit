import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import type { Diagnostic, ValidationResult } from "./types/diagnostics.js";

export const READONLY_PROVIDER_SCHEMA_VERSION = "1.0" as const;
export const READONLY_PROVIDER_OPERATIONS = [
  "read-environment",
  "read-solution",
  "read-flow",
  "read-connection-reference",
] as const;
export const FORBIDDEN_PROVIDER_OPERATIONS = [
  "import",
  "rebind",
  "publish",
  "enable",
  "trigger",
  "update",
  "delete",
] as const;

export type ReadonlyProviderOperation =
  | (typeof READONLY_PROVIDER_OPERATIONS)[number]
  | string;
export type ReadonlyProviderForbiddenOperation =
  | (typeof FORBIDDEN_PROVIDER_OPERATIONS)[number]
  | string;

export interface ReadonlyProviderAdapter {
  readonly id: "spflow.provider-readonly";
  readonly mode: "read-only";
  readonly networkMode: "offline";
  readonly tenantMutation: false;
}

export interface ReadonlyProviderEnvironment {
  readonly id: string;
  readonly displayName: string;
  readonly identityCorrelation: string;
}

export interface ReadonlyProviderSolution {
  readonly id: string;
  readonly uniqueName: string;
  readonly displayName: string;
  readonly version: string;
  readonly identityCorrelation: string;
  readonly state: "present";
}

export interface ReadonlyProviderFlow {
  readonly id: string;
  readonly displayName: string;
  readonly state: "present" | "disabled";
  readonly identityCorrelation: string;
  readonly connectionReferenceIds: readonly string[];
}

export interface ReadonlyProviderConnectionReference {
  readonly id: string;
  readonly displayName: string;
  readonly connector: string;
  readonly state: "resolved";
  readonly identityCorrelation: string;
  readonly matchCount: 1;
  readonly flowIds: readonly string[];
}

export interface ReadonlyProviderCapabilities {
  readonly mode: "read-only";
  readonly networkMode: "offline";
  readonly tenantMutation: false;
  readonly operations: readonly ReadonlyProviderOperation[];
  readonly forbiddenOperations: readonly ReadonlyProviderForbiddenOperation[];
}

export interface ReadonlyProviderReadback {
  readonly authority: "provider" | "uat";
  readonly status: "PASS";
  readonly identityCorrelation: string;
  readonly observedFields: readonly string[];
}

export interface ReadonlyProviderLocalEvidence {
  readonly claimClass: "LOCAL_SYNTHETIC";
  readonly status: "PASS" | "FAIL" | "NOT_RUN";
}

export interface ReadonlyProviderExternalEvidence {
  readonly claimClass: "PROVIDER" | "UAT";
  readonly status: "PASS" | "FAIL" | "NOT_VERIFIED";
  readonly authoritativeReadback?: ReadonlyProviderReadback;
}

export interface ReadonlyProviderEvidence {
  readonly local: ReadonlyProviderLocalEvidence;
  readonly provider: ReadonlyProviderExternalEvidence;
  readonly uat: ReadonlyProviderExternalEvidence;
}

export interface ReadonlyProviderSnapshot {
  readonly schemaVersion: typeof READONLY_PROVIDER_SCHEMA_VERSION;
  readonly claimClass: "LOCAL_SYNTHETIC" | "PROVIDER_READBACK";
  readonly identityCorrelation: string;
  readonly adapter: ReadonlyProviderAdapter;
  readonly environment: ReadonlyProviderEnvironment;
  readonly solution: ReadonlyProviderSolution;
  readonly flows: readonly ReadonlyProviderFlow[];
  readonly connectionReferences: readonly ReadonlyProviderConnectionReference[];
  readonly capabilities: ReadonlyProviderCapabilities;
  readonly evidence: ReadonlyProviderEvidence;
}

export type ReadonlyProviderDiagnostic = Diagnostic;

export interface ReadonlyProviderValidationResult extends ValidationResult {
  readonly diagnostics: ReadonlyProviderDiagnostic[];
}

type JsonRecord = Record<string, unknown>;

const SCHEMA_PATH = resolve(
  import.meta.dirname,
  "../../../contracts/provider-readonly.schema.json",
);
const READONLY_PROVIDER_OPERATION_SET = new Set<string>(READONLY_PROVIDER_OPERATIONS);
const REQUIRED_FORBIDDEN_OPERATIONS = new Set<string>(FORBIDDEN_PROVIDER_OPERATIONS);
const SECRET_KEY_MARKERS = [
  "access_token",
  "authorization",
  "client_secret",
  "cookie",
  "credential",
  "password",
  "rawpayload",
  "rawresponse",
  "refresh_token",
  "requestbody",
  "responsebody",
  "secret",
  "token",
] as const;
const SECRET_VALUE_PATTERNS = [
  /\bbearer\s+\S+/i,
  /\b(?:access|client|refresh|session)[ _-]?token\b/i,
  /\b(?:api|private)[ _-]?key\b/i,
  /\b(?:sk|pk|ghp|xox[baprs])_[A-Za-z0-9_-]{10,}\b/i,
  /-----BEGIN [A-Z ]+-----/i,
  /\bhttps?:\/\//i,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function jsonPointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function add(
  diagnostics: ReadonlyProviderDiagnostic[],
  code: string,
  path: string,
  message: string,
): void {
  diagnostics.push({ code, path, message });
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  const compareText = (first: string, second: string): number => first < second ? -1 : first > second ? 1 : 0;
  return compareText(left.code, right.code)
    || compareText(left.path, right.path)
    || compareText(left.message, right.message);
}

function isJsonSafe(value: unknown, ancestors = new Set<object>()): boolean {
  try {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return true;
    }
    if (typeof value === "number") {
      return Number.isFinite(value);
    }
    if (typeof value !== "object") {
      return false;
    }

    const object = value as object;
    if (ancestors.has(object)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(object);
    if (Array.isArray(object)) {
      if (prototype !== Array.prototype) {
        return false;
      }
    } else if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }

    ancestors.add(object);
    for (const key of Object.keys(object)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor === undefined || !("value" in descriptor) || !isJsonSafe(descriptor.value, ancestors)) {
        return false;
      }
    }
    ancestors.delete(object);
    return true;
  } catch {
    return false;
  }
}

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll("-", "_");
  return SECRET_KEY_MARKERS.some((marker) => normalized.includes(marker));
}

function isSecretLikeString(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function scanForSecretLikeValues(
  value: unknown,
  path: string,
  diagnostics: ReadonlyProviderDiagnostic[],
): void {
  if (typeof value === "string") {
    if (isSecretLikeString(value)) {
      add(
        diagnostics,
        "READONLY_PROVIDER_SECRET_VALUE",
        path,
        "Secret-like, URL, email, token, or tenant identifier values are forbidden in a provider snapshot.",
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForSecretLikeValues(item, `${path}/${index}`, diagnostics));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const childPath = `${path}/${jsonPointerSegment(key)}`;
    if (isSecretKey(key)) {
      add(
        diagnostics,
        "READONLY_PROVIDER_SECRET_VALUE",
        childPath,
        "Secret-bearing and raw-payload fields are forbidden in a provider snapshot.",
      );
    }
    scanForSecretLikeValues(item, childPath, diagnostics);
  }
}

function loadSchemaValidator(): ValidateFunction<unknown> | undefined {
  try {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    return ajv.compile<unknown>(schema);
  } catch {
    return undefined;
  }
}

function schemaDiagnostics(
  validate: ValidateFunction<unknown>,
  snapshot: unknown,
): ReadonlyProviderDiagnostic[] {
  if (validate(snapshot)) {
    return [];
  }
  return (validate.errors ?? []).map((error: ErrorObject) => ({
    code: "READONLY_PROVIDER_SCHEMA_INVALID",
    path: error.instancePath || "/",
    message: `Provider read-only snapshot schema ${error.message ?? "validation failed"}.`,
  }));
}

function mutationVerb(value: unknown): boolean {
  return typeof value !== "string" || !READONLY_PROVIDER_OPERATION_SET.has(value);
}

function semanticDiagnostics(snapshot: JsonRecord): ReadonlyProviderDiagnostic[] {
  const diagnostics: ReadonlyProviderDiagnostic[] = [];
  const correlation = snapshot.identityCorrelation;

  if (!isNonEmptyString(correlation)) {
    add(
      diagnostics,
      "READONLY_PROVIDER_IDENTITY_CORRELATION",
      "/identityCorrelation",
      "A non-empty snapshot identity correlation is required.",
    );
  }

  const entities: Array<[string, unknown]> = [
    ["/environment", snapshot.environment],
    ["/solution", snapshot.solution],
    ...(
      Array.isArray(snapshot.flows)
        ? snapshot.flows.map((flow, index) => [`/flows/${index}`, flow] as [string, unknown])
        : []
    ),
    ...(
      Array.isArray(snapshot.connectionReferences)
        ? snapshot.connectionReferences.map((reference, index) => [`/connectionReferences/${index}`, reference] as [string, unknown])
        : []
    ),
  ];
  for (const [path, entity] of entities) {
    if (!isRecord(entity) || entity.identityCorrelation !== correlation) {
      add(
        diagnostics,
        "READONLY_PROVIDER_IDENTITY_CORRELATION",
        `${path}/identityCorrelation`,
        "Every environment, solution, flow, and connection reference must correlate to the snapshot identity.",
      );
    }
  }

  const capabilities = isRecord(snapshot.capabilities) ? snapshot.capabilities : undefined;
  if (
    snapshot.claimClass === "LOCAL_SYNTHETIC"
    && isRecord(snapshot.evidence)
    && isRecord(snapshot.evidence.provider)
    && snapshot.evidence.provider.status === "PASS"
  ) {
    add(
      diagnostics,
      "READONLY_PROVIDER_EVIDENCE_BOUNDARY",
      "/evidence/provider/status",
      "Local synthetic evidence cannot mint a provider PASS claim.",
    );
  }
  if (
    capabilities === undefined
    || capabilities.mode !== "read-only"
    || capabilities.networkMode !== "offline"
    || capabilities.tenantMutation !== false
  ) {
    add(
      diagnostics,
      "READONLY_PROVIDER_MUTATION_CAPABILITY",
      "/capabilities",
      "The provider adapter must be offline, read-only, and tenant-mutation-free.",
    );
  }
  if (capabilities !== undefined) {
    if (Array.isArray(capabilities.operations)) {
      for (const [index, operation] of capabilities.operations.entries()) {
        if (mutationVerb(operation)) {
          add(
            diagnostics,
            "READONLY_PROVIDER_MUTATION_CAPABILITY",
            `/capabilities/operations/${index}`,
            "Mutation capabilities and verbs are forbidden in the read-only adapter.",
          );
        }
      }
    }
    if (Array.isArray(capabilities.forbiddenOperations)) {
      const forbidden = new Set(capabilities.forbiddenOperations.filter((operation): operation is string => typeof operation === "string"));
      for (const operation of REQUIRED_FORBIDDEN_OPERATIONS) {
        if (!forbidden.has(operation)) {
          add(
            diagnostics,
            "READONLY_PROVIDER_MUTATION_CAPABILITY",
            "/capabilities/forbiddenOperations",
            `Forbidden operation '${operation}' must remain explicitly documented.`,
          );
        }
      }
    }
  }

  const references = Array.isArray(snapshot.connectionReferences) ? snapshot.connectionReferences : [];
  for (const [index, reference] of references.entries()) {
    if (!isRecord(reference)) {
      continue;
    }
    if (reference.matchCount !== 1 || reference.state !== "resolved") {
      add(
        diagnostics,
        "READONLY_PROVIDER_CONNECTION_REFERENCE_AMBIGUOUS",
        `/connectionReferences/${index}`,
        "Every connection reference must resolve to exactly one non-secret metadata binding.",
      );
    }
  }

  const evidence = isRecord(snapshot.evidence) ? snapshot.evidence : undefined;
  if (evidence !== undefined) {
    if (!isRecord(evidence.local) || evidence.local.claimClass !== "LOCAL_SYNTHETIC") {
      add(
        diagnostics,
        "READONLY_PROVIDER_EVIDENCE_BOUNDARY",
        "/evidence/local/claimClass",
        "Local evidence must remain explicitly LOCAL_SYNTHETIC.",
      );
    }
    for (const [id, expectedClaimClass] of [["provider", "PROVIDER"], ["uat", "UAT"] as const]) {
      const item = evidence[id];
      if (!isRecord(item) || item.claimClass !== expectedClaimClass) {
        add(
          diagnostics,
          "READONLY_PROVIDER_EVIDENCE_BOUNDARY",
          `/evidence/${id}/claimClass`,
          `The ${id.toUpperCase()} evidence class must remain distinct from local synthetic evidence.`,
        );
        continue;
      }
      if (item.status === "PASS") {
        const readback = item.authoritativeReadback;
        if (
          !isRecord(readback)
          || readback.status !== "PASS"
          || readback.authority !== id
          || readback.identityCorrelation !== correlation
          || !Array.isArray(readback.observedFields)
          || readback.observedFields.length === 0
        ) {
          add(
            diagnostics,
            "READONLY_PROVIDER_READBACK_REQUIRED",
            `/evidence/${id}`,
            `${id.toUpperCase()} PASS requires an authoritative, identity-correlated readback with observed fields.`,
          );
        }
      }
    }
    if (
      isRecord(evidence.uat)
      && evidence.uat.status === "PASS"
      && (!isRecord(evidence.provider) || evidence.provider.status !== "PASS")
    ) {
      add(
        diagnostics,
        "READONLY_PROVIDER_READBACK_REQUIRED",
        "/evidence/uat/status",
        "UAT PASS requires a provider PASS readback before it can be asserted.",
      );
    }
  }

  const flowIds = new Set<string>();
  const flowsById = new Map<string, { readonly index: number; readonly value: JsonRecord }>();
  if (Array.isArray(snapshot.flows)) {
    for (const [index, flow] of snapshot.flows.entries()) {
      if (!isRecord(flow) || typeof flow.id !== "string") {
        continue;
      }
      if (flowIds.has(flow.id)) {
        add(diagnostics, "READONLY_PROVIDER_SCHEMA_INVALID", `/flows/${index}/id`, "Flow IDs must be unique.");
      }
      flowIds.add(flow.id);
      if (!flowsById.has(flow.id)) {
        flowsById.set(flow.id, { index, value: flow });
      }
    }
  }
  const referenceIds = new Set<string>();
  const referencesById = new Map<string, { readonly index: number; readonly value: JsonRecord }>();
  if (Array.isArray(references)) {
    for (const [index, reference] of references.entries()) {
      if (!isRecord(reference) || typeof reference.id !== "string") {
        continue;
      }
      if (referenceIds.has(reference.id)) {
        add(diagnostics, "READONLY_PROVIDER_SCHEMA_INVALID", `/connectionReferences/${index}/id`, "Connection reference IDs must be unique.");
      }
      referenceIds.add(reference.id);
      if (!referencesById.has(reference.id)) {
        referencesById.set(reference.id, { index, value: reference });
      }
    }
  }
  if (Array.isArray(snapshot.flows)) {
    for (const [flowIndex, flow] of snapshot.flows.entries()) {
      if (!isRecord(flow) || !Array.isArray(flow.connectionReferenceIds)) {
        continue;
      }
      for (const [referenceIndex, referenceId] of flow.connectionReferenceIds.entries()) {
        if (typeof referenceId === "string" && !referenceIds.has(referenceId)) {
          add(
            diagnostics,
            "READONLY_PROVIDER_SCHEMA_INVALID",
            `/flows/${flowIndex}/connectionReferenceIds/${referenceIndex}`,
            "Every flow connection reference must be declared in the snapshot.",
          );
        }
      }
    }
  }
  if (Array.isArray(references)) {
    for (const [referenceIndex, reference] of references.entries()) {
      if (!isRecord(reference) || !Array.isArray(reference.flowIds)) {
        continue;
      }
      for (const [flowIndex, flowId] of reference.flowIds.entries()) {
        if (typeof flowId === "string" && !flowIds.has(flowId)) {
          add(
            diagnostics,
            "READONLY_PROVIDER_SCHEMA_INVALID",
            `/connectionReferences/${referenceIndex}/flowIds/${flowIndex}`,
            "Every connection reference flow must be declared in the snapshot.",
          );
        }
      }
    }
  }

  if (Array.isArray(snapshot.flows)) {
    for (const [flowIndex, flow] of snapshot.flows.entries()) {
      if (!isRecord(flow) || typeof flow.id !== "string" || !Array.isArray(flow.connectionReferenceIds)) {
        continue;
      }
      for (const [referenceIndex, referenceId] of flow.connectionReferenceIds.entries()) {
        if (typeof referenceId !== "string") {
          continue;
        }
        const reference = referencesById.get(referenceId);
        if (reference !== undefined && Array.isArray(reference.value.flowIds) && !reference.value.flowIds.includes(flow.id)) {
          add(
            diagnostics,
            "READONLY_PROVIDER_CONNECTION_REFERENCE_ASSOCIATION",
            `/flows/${flowIndex}/connectionReferenceIds/${referenceIndex}`,
            "Flow and connection-reference memberships must agree in both directions.",
          );
        }
      }
    }
  }
  if (Array.isArray(references)) {
    for (const [referenceIndex, reference] of references.entries()) {
      if (!isRecord(reference) || typeof reference.id !== "string" || !Array.isArray(reference.flowIds)) {
        continue;
      }
      for (const [flowIndex, flowId] of reference.flowIds.entries()) {
        if (typeof flowId !== "string") {
          continue;
        }
        const flow = flowsById.get(flowId);
        if (flow !== undefined && Array.isArray(flow.value.connectionReferenceIds) && !flow.value.connectionReferenceIds.includes(reference.id)) {
          add(
            diagnostics,
            "READONLY_PROVIDER_CONNECTION_REFERENCE_ASSOCIATION",
            `/connectionReferences/${referenceIndex}/flowIds/${flowIndex}`,
            "Flow and connection-reference memberships must agree in both directions.",
          );
        }
      }
    }
  }

  return diagnostics;
}

export function validateReadonlyProviderSnapshot(
  snapshot: unknown,
): ReadonlyProviderValidationResult {
  const diagnostics: ReadonlyProviderDiagnostic[] = [];
  try {
    if (!isJsonSafe(snapshot) || !isRecord(snapshot)) {
      add(
        diagnostics,
        "READONLY_PROVIDER_SCHEMA_INVALID",
        "/",
        "Provider read-only snapshots must be plain, finite, JSON-safe objects.",
      );
    } else {
      const validator = loadSchemaValidator();
      if (validator === undefined) {
        add(
          diagnostics,
          "READONLY_PROVIDER_SCHEMA_UNAVAILABLE",
          SCHEMA_PATH,
          "Provider read-only snapshot schema could not be loaded or compiled.",
        );
      } else {
        diagnostics.push(...schemaDiagnostics(validator, snapshot));
        diagnostics.push(...semanticDiagnostics(snapshot));
      }
      scanForSecretLikeValues(snapshot, "", diagnostics);
    }
  } catch {
    add(
      diagnostics,
      "READONLY_PROVIDER_SCHEMA_INVALID",
      "/",
      "Provider read-only snapshot could not be safely inspected.",
    );
  }

  const uniqueDiagnostics = new Map<string, ReadonlyProviderDiagnostic>();
  for (const diagnostic of diagnostics.sort(compareDiagnostics)) {
    uniqueDiagnostics.set(
      `${diagnostic.code}\u0000${diagnostic.path}\u0000${diagnostic.message}`,
      diagnostic,
    );
  }
  return {
    valid: uniqueDiagnostics.size === 0,
    diagnostics: [...uniqueDiagnostics.values()],
  };
}
