export const WP06_EVIDENCE_PROFILE = "wp06-offline-v1" as const;
export const WP06_ARTIFACT_PROFILE = "wp06-evidence-v1" as const;
export const WP06_SOURCE_PROJECTION_PROFILE = "wp06-source-projection-v1" as const;

export type Wp06SourceArtifactKind = "builder" | "frontend";

export interface NormalizedAuthoritySequence {
  readonly identityRead: number;
  readonly capabilityRead: number;
  readonly targetRead: number;
  readonly mutation: number;
}

export interface NormalizedAuthoritySources {
  readonly actor: string;
  readonly role: string;
  readonly scope: string;
  readonly protectedState: string;
  readonly owner: string;
  readonly amount: string;
  readonly approval: string;
}

export interface NormalizedCapabilityEvidence {
  readonly id: string;
  readonly accessListId: string;
  readonly activeField: string;
  readonly principalField: string;
  readonly capabilityField: string;
  readonly source: string;
  readonly activeOnly: boolean;
  readonly matchCardinality: string;
  readonly commandDeclared: boolean;
  readonly stateTransitionDeclared: boolean;
}

export interface NormalizedScopeEvidence {
  readonly mode: string;
  readonly targetField?: string;
  readonly accessField?: string;
  readonly lookupListId?: string;
  readonly targetValueSource: string;
  readonly capabilityValueSource: string;
  readonly evaluation: string;
  readonly checkedBeforeMutation: boolean;
}

export interface NormalizedAuthorityCheck {
  readonly commandType: string;
  readonly targetListId: string;
  readonly sequence: NormalizedAuthoritySequence;
  readonly authoritySources: NormalizedAuthoritySources;
  readonly capability: NormalizedCapabilityEvidence;
  readonly scope: NormalizedScopeEvidence;
  readonly effectiveOperation: {
    readonly operation: string;
    readonly allowed: boolean;
  };
}

export interface NormalizedPermissionGrant {
  readonly principalKind: string;
  readonly principalBinding: string;
  readonly role: string;
  readonly allowedOperations: readonly string[];
}

export interface NormalizedPermissionModel {
  readonly listId: string;
  readonly inheritance: string;
  readonly directUserGrants: string;
  readonly browserOperations: readonly string[];
  readonly grants: readonly NormalizedPermissionGrant[];
}

export interface NormalizedPermissionProbe {
  readonly listId: string;
  readonly principalBinding: string;
  readonly operations: Readonly<Record<string, boolean>>;
}

export interface NormalizedSaveTransaction {
  readonly listId: string;
  readonly trigger: string;
  readonly patchedFields: readonly string[];
  readonly request: {
    readonly method: string;
    readonly methodOverride: string;
    readonly serialization: string;
    readonly digest: string;
    readonly ifMatch: string;
  };
  readonly conflict: {
    readonly status: number;
    readonly action: string;
  };
  readonly ambiguousFailure: {
    readonly action: string;
    readonly writeRetry: boolean;
  };
  readonly readback: {
    readonly method: string;
    readonly semantic: boolean;
    readonly beforeSuccess: boolean;
  };
}

export interface NormalizedPaginationTraversal {
  readonly completeness: string;
  readonly mode: string;
  readonly continuation: {
    readonly urlParsing: string;
    readonly sameOrigin: boolean;
    readonly sitePath: boolean;
    readonly visitedLinks: boolean;
    readonly pageLimit: number;
    readonly onLoop: string;
    readonly onCrossOrigin: string;
    readonly onSitePathEscape: string;
    readonly onPageLimit: string;
  };
  readonly accumulation: string;
  readonly termination: string;
}

export interface NormalizedODataRequest {
  readonly listId: string;
  readonly fieldNames: readonly string[];
  readonly fieldSource: string;
  readonly queryConstruction: string;
  readonly pathConstruction: string;
  readonly stringLiteralEscaping: string;
  readonly rawFragmentsAccepted: boolean;
  readonly parameterEncoding: string;
}

export interface NormalizedFieldIdentity {
  readonly source: string;
  readonly internalName: string;
  readonly entityPropertyName: string;
}

export interface NormalizedFieldUse {
  readonly operation: string;
  readonly fieldName: string;
  readonly source: string;
}

export interface NormalizedFieldPayload {
  readonly serialization: string;
  readonly metadataType: string;
  readonly fieldTypeKind?: number;
}

