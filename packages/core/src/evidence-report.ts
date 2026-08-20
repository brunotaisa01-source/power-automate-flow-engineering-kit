export type LocalEvidenceStatus = "PASS" | "FAIL" | "NOT_RUN";
export type LocalEvidenceSeverity = "error" | "warning" | "info";

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

function compareDiagnostics(left: LocalEvidenceDiagnostic, right: LocalEvidenceDiagnostic): number {
  return compareText(left.code, right.code)
    || compareText(left.artifactPath, right.artifactPath)
    || compareText(left.jsonPointer ?? "", right.jsonPointer ?? "")
    || compareText(left.message, right.message);
}

function redactText(input: string): string {
  return input
    .replace(/\b[A-Za-z]:[\\/][^\s"']+/g, "<redacted-path>")
    .replace(/\\\\[^\\\s]+\\[^\s"']+/g, "<redacted-path>")
    .replace(/(^|[\s(])\/(?:home|Users|tmp|var|private)\/[^\s"']+/g, "$1<redacted-path>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "<redacted-id>")
    .replace(/\bhttps?:\/\/(?![^\s/]*\.example\.test\b)[^\s"']+/g, "<redacted-url>")
    .replace(/\b(?!user@example\.test\b)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<redacted-email>")
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer <redacted-secret>");
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [redactText(key), redactValue(item)]),
    );
  }
  return value;
}

function normalizedPath(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? redactText(value) : fallback;
}

function normalizedStatus(value: unknown): LocalEvidenceStatus | undefined {
  return value === "PASS" || value === "FAIL" || value === "NOT_RUN" ? value : undefined;
}

function normalizedDiagnostics(
  diagnostics: readonly LocalEvidenceDiagnosticInput[] | undefined,
  fallbackPath: string,
): LocalEvidenceDiagnostic[] {
  return (diagnostics ?? []).map((diagnostic) => {
    const path = normalizedPath(diagnostic.path ?? diagnostic.artifactPath, fallbackPath);
    const normalized: LocalEvidenceDiagnostic = {
      code: redactText(diagnostic.code),
      severity: diagnostic.severity ?? "info",
      message: redactText(diagnostic.message),
      artifactPath: path,
      ...(diagnostic.jsonPointer === undefined ? {} : { jsonPointer: redactText(diagnostic.jsonPointer) }),
      ...(diagnostic.expected === undefined ? {} : { expected: redactValue(diagnostic.expected) }),
      ...(diagnostic.actual === undefined ? {} : { actual: redactValue(diagnostic.actual) }),
      ...(diagnostic.remediation === undefined ? {} : { remediation: redactText(diagnostic.remediation) }),
    };
    return normalized;
  }).sort(compareDiagnostics);
}

function statusFor(
  explicit: unknown,
  diagnostics: readonly LocalEvidenceDiagnostic[],
): LocalEvidenceStatus {
  if (diagnostics.some(({ severity }) => severity === "error")) {
    return "FAIL";
  }
  return normalizedStatus(explicit) ?? "PASS";
}

function preparedEvidence(input: LocalEvidenceReportInput): PreparedDefinitionEvidenceInput | undefined {
  if (input.preparedDefinition !== undefined) {
    return input.preparedDefinition;
  }
  return input.preparedDefinitionDiagnostics;
}

function asPreparedRecord(
  input: PreparedDefinitionEvidenceInput,
): { readonly path?: unknown; readonly result?: unknown; readonly status?: unknown; readonly diagnostics?: readonly LocalEvidenceDiagnosticInput[] } {
  if (Array.isArray(input)) {
    return { diagnostics: input };
  }
  return input as PreparedDefinitionEvidence;
}

function reportResult(claims: readonly LocalEvidenceClaim[]): LocalEvidenceStatus {
  if (claims.some(({ status }) => status === "FAIL")) {
    return "FAIL";
  }
  if (claims.length === 0 || claims.some(({ status }) => status === "NOT_RUN")) {
    return "NOT_RUN";
  }
  return "PASS";
}

const GATES: readonly LocalEvidenceGate[] = [
  {
    id: "provider",
    claimClass: "PROVIDER",
    status: "NOT_VERIFIED",
    message: "No provider readback was requested or performed by this local report.",
  },
  {
    id: "uat",
    claimClass: "UAT",
    status: "NOT_VERIFIED",
    message: "No hosted or user-acceptance test was requested or performed by this local report.",
  },
];

export function createLocalEvidenceReport(input: LocalEvidenceReportInput): LocalEvidenceReport {
  const claims: LocalEvidenceClaim[] = [];
  const missingDiagnostics: LocalEvidenceDiagnostic[] = [];
  const prepared = preparedEvidence(input);

  if (prepared === undefined) {
    missingDiagnostics.push({
      code: "LOCAL_DEFINITION_EVIDENCE_MISSING",
      severity: "warning",
      message: "Prepared definition diagnostics were not supplied.",
      artifactPath: "<definition>",
      remediation: "Provide prepared definition diagnostics from a local offline preparation run.",
    });
  } else {
    const preparedRecord = asPreparedRecord(prepared);
    const artifactPath = normalizedPath(preparedRecord.path, "<definition>");
    const diagnostics = normalizedDiagnostics(preparedRecord.diagnostics, artifactPath);
    claims.push({
      id: `definition:${artifactPath}`,
      claimClass: "LOCAL_SYNTHETIC",
      subject: "prepared-definition",
      artifactPath,
      status: statusFor(preparedRecord.result ?? preparedRecord.status, diagnostics),
      diagnostics,
    });
  }

  const artifacts = input.localArtifacts ?? input.localArtifactResults;
  if (artifacts === undefined || artifacts.length === 0) {
    missingDiagnostics.push({
      code: "LOCAL_ARTIFACT_EVIDENCE_MISSING",
      severity: "warning",
      message: "No existing local artifact results were supplied.",
      artifactPath: "<artifacts>",
      remediation: "Provide local ZIP, flow, or inspection results before relying on local artifact claims.",
    });
  } else {
    for (const artifact of artifacts) {
      const kind = typeof artifact.kind === "string" && artifact.kind.length > 0
        ? redactText(artifact.kind)
        : "local-artifact";
      const artifactPath = normalizedPath(artifact.path ?? artifact.artifactPath, "<artifact>");
      const diagnostics = normalizedDiagnostics(artifact.diagnostics, artifactPath);
      claims.push({
        id: `artifact:${kind}:${artifactPath}`,
        claimClass: "LOCAL_SYNTHETIC",
        subject: "local-artifact",
        artifactPath,
        status: statusFor(artifact.result ?? artifact.status, diagnostics),
        diagnostics,
      });
    }
  }

  claims.sort((left, right) => compareText(left.id, right.id));
  const diagnostics = [...missingDiagnostics, ...claims.flatMap(({ diagnostics: claimDiagnostics }) => claimDiagnostics)]
    .sort(compareDiagnostics);

  return {
    schemaVersion: "1.0",
    result: reportResult(claims),
    claimClass: "LOCAL_SYNTHETIC",
    providerGate: "NOT_VERIFIED",
    uatGate: "NOT_VERIFIED",
    claims,
    gates: GATES,
    diagnostics,
  };
}
