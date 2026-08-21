export type LocalEvidenceStatus = "PASS" | "FAIL" | "NOT_RUN";
export type LocalEvidenceSeverity = "error" | "warning" | "info";

export const REDACTED_PATH = "<redacted-path>";
export const REDACTED_URL = "<redacted-url>";

export function redactText(input: string): string {
  return input
    .replace(/\b[A-Za-z]:[\\/][^\s"']+/g, REDACTED_PATH)
    .replace(/\\\\[^\\\s]+\\[^\s"']+/g, REDACTED_PATH)
    .replace(/(^|[\s(])\/(?:home|Users|tmp|var|private)\/[^\s"']+/g, `$1${REDACTED_PATH}`)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "<redacted-id>")
    .replace(/\bhttps?:\/\/(?![^\s/]*\.example\.test\b)[^\s"']+/g, REDACTED_URL)
    .replace(/\b(?!user@example\.test\b)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<redacted-email>")
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer <redacted-secret>");
}

function replaceSchemePath(input: string): string {
  return input.replace(/\b[a-z][a-z0-9+.-]*:[^\s"']+/gi, (candidate) => {
    if (/^https?:\/\/[^\s/]*\.example\.test\b/i.test(candidate)) {
      return candidate;
    }
    return REDACTED_URL;
  });
}

export function redactPathBearingText(input: string): string {
  return replaceSchemePath(redactText(input))
    .replace(/(^|[\s("'`])[^\s"']*(?:\.\.[\\/])[^\s"']*/g, `$1${REDACTED_PATH}`)
    .replace(/(^|[\s("'`])[A-Za-z]:[^\s"']+/g, `$1${REDACTED_PATH}`)
    .replace(/(^|[^A-Za-z0-9_/:])\/[^\s"']+/g, `$1${REDACTED_PATH}`);
}

function safeRelativePath(value: string): boolean {
  if (
    value.length === 0
    || value.startsWith("/")
    || value.startsWith("\\")
    || value.includes("\\")
    || value.includes(":")
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return false;
  }
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function sanitizeRepositoryRelativePath(value: unknown, missingFallback: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return missingFallback;
  }
  return safeRelativePath(value) ? value : REDACTED_PATH;
}

export interface LocalEvidenceDiagnosticInput {
  readonly code: string;
  readonly severity?: LocalEvidenceSeverity;
  readonly message: string;
  readonly path?: string;
  readonly artifactPath?: string;
  readonly jsonPointer?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly remediation?: string;
}

export interface LocalEvidenceDiagnostic {
  readonly code: string;
  readonly severity: LocalEvidenceSeverity;
  readonly message: string;
  readonly artifactPath: string;
  readonly jsonPointer?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly remediation?: string;
}

export interface PreparedDefinitionEvidence {
  readonly path?: string;
  readonly result?: LocalEvidenceStatus;
  readonly status?: LocalEvidenceStatus;
  readonly diagnostics: readonly LocalEvidenceDiagnosticInput[];
}

export type PreparedDefinitionEvidenceInput =
  | PreparedDefinitionEvidence
  | readonly LocalEvidenceDiagnosticInput[];

export interface LocalArtifactEvidence {
  readonly kind?: string;
  readonly path?: string;
  readonly artifactPath?: string;
  readonly result?: LocalEvidenceStatus;
  readonly status?: LocalEvidenceStatus;
  readonly diagnostics?: readonly LocalEvidenceDiagnosticInput[];
}

export interface LocalEvidenceReportInput {
  readonly preparedDefinition?: PreparedDefinitionEvidenceInput;
  readonly preparedDefinitionDiagnostics?: PreparedDefinitionEvidenceInput;
  readonly localArtifacts?: readonly LocalArtifactEvidence[];
  readonly localArtifactResults?: readonly LocalArtifactEvidence[];
}

export interface LocalEvidenceClaim {
  readonly id: string;
  readonly claimClass: "LOCAL_SYNTHETIC";
  readonly subject: "prepared-definition" | "local-artifact";
  readonly artifactPath: string;
  readonly status: LocalEvidenceStatus;
  readonly diagnostics: readonly LocalEvidenceDiagnostic[];
}

export interface LocalEvidenceGate {
  readonly id: "provider" | "uat";
  readonly claimClass: "PROVIDER" | "UAT";
  readonly status: "NOT_VERIFIED";
  readonly message: string;
}

export interface LocalEvidenceReport {
  readonly schemaVersion: "1.0";
  readonly result: LocalEvidenceStatus;
  readonly claimClass: "LOCAL_SYNTHETIC";
  readonly providerGate: "NOT_VERIFIED";
  readonly uatGate: "NOT_VERIFIED";
  readonly claims: readonly LocalEvidenceClaim[];
  readonly gates: readonly LocalEvidenceGate[];
  readonly diagnostics: readonly LocalEvidenceDiagnostic[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalKey(value: unknown): string {
  return JSON.stringify(redactValue(value)) ?? "";
}

function compareDiagnostics(left: LocalEvidenceDiagnostic, right: LocalEvidenceDiagnostic): number {
  return compareText(left.code, right.code)
    || compareText(left.artifactPath, right.artifactPath)
    || compareText(left.jsonPointer ?? "", right.jsonPointer ?? "")
    || compareText(left.message, right.message)
    || compareText(canonicalKey(left), canonicalKey(right));
}

function compareClaims(left: LocalEvidenceClaim, right: LocalEvidenceClaim): number {
  return compareText(left.id, right.id)
    || compareText(canonicalKey(left), canonicalKey(right));
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactPathBearingText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [redactPathBearingText(key), redactValue(item)]),
    );
  }
  return value;
}

function isJsonSafeValue(value: unknown, ancestors = new Set<object>()): boolean {
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
    const array = Array.isArray(object);
    const prototype = Object.getPrototypeOf(object);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      return false;
    }

    ancestors.add(object);
    for (const key of Object.keys(object)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor === undefined || !("value" in descriptor)
        || !isJsonSafeValue(descriptor.value, ancestors)) {
        return false;
      }
    }
    ancestors.delete(object);
    return true;
  } catch {
    return false;
  }
}

function normalizedPath(value: unknown, fallback: string): string {
  return sanitizeRepositoryRelativePath(value, fallback);
}

function normalizedStatus(value: unknown): LocalEvidenceStatus | undefined {
  return value === "PASS" || value === "FAIL" || value === "NOT_RUN" ? value : undefined;
}

function shapeDiagnostic(
  code: string,
  message: string,
  artifactPath: string,
  remediation: string,
): LocalEvidenceDiagnostic {
  return { code, severity: "warning", message, artifactPath, remediation };
}

function isDiagnosticInput(value: unknown): value is LocalEvidenceDiagnosticInput {
  if (!isRecord(value) || typeof value.code !== "string" || value.code.length === 0
    || typeof value.message !== "string") {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
  } catch {
    return false;
  }
  const validSeverity = value.severity === undefined
    || value.severity === "error"
    || value.severity === "warning"
    || value.severity === "info";
  if (!validSeverity) {
    return false;
  }
  for (const key of ["path", "artifactPath", "jsonPointer", "remediation"] as const) {
    if (!Object.hasOwn(value, key)) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "string") {
      return false;
    }
  }
  for (const key of ["expected", "actual"] as const) {
    if (!Object.hasOwn(value, key)) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !isJsonSafeValue(descriptor.value)) {
      return false;
    }
  }
  return true;
}

interface NormalizedDiagnostics {
  readonly diagnostics: LocalEvidenceDiagnostic[];
  readonly invalid: boolean;
}

function normalizedDiagnostics(
  diagnostics: unknown,
  fallbackPath: string,
): NormalizedDiagnostics {
  if (diagnostics === undefined) {
    return { diagnostics: [], invalid: false };
  }
  if (!Array.isArray(diagnostics)) {
    return {
      diagnostics: [shapeDiagnostic(
        "LOCAL_DIAGNOSTICS_INPUT_INVALID",
        "Evidence diagnostics must be an array.",
        fallbackPath,
        "Provide a JSON array of local diagnostics.",
      )],
      invalid: true,
    };
  }

  let invalid = false;
  const normalized = diagnostics.map((diagnostic, index) => {
    if (!isDiagnosticInput(diagnostic)) {
      invalid = true;
      return shapeDiagnostic(
        "LOCAL_DIAGNOSTIC_ENTRY_INVALID",
        "An evidence diagnostic entry is not a complete diagnostic object.",
        `${fallbackPath}/diagnostics/${index}`,
        "Provide diagnostic entries with non-empty code and message fields.",
      );
    }
    const path = normalizedPath(diagnostic.path ?? diagnostic.artifactPath, fallbackPath);
    const normalized: LocalEvidenceDiagnostic = {
      code: redactPathBearingText(diagnostic.code),
      severity: diagnostic.severity ?? "info",
      message: redactPathBearingText(diagnostic.message),
      artifactPath: path,
      ...(diagnostic.jsonPointer === undefined ? {} : { jsonPointer: redactPathBearingText(diagnostic.jsonPointer) }),
      ...(diagnostic.expected === undefined ? {} : { expected: redactValue(diagnostic.expected) }),
      ...(diagnostic.actual === undefined ? {} : { actual: redactValue(diagnostic.actual) }),
      ...(diagnostic.remediation === undefined ? {} : { remediation: redactPathBearingText(diagnostic.remediation) }),
    };
    return normalized;
  }).sort(compareDiagnostics);
  return { diagnostics: normalized, invalid };
}

function statusFor(
  explicit: unknown,
  hasExplicit: boolean,
  diagnostics: readonly LocalEvidenceDiagnostic[],
  invalidShape: boolean,
  allowImplicitPass: boolean,
): LocalEvidenceStatus {
  if (invalidShape) {
    return "NOT_RUN";
  }
  if (diagnostics.some(({ severity }) => severity === "error")) {
    return "FAIL";
  }
  if (!hasExplicit) {
    return allowImplicitPass ? "PASS" : "NOT_RUN";
  }
  return normalizedStatus(explicit) ?? "NOT_RUN";
}

function preparedEvidence(input: LocalEvidenceReportInput): PreparedDefinitionEvidenceInput | undefined {
  if (input.preparedDefinition !== undefined) {
    return input.preparedDefinition;
  }
  return input.preparedDefinitionDiagnostics;
}

function reportResult(
  claims: readonly LocalEvidenceClaim[],
  incompleteEvidence: boolean,
): LocalEvidenceStatus {
  if (claims.some(({ status }) => status === "FAIL")) {
    return "FAIL";
  }
  if (incompleteEvidence || claims.length === 0 || claims.some(({ status }) => status === "NOT_RUN")) {
    return "NOT_RUN";
  }
  return "PASS";
}

function createGates(): readonly LocalEvidenceGate[] {
  return Object.freeze([
    Object.freeze({
      id: "provider" as const,
      claimClass: "PROVIDER" as const,
      status: "NOT_VERIFIED" as const,
      message: "No provider readback was requested or performed by this local report.",
    }),
    Object.freeze({
      id: "uat" as const,
      claimClass: "UAT" as const,
      status: "NOT_VERIFIED" as const,
      message: "No hosted or user-acceptance test was requested or performed by this local report.",
    }),
  ]);
}

function buildLocalEvidenceReport(input: unknown): LocalEvidenceReport {
  const claims: LocalEvidenceClaim[] = [];
  const missingDiagnostics: LocalEvidenceDiagnostic[] = [];
  let incompleteEvidence = false;

  if (!isRecord(input)) {
    incompleteEvidence = true;
    missingDiagnostics.push(shapeDiagnostic(
      "LOCAL_EVIDENCE_INPUT_INVALID",
      "Local evidence input must be a JSON object.",
      "<input>",
      "Provide a JSON object containing prepared definition diagnostics and local artifact results.",
    ));
  }

  const evidenceInput = isRecord(input) ? input as LocalEvidenceReportInput : undefined;
  const prepared = evidenceInput === undefined ? undefined : preparedEvidence(evidenceInput);

  if (prepared === undefined) {
    incompleteEvidence = true;
    missingDiagnostics.push({
      code: "LOCAL_DEFINITION_EVIDENCE_MISSING",
      severity: "warning",
      message: "Prepared definition diagnostics were not supplied.",
      artifactPath: "<definition>",
      remediation: "Provide prepared definition diagnostics from a local offline preparation run.",
    });
  } else if (Array.isArray(prepared)) {
    const artifactPath = "<definition>";
    const normalized = normalizedDiagnostics(prepared, artifactPath);
    const incomplete = prepared.length === 0 || normalized.invalid;
    const diagnostics = [...normalized.diagnostics];
    if (incomplete) {
      incompleteEvidence = true;
      diagnostics.push(shapeDiagnostic(
        "LOCAL_DEFINITION_EVIDENCE_INCOMPLETE",
        "Prepared definition diagnostics must contain at least one complete diagnostic entry.",
        artifactPath,
        "Provide non-empty prepared definition diagnostics from a local offline preparation run.",
      ));
    }
    diagnostics.sort(compareDiagnostics);
    claims.push({
      id: `definition:${artifactPath}`,
      claimClass: "LOCAL_SYNTHETIC",
      subject: "prepared-definition",
      artifactPath,
      status: statusFor(undefined, false, diagnostics, incomplete, !incomplete),
      diagnostics,
    });
  } else if (!isRecord(prepared)) {
    incompleteEvidence = true;
    const artifactPath = "<definition>";
    const diagnostics = [shapeDiagnostic(
      "LOCAL_DEFINITION_ENTRY_INVALID",
      "Prepared definition evidence must be an object or a non-empty diagnostics array.",
      artifactPath,
      "Provide a complete prepared definition evidence object.",
    )];
    claims.push({
      id: `definition:${artifactPath}`,
      claimClass: "LOCAL_SYNTHETIC",
      subject: "prepared-definition",
      artifactPath,
      status: "NOT_RUN",
      diagnostics,
    });
  } else {
    const preparedRecord = prepared;
    const artifactPath = normalizedPath(preparedRecord.path, "<definition>");
    const normalized = normalizedDiagnostics(preparedRecord.diagnostics, artifactPath);
    const hasDiagnostics = Object.hasOwn(preparedRecord, "diagnostics");
    const hasResult = Object.hasOwn(preparedRecord, "result");
    const hasStatus = Object.hasOwn(preparedRecord, "status");
    const explicit = hasResult ? preparedRecord.result : preparedRecord.status;
    const normalizedResult = normalizedStatus(explicit);
    const statusConflict = hasResult && hasStatus
      && normalizedStatus(preparedRecord.result) !== normalizedStatus(preparedRecord.status);
    const incomplete = !hasDiagnostics || !Array.isArray(preparedRecord.diagnostics)
      || normalized.invalid || !hasResult && !hasStatus
      || normalizedResult === undefined || statusConflict;
    const diagnostics = [...normalized.diagnostics];
    if (incomplete) {
      incompleteEvidence = true;
      diagnostics.push(shapeDiagnostic(
        "LOCAL_DEFINITION_EVIDENCE_INCOMPLETE",
        "Prepared definition evidence requires a diagnostics array and a valid result or status.",
        artifactPath,
        "Provide complete prepared definition evidence with diagnostics and PASS, FAIL, or NOT_RUN status.",
      ));
    }
    diagnostics.sort(compareDiagnostics);
    claims.push({
      id: `definition:${artifactPath}`,
      claimClass: "LOCAL_SYNTHETIC",
      subject: "prepared-definition",
      artifactPath,
      status: statusFor(explicit, hasResult || hasStatus, diagnostics, incomplete, false),
      diagnostics,
    });
  }

  const artifacts: unknown = evidenceInput === undefined
    ? undefined
    : evidenceInput.localArtifacts !== undefined
      ? evidenceInput.localArtifacts
      : evidenceInput.localArtifactResults;
  if (artifacts === undefined || Array.isArray(artifacts) && artifacts.length === 0) {
    incompleteEvidence = true;
    missingDiagnostics.push({
      code: "LOCAL_ARTIFACT_EVIDENCE_MISSING",
      severity: "warning",
      message: "No existing local artifact results were supplied.",
      artifactPath: "<artifacts>",
      remediation: "Provide local ZIP, flow, or inspection results before relying on local artifact claims.",
    });
  } else if (!Array.isArray(artifacts)) {
    incompleteEvidence = true;
    const artifactPath = "<artifacts>";
    const diagnostics = [shapeDiagnostic(
      "LOCAL_ARTIFACT_EVIDENCE_INCOMPLETE",
      "Local artifact results must be an array of complete artifact entries.",
      artifactPath,
      "Provide a JSON array of local artifact results.",
    )];
    claims.push({
      id: "artifact:invalid-input",
      claimClass: "LOCAL_SYNTHETIC",
      subject: "local-artifact",
      artifactPath,
      status: "NOT_RUN",
      diagnostics,
    });
  } else {
    for (const [index, artifact] of artifacts.entries()) {
      const invalidArtifactPath = `<artifact:${index}>`;
      if (!isRecord(artifact)) {
        incompleteEvidence = true;
        claims.push({
          id: `artifact:invalid:${index}`,
          claimClass: "LOCAL_SYNTHETIC",
          subject: "local-artifact",
          artifactPath: invalidArtifactPath,
          status: "NOT_RUN",
          diagnostics: [shapeDiagnostic(
            "LOCAL_ARTIFACT_ENTRY_INVALID",
            "A local artifact result entry must be an object.",
            invalidArtifactPath,
            "Remove null or non-object entries and provide complete local artifact results.",
          )],
        });
        continue;
      }

      const kind = typeof artifact.kind === "string" && artifact.kind.length > 0
        ? redactPathBearingText(artifact.kind)
        : "local-artifact";
      const suppliedPath = artifact.path ?? artifact.artifactPath;
      const artifactPath = normalizedPath(suppliedPath, invalidArtifactPath);
      const normalized = normalizedDiagnostics(artifact.diagnostics, artifactPath);
      const hasKind = typeof artifact.kind === "string" && artifact.kind.length > 0;
      const hasPath = typeof suppliedPath === "string" && suppliedPath.length > 0;
      const hasResult = Object.hasOwn(artifact, "result");
      const hasStatus = Object.hasOwn(artifact, "status");
      const explicit = hasResult ? artifact.result : artifact.status;
      const normalizedResult = normalizedStatus(explicit);
      const statusConflict = hasResult && hasStatus
        && normalizedStatus(artifact.result) !== normalizedStatus(artifact.status);
      const incomplete = !hasKind || !hasPath || normalized.invalid || !hasResult && !hasStatus
        || normalizedResult === undefined || statusConflict;
      const diagnostics = [...normalized.diagnostics];
      if (incomplete) {
        incompleteEvidence = true;
        diagnostics.push(shapeDiagnostic(
          "LOCAL_ARTIFACT_EVIDENCE_INCOMPLETE",
          "A local artifact result requires kind, path, diagnostics, and a valid result or status.",
          artifactPath,
          "Provide complete local artifact results with PASS, FAIL, or NOT_RUN status.",
        ));
      }
      diagnostics.sort(compareDiagnostics);
      claims.push({
        id: `artifact:${kind}:${artifactPath}`,
        claimClass: "LOCAL_SYNTHETIC",
        subject: "local-artifact",
        artifactPath,
        status: statusFor(explicit, hasResult || hasStatus, diagnostics, incomplete, false),
        diagnostics,
      });
    }
  }

  claims.sort(compareClaims);
  const diagnostics = [...missingDiagnostics, ...claims.flatMap(({ diagnostics: claimDiagnostics }) => claimDiagnostics)]
    .sort(compareDiagnostics);

  return {
    schemaVersion: "1.0",
    result: reportResult(claims, incompleteEvidence),
    claimClass: "LOCAL_SYNTHETIC",
    providerGate: "NOT_VERIFIED",
    uatGate: "NOT_VERIFIED",
    claims,
    gates: createGates(),
    diagnostics,
  };
}

function invalidEvidenceReport(): LocalEvidenceReport {
  return {
    schemaVersion: "1.0",
    result: "NOT_RUN",
    claimClass: "LOCAL_SYNTHETIC",
    providerGate: "NOT_VERIFIED",
    uatGate: "NOT_VERIFIED",
    claims: [],
    gates: createGates(),
    diagnostics: [shapeDiagnostic(
      "LOCAL_EVIDENCE_INPUT_INVALID",
      "Local evidence input could not be inspected safely.",
      "<input>",
      "Provide a plain JSON-compatible local evidence object.",
    )],
  };
}

export function createLocalEvidenceReport(input: unknown): LocalEvidenceReport {
  try {
    return buildLocalEvidenceReport(input);
  } catch {
    return invalidEvidenceReport();
  }
}