export interface NormalizedFieldCompatibility {
  readonly response: string;
  readonly comparedProperties: readonly string[];
  readonly actual?: Readonly<Record<string, unknown>>;
  readonly outcome: string;
  readonly writeAction: string;
}

export interface NormalizedFieldOperation {
  readonly listId: string;
  readonly logicalName: string;
  readonly identity?: NormalizedFieldIdentity;
  readonly uses?: readonly NormalizedFieldUse[];
  readonly createPayload?: NormalizedFieldPayload;
  readonly indexPayload?: NormalizedFieldPayload;
  readonly compatibility?: NormalizedFieldCompatibility;
}

export interface NormalizedHttpClassification {
  readonly status: number;
  readonly phase: string;
  readonly requestKind: string;
  readonly allowCreateMissing404: boolean;
  readonly error: {
    readonly platformCode?: string;
    readonly messageCategory?: string;
  };
  readonly responseBody?: NormalizedHttpResponseBody;
  readonly classification: string;
}

export interface NormalizedHttpResponseBody {
  readonly schemaId: string;
  readonly targetListId: string;
  readonly expectedFields: readonly string[];
  readonly actual: {
    readonly kind: "object" | "list";
    readonly itemCount: number;
    readonly fields: readonly {
      readonly name: string;
      readonly valueKind: "boolean" | "null" | "number" | "string";
    }[];
  };
}

export interface NormalizedIndexOperation {
  readonly sequence: number;
  readonly kind: string;
  readonly field: string;
  readonly payloadMetadataType?: string;
  readonly readback: boolean | {
    readonly performed: boolean;
    readonly observedFields: readonly string[];
  };
}

export interface NormalizedIndexPlan {
  readonly listId: string;
  readonly currentFields: readonly string[];
  readonly requiredFields: readonly string[];
  readonly execution: string;
  readonly digest: {
    readonly fresh: boolean;
    readonly bindsCurrent: boolean;
    readonly bindsRequired: boolean;
  };
  readonly result: string;
  readonly maximumWrites: number;
  readonly writeCount: number;
  readonly operations: readonly NormalizedIndexOperation[];
  readonly finalReadback: readonly string[];
}

export interface NormalizedWp06Evidence {
  readonly evidenceProfile: typeof WP06_EVIDENCE_PROFILE;
  readonly contractRevision: number;
  readonly binding: NormalizedWp06EvidenceBinding;
  readonly authorityChecks?: readonly NormalizedAuthorityCheck[];
  readonly permissionModels?: readonly NormalizedPermissionModel[];
  readonly permissionProbes?: readonly NormalizedPermissionProbe[];
  readonly saveTransactions?: readonly NormalizedSaveTransaction[];
  readonly paginationTraversals?: readonly NormalizedPaginationTraversal[];
  readonly odataRequests?: readonly NormalizedODataRequest[];
  readonly fieldOperations?: readonly NormalizedFieldOperation[];
  readonly httpClassifications?: readonly NormalizedHttpClassification[];
  readonly indexPlans?: readonly NormalizedIndexPlan[];
}

export const WP06_EVIDENCE_SECTIONS = [
  "authorityChecks",
  "permissionModels",
  "permissionProbes",
  "saveTransactions",
  "paginationTraversals",
  "odataRequests",
  "fieldOperations",
  "httpClassifications",
  "indexPlans",
] as const;

export type Wp06EvidenceSection = (typeof WP06_EVIDENCE_SECTIONS)[number];

export interface NormalizedWp06EvidenceBinding {
  readonly section: Wp06EvidenceSection;
  readonly contractArtifactPath: string;
  readonly contractArtifactSha256: string;
  readonly contractArtifactBytes: number;
  readonly sourceArtifactPath: string;
  readonly sourceArtifactSha256: string;
  readonly sourceArtifactBytes: number;
  readonly sourceArtifactKind: Wp06SourceArtifactKind;
  readonly projectionArtifactPath: string;
  readonly projectionArtifactSha256: string;
  readonly projectionArtifactBytes: number;
}

export interface NormalizedWp06SourceAdapter {
  readonly id: "spflow.frontend-static-v1" | "spflow.power-automate-static-v1";
  readonly version: 1;
}

export interface NormalizedWp06SourceProjection {
  readonly sourceProjectionProfile: typeof WP06_SOURCE_PROJECTION_PROFILE;
  readonly projectionRevision: 1;
  readonly contractRevision: number;
  readonly sourceKind: Wp06SourceArtifactKind;
  readonly section: Wp06EvidenceSection;
  readonly adapter: NormalizedWp06SourceAdapter;
  readonly facts: readonly unknown[];
}

type UnknownRecord = Record<string, unknown>;
type ValueGuard = (value: unknown) => boolean;

const SHA256 = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is UnknownRecord {
  if (!isRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => allowed.has(key));
}

function canonicalObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalObject);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalObject(value[key])]),
  );
}

export function canonicalWp06Value(value: unknown): string {
  return JSON.stringify(canonicalObject(value));
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): boolean {
  const keys = values.map(key);
  return new Set(keys).size === keys.length;
}

function strings(value: unknown, allowEmpty = true): value is readonly string[] {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every((item) => typeof item === "string" && item.length > 0)
    && uniqueBy(value, (item) => item);
}

function records(
  value: unknown,
  guard: ValueGuard,
  allowEmpty = true,
): value is readonly UnknownRecord[] {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every(guard)
    && uniqueBy(value, canonicalWp06Value);
}

function isPositiveRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isAuthoritySequence(value: unknown): boolean {
  return exactRecord(value, ["identityRead", "capabilityRead", "targetRead", "mutation"])
    && [value.identityRead, value.capabilityRead, value.targetRead, value.mutation]
      .every(Number.isSafeInteger);
}

function isAuthoritySources(value: unknown): boolean {
  return exactRecord(value, ["actor", "role", "scope", "protectedState", "owner", "amount", "approval"])
    && Object.values(value).every((item) => typeof item === "string");
}

function isCapability(value: unknown): boolean {
  return exactRecord(value, [
    "id", "accessListId", "activeField", "principalField", "capabilityField", "source",
    "activeOnly", "matchCardinality", "commandDeclared", "stateTransitionDeclared",
  ])
    && [
      value.id, value.accessListId, value.activeField, value.principalField,
      value.capabilityField, value.source, value.matchCardinality,
    ].every((item) => typeof item === "string")
    && [value.activeOnly, value.commandDeclared, value.stateTransitionDeclared]
      .every((item) => typeof item === "boolean");
}

function isScope(value: unknown): boolean {
  return exactRecord(
    value,
    ["mode", "targetValueSource", "capabilityValueSource", "evaluation", "checkedBeforeMutation"],
    ["targetField", "accessField", "lookupListId"],
  )
    && [value.mode, value.targetValueSource, value.capabilityValueSource, value.evaluation]
      .every((item) => typeof item === "string")
    && [value.targetField, value.accessField, value.lookupListId]
      .every((item) => item === undefined || typeof item === "string")
    && typeof value.checkedBeforeMutation === "boolean";
}

function isAuthorityCheck(value: unknown): boolean {
  return exactRecord(value, [
    "commandType", "targetListId", "sequence", "authoritySources", "capability", "scope",
    "effectiveOperation",
  ])
    && typeof value.commandType === "string"
    && typeof value.targetListId === "string"
    && isAuthoritySequence(value.sequence)
    && isAuthoritySources(value.authoritySources)
    && isCapability(value.capability)
    && isScope(value.scope)
    && exactRecord(value.effectiveOperation, ["operation", "allowed"])
    && typeof value.effectiveOperation.operation === "string"
    && typeof value.effectiveOperation.allowed === "boolean";
}

function isPermissionGrant(value: unknown): boolean {
  return exactRecord(value, ["principalKind", "principalBinding", "role", "allowedOperations"])
    && [value.principalKind, value.principalBinding, value.role]
      .every((item) => typeof item === "string")
    && strings(value.allowedOperations, false);
}

function isPermissionModel(value: unknown): boolean {
  if (!exactRecord(value, ["listId", "inheritance", "directUserGrants", "browserOperations", "grants"])) {
    return false;
  }
  if (
    ![value.listId, value.inheritance, value.directUserGrants].every((item) => typeof item === "string")
    || !strings(value.browserOperations)
    || !records(value.grants, isPermissionGrant)
  ) return false;
  return uniqueBy(value.grants, (grant) => `${grant.principalBinding}\0${grant.role}`);
}

function isPermissionProbe(value: unknown): boolean {
  return exactRecord(value, ["listId", "principalBinding", "operations"])
    && typeof value.listId === "string"
    && typeof value.principalBinding === "string"
    && isRecord(value.operations)
    && Object.keys(value.operations).length > 0
    && Object.values(value.operations).every((item) => typeof item === "boolean");
}

function isSaveTransaction(value: unknown): boolean {
  return exactRecord(value, [
    "listId", "trigger", "patchedFields", "request", "conflict", "ambiguousFailure", "readback",
  ])
    && typeof value.listId === "string"
    && typeof value.trigger === "string"
    && strings(value.patchedFields, false)
    && exactRecord(value.request, ["method", "methodOverride", "serialization", "digest", "ifMatch"])
    && Object.values(value.request).every((item) => typeof item === "string")
    && exactRecord(value.conflict, ["status", "action"])
    && Number.isSafeInteger(value.conflict.status)
    && typeof value.conflict.action === "string"
    && exactRecord(value.ambiguousFailure, ["action", "writeRetry"])
    && typeof value.ambiguousFailure.action === "string"
    && typeof value.ambiguousFailure.writeRetry === "boolean"
    && exactRecord(value.readback, ["method", "semantic", "beforeSuccess"])
    && typeof value.readback.method === "string"
    && typeof value.readback.semantic === "boolean"
    && typeof value.readback.beforeSuccess === "boolean";
}

function isPaginationTraversal(value: unknown): boolean {
  return exactRecord(value, ["completeness", "mode", "continuation", "accumulation", "termination"])
    && [value.completeness, value.mode, value.accumulation, value.termination]
      .every((item) => typeof item === "string")
    && exactRecord(value.continuation, [
      "urlParsing", "sameOrigin", "sitePath", "visitedLinks", "pageLimit", "onLoop",
      "onCrossOrigin", "onSitePathEscape", "onPageLimit",
    ])
    && [
      value.continuation.urlParsing, value.continuation.onLoop,
      value.continuation.onCrossOrigin, value.continuation.onSitePathEscape,
      value.continuation.onPageLimit,
    ].every((item) => typeof item === "string")
    && [value.continuation.sameOrigin, value.continuation.sitePath, value.continuation.visitedLinks]
      .every((item) => typeof item === "boolean")
    && Number.isSafeInteger(value.continuation.pageLimit);
}

function isODataRequest(value: unknown): boolean {
  return exactRecord(value, [
    "listId", "fieldNames", "fieldSource", "queryConstruction", "pathConstruction",
    "stringLiteralEscaping", "rawFragmentsAccepted", "parameterEncoding",
  ])
    && [
      value.listId, value.fieldSource, value.queryConstruction, value.pathConstruction,
      value.stringLiteralEscaping, value.parameterEncoding,
    ].every((item) => typeof item === "string")
    && strings(value.fieldNames, false)
    && typeof value.rawFragmentsAccepted === "boolean";
}

function isFieldIdentity(value: unknown): boolean {
  return exactRecord(value, ["source", "internalName", "entityPropertyName"])
    && Object.values(value).every((item) => typeof item === "string");
}

function isFieldUse(value: unknown): boolean {
  return exactRecord(value, ["operation", "fieldName", "source"])
    && Object.values(value).every((item) => typeof item === "string");
}

function isFieldPayload(value: unknown): boolean {
  return exactRecord(value, ["serialization", "metadataType"], ["fieldTypeKind"])
    && typeof value.serialization === "string"
    && typeof value.metadataType === "string"
    && (value.fieldTypeKind === undefined || Number.isSafeInteger(value.fieldTypeKind));
}

const ACTUAL_FIELD_KEYS = new Set([
  "logicalName", "internalName", "type", "required", "indexed", "unique", "clientEditable",
  "serverAuthoritative", "immutableAfterCreate", "sensitive", "maxLength", "dateTimeMode",
  "choices", "lookupListId", "lookupField",
]);

function isFieldActual(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).some((key) => !ACTUAL_FIELD_KEYS.has(key))) return false;
  for (const [key, item] of Object.entries(value)) {
    if (["required", "indexed", "unique", "clientEditable", "serverAuthoritative", "immutableAfterCreate", "sensitive"].includes(key)) {
      if (typeof item !== "boolean") return false;
    } else if (key === "maxLength") {
      if (!Number.isSafeInteger(item) || (item as number) < 1) return false;
    } else if (key === "choices") {
      if (!strings(item, false)) return false;
    } else if (typeof item !== "string") {
      return false;
    }
  }
  return true;
}

function isFieldCompatibility(value: unknown): boolean {
  return exactRecord(value, ["response", "comparedProperties", "outcome", "writeAction"], ["actual"])
    && typeof value.response === "string"
    && strings(value.comparedProperties)
    && (value.actual === undefined || isFieldActual(value.actual))
    && typeof value.outcome === "string"
    && typeof value.writeAction === "string";
}

function isFieldOperation(value: unknown): boolean {
  return exactRecord(
    value,
    ["listId", "logicalName"],
    ["identity", "uses", "createPayload", "indexPayload", "compatibility"],
  )
    && typeof value.listId === "string"
    && typeof value.logicalName === "string"
    && (value.identity === undefined || isFieldIdentity(value.identity))
    && (value.uses === undefined || records(value.uses, isFieldUse))
    && (value.createPayload === undefined || isFieldPayload(value.createPayload))
    && (value.indexPayload === undefined || isFieldPayload(value.indexPayload))
    && (value.compatibility === undefined || isFieldCompatibility(value.compatibility));
}

function isHttpResponseBody(value: unknown): boolean {
  if (
    !exactRecord(value, ["schemaId", "targetListId", "expectedFields", "actual"])
    || typeof value.schemaId !== "string"
    || value.schemaId.length === 0
    || typeof value.targetListId !== "string"
    || value.targetListId.length === 0
    || !strings(value.expectedFields, false)
    || !exactRecord(value.actual, ["kind", "itemCount", "fields"])
    || (value.actual.kind !== "object" && value.actual.kind !== "list")
    || !isPositiveRevision(value.actual.itemCount)
    || !records(value.actual.fields, (field) =>
      exactRecord(field, ["name", "valueKind"])
      && typeof field.name === "string"
      && field.name.length > 0
      && ["boolean", "null", "number", "string"].includes(field.valueKind as string)
    , false)
  ) return false;
  const fields = value.actual.fields as readonly UnknownRecord[];
  return uniqueBy(fields, (field) => field.name as string);
}

function isHttpClassification(value: unknown): boolean {
  return exactRecord(
    value,
    ["status", "phase", "requestKind", "allowCreateMissing404", "error", "classification"],
    ["responseBody"],
  )
    && Number.isSafeInteger(value.status)
    && (value.status as number) >= 100
    && (value.status as number) <= 599
    && typeof value.phase === "string"
    && typeof value.requestKind === "string"
    && typeof value.allowCreateMissing404 === "boolean"
    && exactRecord(value.error, [], ["platformCode", "messageCategory"])
    && [value.error.platformCode, value.error.messageCategory]
      .every((item) => item === undefined || typeof item === "string")
    && (value.responseBody === undefined || isHttpResponseBody(value.responseBody))
    && typeof value.classification === "string";
}

function isIndexReadback(value: unknown): boolean {
  return typeof value === "boolean"
    || (exactRecord(value, ["performed", "observedFields"])
      && typeof value.performed === "boolean"
      && strings(value.observedFields));
}

function isIndexOperation(value: unknown): boolean {
  return exactRecord(value, ["sequence", "kind", "field", "readback"], ["payloadMetadataType"])
    && isPositiveRevision(value.sequence)
    && typeof value.kind === "string"
    && typeof value.field === "string"
    && (value.payloadMetadataType === undefined || typeof value.payloadMetadataType === "string")
    && isIndexReadback(value.readback);
}

function isIndexPlan(value: unknown): boolean {
  return exactRecord(value, [
    "listId", "currentFields", "requiredFields", "execution", "digest", "result",
    "maximumWrites", "writeCount", "operations", "finalReadback",
  ])
    && typeof value.listId === "string"
    && strings(value.currentFields)
    && strings(value.requiredFields)
    && typeof value.execution === "string"
    && exactRecord(value.digest, ["fresh", "bindsCurrent", "bindsRequired"])
    && Object.values(value.digest).every((item) => typeof item === "boolean")
    && typeof value.result === "string"
    && Number.isSafeInteger(value.maximumWrites)
    && Number.isSafeInteger(value.writeCount)
    && records(value.operations, isIndexOperation)
    && uniqueBy(value.operations, (operation) => `${operation.sequence}\0${operation.kind}\0${operation.field}`)
    && strings(value.finalReadback);
}

const SECTION_GUARDS: Readonly<Record<Wp06EvidenceSection, ValueGuard>> = {
  authorityChecks: isAuthorityCheck,
  permissionModels: isPermissionModel,
  permissionProbes: isPermissionProbe,
  saveTransactions: isSaveTransaction,
  paginationTraversals: isPaginationTraversal,
  odataRequests: isODataRequest,
  fieldOperations: isFieldOperation,
  httpClassifications: isHttpClassification,
  indexPlans: isIndexPlan,
};

function isSection(value: unknown): value is Wp06EvidenceSection {
  return typeof value === "string"
    && (WP06_EVIDENCE_SECTIONS as readonly string[]).includes(value);
}

function isSectionFacts(section: Wp06EvidenceSection, value: unknown): value is readonly unknown[] {
  return records(value, SECTION_GUARDS[section], false);
}

function isBinding(value: unknown): value is NormalizedWp06EvidenceBinding {
  return exactRecord(value, [
    "section", "contractArtifactPath", "contractArtifactSha256", "contractArtifactBytes",
    "sourceArtifactPath", "sourceArtifactSha256", "sourceArtifactBytes", "sourceArtifactKind",
    "projectionArtifactPath", "projectionArtifactSha256", "projectionArtifactBytes",
  ])
    && isSection(value.section)
    && typeof value.contractArtifactPath === "string"
    && value.contractArtifactPath.length > 0
    && typeof value.contractArtifactSha256 === "string"
    && SHA256.test(value.contractArtifactSha256)
    && isPositiveRevision(value.contractArtifactBytes)
    && typeof value.sourceArtifactPath === "string"
    && value.sourceArtifactPath.length > 0
    && typeof value.sourceArtifactSha256 === "string"
    && SHA256.test(value.sourceArtifactSha256)
    && isPositiveRevision(value.sourceArtifactBytes)
    && (value.sourceArtifactKind === "frontend" || value.sourceArtifactKind === "builder")
    && typeof value.projectionArtifactPath === "string"
    && value.projectionArtifactPath.length > 0
    && typeof value.projectionArtifactSha256 === "string"
    && SHA256.test(value.projectionArtifactSha256)
    && isPositiveRevision(value.projectionArtifactBytes);
}

export function parseNormalizedWp06Evidence(data: unknown): NormalizedWp06Evidence | undefined {
  if (!exactRecord(data, ["evidenceProfile", "contractRevision", "binding"], WP06_EVIDENCE_SECTIONS)) {
    return undefined;
  }
  if (
    data.evidenceProfile !== WP06_EVIDENCE_PROFILE
    || !isPositiveRevision(data.contractRevision)
    || !isBinding(data.binding)
  ) return undefined;
  const present = WP06_EVIDENCE_SECTIONS.filter((section) => data[section] !== undefined);
  if (
    present.length !== 1
    || present[0] !== data.binding.section
    || !isSectionFacts(data.binding.section, data[data.binding.section])
  ) return undefined;
  return data as unknown as NormalizedWp06Evidence;
}

export function parseNormalizedWp06SourceProjection(
  data: unknown,
): NormalizedWp06SourceProjection | undefined {
  if (!exactRecord(data, [
    "sourceProjectionProfile", "projectionRevision", "contractRevision", "sourceKind", "section",
    "adapter", "facts",
  ])) return undefined;
  if (
    data.sourceProjectionProfile !== WP06_SOURCE_PROJECTION_PROFILE
    || data.projectionRevision !== 1
    || !isPositiveRevision(data.contractRevision)
    || (data.sourceKind !== "frontend" && data.sourceKind !== "builder")
    || !isSection(data.section)
    || !exactRecord(data.adapter, ["id", "version"])
    || data.adapter.version !== 1
    || data.adapter.id !== (
      data.sourceKind === "frontend"
        ? "spflow.frontend-static-v1"
        : "spflow.power-automate-static-v1"
    )
    || !isSectionFacts(data.section, data.facts)
  ) return undefined;
  return data as unknown as NormalizedWp06SourceProjection;
}

export function wp06ProjectionMatchesEvidence(
  projection: NormalizedWp06SourceProjection,
  evidence: NormalizedWp06Evidence,
): boolean {
  const section = evidence.binding.section;
  return projection.contractRevision === evidence.contractRevision
    && projection.sourceKind === evidence.binding.sourceArtifactKind
    && projection.section === section
    && canonicalWp06Value(projection.facts) === canonicalWp06Value(evidence[section]);
}
