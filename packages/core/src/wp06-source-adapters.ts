import { canonicalize } from "./canonical-json.js";
import { createArtifactNode, type ArtifactNode } from "./artifact-node.js";
import {
  WP06_SOURCE_PROJECTION_PROFILE,
  parseNormalizedWp06SourceProjection,
  type NormalizedWp06SourceProjection,
  type Wp06EvidenceSection,
  type Wp06SourceArtifactKind,
} from "./types/wp06-evidence.js";

export const WP06_FRONTEND_SOURCE_IR_PROFILE = "spflow.frontend-source-ir-v1" as const;
export const WP06_POWER_AUTOMATE_SOURCE_IR_PROFILE = "spflow.power-automate-source-ir-v1" as const;
export const WP06_DERIVED_PROJECTION_PROFILE = "wp06-derived-projection-v1" as const;
export const WP06_FRONTEND_BUNDLE_PROFILE = "spflow.frontend-bundle-v1" as const;

type UnknownRecord = Record<string, unknown>;

interface ParsedSourceIr {
  readonly profile: typeof WP06_FRONTEND_SOURCE_IR_PROFILE
    | typeof WP06_POWER_AUTOMATE_SOURCE_IR_PROFILE;
  readonly contractRevision: number;
  readonly sourceKind: Wp06SourceArtifactKind;
  readonly section: Wp06EvidenceSection;
  readonly model: UnknownRecord;
}

export interface ParsedFrontendBundle {
  readonly contractRevision: number;
  readonly entrypoint: string;
  readonly files: readonly string[];
  readonly sources: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
}

export interface ParsedWp06PackageArtifact {
  readonly packageId: string;
  readonly flowIds: readonly string[];
  readonly inventory: readonly string[];
}

export interface ParsedWp06PackageManifest {
  readonly packageId?: string;
  readonly artifacts: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
}

const FRONTEND_SECTIONS = new Set<Wp06EvidenceSection>([
  "saveTransactions",
  "paginationTraversals",
  "odataRequests",
]);
const BUILDER_SECTIONS = new Set<Wp06EvidenceSection>([
  "authorityChecks",
  "permissionModels",
  "permissionProbes",
  "fieldOperations",
  "httpClassifications",
  "indexPlans",
]);
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
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function stringArray(value: unknown, allowEmpty = true): value is string[] {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every(nonEmptyString)
    && new Set(value).size === value.length;
}

function recordArray(value: unknown): value is UnknownRecord[] {
  return Array.isArray(value) && value.length > 0 && value.every(isRecord);
}

function parseSourceIr(data: unknown): ParsedSourceIr | undefined {
  if (!exactRecord(data, ["sourceIrProfile", "sourceRevision", "contractRevision", "section", "model"])) {
    return undefined;
  }
  if (
    data.sourceRevision !== 1
    || !positiveInteger(data.contractRevision)
    || !nonEmptyString(data.section)
    || !isRecord(data.model)
  ) return undefined;
  const section = data.section as Wp06EvidenceSection;
  if (
    data.sourceIrProfile === WP06_FRONTEND_SOURCE_IR_PROFILE
    && FRONTEND_SECTIONS.has(section)
  ) {
    return {
      profile: WP06_FRONTEND_SOURCE_IR_PROFILE,
      contractRevision: data.contractRevision,
      sourceKind: "frontend",
      section,
      model: data.model,
    };
  }
  if (
    data.sourceIrProfile === WP06_POWER_AUTOMATE_SOURCE_IR_PROFILE
    && BUILDER_SECTIONS.has(section)
  ) {
    return {
      profile: WP06_POWER_AUTOMATE_SOURCE_IR_PROFILE,
      contractRevision: data.contractRevision,
      sourceKind: "builder",
      section,
      model: data.model,
    };
  }
  return undefined;
}

function deriveSave(model: UnknownRecord): unknown[] | undefined {
  if (!exactRecord(model, ["interactions"]) || !recordArray(model.interactions)) return undefined;
  const values: unknown[] = [];
  for (const item of model.interactions) {
    if (!exactRecord(item, ["target", "activation", "fieldPolicy", "transport", "outcomes"])) return undefined;
    if (
      !exactRecord(item.target, ["list"])
      || !nonEmptyString(item.target.list)
      || !nonEmptyString(item.activation)
      || !exactRecord(item.fieldPolicy, ["patch"])
      || !stringArray(item.fieldPolicy.patch, false)
      || !exactRecord(item.transport, ["verb", "override", "codec", "digestLifecycle", "concurrencyToken"])
      || !Object.values(item.transport).every(nonEmptyString)
      || !exactRecord(item.outcomes, ["conflict", "uncertain", "verification"])
      || !exactRecord(item.outcomes.conflict, ["status", "action"])
      || !Number.isSafeInteger(item.outcomes.conflict.status)
      || !nonEmptyString(item.outcomes.conflict.action)
      || !exactRecord(item.outcomes.uncertain, ["action", "retryWrite"])
      || !nonEmptyString(item.outcomes.uncertain.action)
      || typeof item.outcomes.uncertain.retryWrite !== "boolean"
      || !exactRecord(item.outcomes.verification, ["verb", "semantic", "beforeSuccess"])
      || !nonEmptyString(item.outcomes.verification.verb)
      || typeof item.outcomes.verification.semantic !== "boolean"
      || typeof item.outcomes.verification.beforeSuccess !== "boolean"
    ) return undefined;
    values.push({
      listId: item.target.list,
      trigger: item.activation,
      patchedFields: item.fieldPolicy.patch,
      request: {
        method: item.transport.verb,
        methodOverride: item.transport.override,
        serialization: item.transport.codec,
        digest: item.transport.digestLifecycle,
        ifMatch: item.transport.concurrencyToken,
      },
      conflict: item.outcomes.conflict,
      ambiguousFailure: {
        action: item.outcomes.uncertain.action,
        writeRetry: item.outcomes.uncertain.retryWrite,
      },
      readback: {
        method: item.outcomes.verification.verb,
        semantic: item.outcomes.verification.semantic,
        beforeSuccess: item.outcomes.verification.beforeSuccess,
      },
    });
  }
  return values;
}

function derivePagination(model: UnknownRecord): unknown[] | undefined {
  if (!exactRecord(model, ["loaders"]) || !recordArray(model.loaders)) return undefined;
  const values: unknown[] = [];
  for (const item of model.loaders) {
    if (
      !exactRecord(item, ["requirement", "strategy", "nextLink", "collection", "finish"])
      || !nonEmptyString(item.requirement)
      || !nonEmptyString(item.strategy)
      || !exactRecord(item.nextLink, [
        "parser", "sameOrigin", "siteBoundary", "trackVisited", "maximumPages",
        "loopAction", "crossOriginAction", "siteEscapeAction", "limitAction",
      ])
      || !nonEmptyString(item.nextLink.parser)
      || typeof item.nextLink.sameOrigin !== "boolean"
      || typeof item.nextLink.siteBoundary !== "boolean"
      || typeof item.nextLink.trackVisited !== "boolean"
      || !Number.isSafeInteger(item.nextLink.maximumPages)
      || !nonEmptyString(item.nextLink.loopAction)
      || !nonEmptyString(item.nextLink.crossOriginAction)
      || !nonEmptyString(item.nextLink.siteEscapeAction)
      || !nonEmptyString(item.nextLink.limitAction)
      || !nonEmptyString(item.collection)
      || !nonEmptyString(item.finish)
    ) return undefined;
    values.push({
      completeness: item.requirement,
      mode: item.strategy,
      continuation: {
        urlParsing: item.nextLink.parser,
        sameOrigin: item.nextLink.sameOrigin,
        sitePath: item.nextLink.siteBoundary,
        visitedLinks: item.nextLink.trackVisited,
        pageLimit: item.nextLink.maximumPages,
        onLoop: item.nextLink.loopAction,
        onCrossOrigin: item.nextLink.crossOriginAction,
        onSitePathEscape: item.nextLink.siteEscapeAction,
        onPageLimit: item.nextLink.limitAction,
      },
      accumulation: item.collection,
      termination: item.finish,
    });
  }
  return values;
}

function deriveOData(model: UnknownRecord): unknown[] | undefined {
  if (!exactRecord(model, ["queries"]) || !recordArray(model.queries)) return undefined;
  const values: unknown[] = [];
  for (const item of model.queries) {
    if (
      !exactRecord(item, ["targetList", "select", "selectionSource", "builders", "rawFragments", "encoding"])
      || !nonEmptyString(item.targetList)
      || !stringArray(item.select, false)
      || !nonEmptyString(item.selectionSource)
      || !exactRecord(item.builders, ["query", "path", "literal"])
      || !Object.values(item.builders).every(nonEmptyString)
      || typeof item.rawFragments !== "boolean"
      || !nonEmptyString(item.encoding)
    ) return undefined;
    values.push({
      listId: item.targetList,
      fieldNames: item.select,
      fieldSource: item.selectionSource,
      queryConstruction: item.builders.query,
      pathConstruction: item.builders.path,
      stringLiteralEscaping: item.builders.literal,
      rawFragmentsAccepted: item.rawFragments,
      parameterEncoding: item.encoding,
    });
  }
  return values;
}

function deriveAuthority(model: UnknownRecord): unknown[] | undefined {
  if (!exactRecord(model, ["handlers"]) || !recordArray(model.handlers)) return undefined;
  const values: unknown[] = [];
  for (const item of model.handlers) {
    if (
      !exactRecord(item, ["command", "targetList", "orderedSteps", "authoritativeReads", "capabilityLookup", "scopeGuard", "mutation"])
      || !nonEmptyString(item.command)
      || !nonEmptyString(item.targetList)
      || !recordArray(item.orderedSteps)
      || !item.orderedSteps.every((step) => exactRecord(step, ["kind"]) && nonEmptyString(step.kind))
      || !exactRecord(item.authoritativeReads, ["actor", "role", "scope", "state", "owner", "amount", "approval"])
      || !Object.values(item.authoritativeReads).every(nonEmptyString)
      || !exactRecord(item.capabilityLookup, [
        "capabilityId", "accessList", "activeColumn", "principalColumn", "capabilityColumn",
        "readSource", "activeOnly", "cardinality", "commandBound", "transitionBound",
      ])
      || ![
        item.capabilityLookup.capabilityId, item.capabilityLookup.accessList,
        item.capabilityLookup.activeColumn, item.capabilityLookup.principalColumn,
        item.capabilityLookup.capabilityColumn, item.capabilityLookup.readSource,
        item.capabilityLookup.cardinality,
      ].every(nonEmptyString)
      || ![
        item.capabilityLookup.activeOnly, item.capabilityLookup.commandBound,
        item.capabilityLookup.transitionBound,
      ].every((value) => typeof value === "boolean")
      || !exactRecord(
        item.scopeGuard,
        ["mode", "targetValue", "capabilityValue", "evaluation", "beforeMutation"],
        ["targetColumn", "accessColumn", "lookupList"],
      )
      || ![item.scopeGuard.mode, item.scopeGuard.targetValue, item.scopeGuard.capabilityValue, item.scopeGuard.evaluation].every(nonEmptyString)
      || ![item.scopeGuard.targetColumn, item.scopeGuard.accessColumn, item.scopeGuard.lookupList].every((value) => value === undefined || nonEmptyString(value))
      || typeof item.scopeGuard.beforeMutation !== "boolean"
      || !exactRecord(item.mutation, ["operation", "allowed"])
      || !nonEmptyString(item.mutation.operation)
      || typeof item.mutation.allowed !== "boolean"
    ) return undefined;
    const orderedSteps = item.orderedSteps as UnknownRecord[];
    const position = (kind: string): number => orderedSteps.findIndex((step) => step.kind === kind) + 1;
    if (["identity-read", "capability-read", "target-read", "mutation"].some((kind) => position(kind) < 1)) return undefined;
    values.push({
      commandType: item.command,
      targetListId: item.targetList,
      sequence: {
        identityRead: position("identity-read"),
        capabilityRead: position("capability-read"),
        targetRead: position("target-read"),
        mutation: position("mutation"),
      },
      authoritySources: {
        actor: item.authoritativeReads.actor,
        role: item.authoritativeReads.role,
        scope: item.authoritativeReads.scope,
        protectedState: item.authoritativeReads.state,
        owner: item.authoritativeReads.owner,
        amount: item.authoritativeReads.amount,
        approval: item.authoritativeReads.approval,
      },
      capability: {
        id: item.capabilityLookup.capabilityId,
        accessListId: item.capabilityLookup.accessList,
        activeField: item.capabilityLookup.activeColumn,
        principalField: item.capabilityLookup.principalColumn,
        capabilityField: item.capabilityLookup.capabilityColumn,
        source: item.capabilityLookup.readSource,
        activeOnly: item.capabilityLookup.activeOnly,
        matchCardinality: item.capabilityLookup.cardinality,
        commandDeclared: item.capabilityLookup.commandBound,
        stateTransitionDeclared: item.capabilityLookup.transitionBound,
      },
      scope: {
        mode: item.scopeGuard.mode,
        ...(item.scopeGuard.targetColumn === undefined ? {} : { targetField: item.scopeGuard.targetColumn }),
        ...(item.scopeGuard.accessColumn === undefined ? {} : { accessField: item.scopeGuard.accessColumn }),
        ...(item.scopeGuard.lookupList === undefined ? {} : { lookupListId: item.scopeGuard.lookupList }),
        targetValueSource: item.scopeGuard.targetValue,
        capabilityValueSource: item.scopeGuard.capabilityValue,
        evaluation: item.scopeGuard.evaluation,
        checkedBeforeMutation: item.scopeGuard.beforeMutation,
      },
      effectiveOperation: item.mutation,
    });
  }
  return values;
}

function derivePermissionModels(model: UnknownRecord): unknown[] | undefined {
  if (!exactRecord(model, ["plans"]) || !recordArray(model.plans)) return undefined;
  const values: unknown[] = [];
  for (const item of model.plans) {
    if (
      !exactRecord(item, ["targetList", "inheritanceMode", "userGrantPolicy", "browserAllows", "assignments"])
      || !nonEmptyString(item.targetList)
      || !nonEmptyString(item.inheritanceMode)
      || !nonEmptyString(item.userGrantPolicy)
      || !stringArray(item.browserAllows)
      || !recordArray(item.assignments)
    ) return undefined;
    const grants = [];
    for (const assignment of item.assignments) {
      if (
        !exactRecord(assignment, ["principalType", "binding", "roleName", "allows"])
        || !nonEmptyString(assignment.principalType)
        || !nonEmptyString(assignment.binding)
        || !nonEmptyString(assignment.roleName)
        || !stringArray(assignment.allows, false)
      ) return undefined;
      grants.push({
        principalKind: assignment.principalType,
        principalBinding: assignment.binding,
        role: assignment.roleName,
        allowedOperations: assignment.allows,
      });
    }
    values.push({
      listId: item.targetList,
      inheritance: item.inheritanceMode,
      directUserGrants: item.userGrantPolicy,
      browserOperations: item.browserAllows,
      grants,
    });
  }
  return values;
}

function derivePermissionProbes(model: UnknownRecord): unknown[] | undefined {
  if (!exactRecord(model, ["readbacks"]) || !recordArray(model.readbacks)) return undefined;
  const values: unknown[] = [];
  for (const item of model.readbacks) {
    if (
      !exactRecord(item, ["targetList", "principal", "checks"])
      || !nonEmptyString(item.targetList)
      || !nonEmptyString(item.principal)
      || !recordArray(item.checks)
    ) return undefined;
    const operations: Record<string, boolean> = {};
    for (const check of item.checks) {
      if (!exactRecord(check, ["operation", "allowed"]) || !nonEmptyString(check.operation) || typeof check.allowed !== "boolean") return undefined;
      if (Object.hasOwn(operations, check.operation)) return undefined;
      operations[check.operation] = check.allowed;
    }
    values.push({ listId: item.targetList, principalBinding: item.principal, operations });
  }
  return values;
}

function deriveFieldOperations(model: UnknownRecord): unknown[] | undefined {
  if (!exactRecord(model, ["fields"]) || !recordArray(model.fields)) return undefined;
  const values: unknown[] = [];
  for (const item of model.fields) {
    if (!exactRecord(item, ["targetList", "fieldKey"], ["identityRead", "consumers", "createRequest", "indexRequest", "compatibilityRead"])) return undefined;
    if (!nonEmptyString(item.targetList) || !nonEmptyString(item.fieldKey)) return undefined;
    const output: UnknownRecord = { listId: item.targetList, logicalName: item.fieldKey };
    if (item.identityRead !== undefined) {
      if (!exactRecord(item.identityRead, ["readFrom", "internal", "entityProperty"]) || !Object.values(item.identityRead).every(nonEmptyString)) return undefined;
      output.identity = { source: item.identityRead.readFrom, internalName: item.identityRead.internal, entityPropertyName: item.identityRead.entityProperty };
    }
    if (item.consumers !== undefined) {
      if (!recordArray(item.consumers)) return undefined;
      output.uses = item.consumers.map((use) => {
        if (!exactRecord(use, ["operation", "name", "reference"]) || !Object.values(use).every(nonEmptyString)) throw new Error("invalid-field-consumer");
        return { operation: use.operation, fieldName: use.name, source: use.reference };
      });
    }
    for (const [rawKey, outputKey] of [["createRequest", "createPayload"], ["indexRequest", "indexPayload"]] as const) {
      const request = item[rawKey];
      if (request === undefined) continue;
      if (!exactRecord(request, ["codec", "metadata"], ["kind"]) || !nonEmptyString(request.codec) || !nonEmptyString(request.metadata) || (request.kind !== undefined && !Number.isSafeInteger(request.kind))) return undefined;
      output[outputKey] = { serialization: request.codec, metadataType: request.metadata, ...(request.kind === undefined ? {} : { fieldTypeKind: request.kind }) };
    }
    if (item.compatibilityRead !== undefined) {
      const compatibility = item.compatibilityRead;
      if (!exactRecord(compatibility, ["httpResult", "compare", "decision", "action"], ["observed"]) || !nonEmptyString(compatibility.httpResult) || !stringArray(compatibility.compare) || !nonEmptyString(compatibility.decision) || !nonEmptyString(compatibility.action) || (compatibility.observed !== undefined && !isRecord(compatibility.observed))) return undefined;
      output.compatibility = { response: compatibility.httpResult, comparedProperties: compatibility.compare, ...(compatibility.observed === undefined ? {} : { actual: compatibility.observed }), outcome: compatibility.decision, writeAction: compatibility.action };
    }
    values.push(output);
  }
  return values;
}

type BodyValueKind = "boolean" | "null" | "number" | "string";

function bodyValueKind(value: unknown): BodyValueKind | undefined {
  if (value === null) return "null";
  return ["boolean", "number", "string"].includes(typeof value)
    ? typeof value as BodyValueKind
    : undefined;
}

function projectBody(value: unknown): UnknownRecord | undefined {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length === 0 || !rows.every(isRecord)) return undefined;
  const first = rows[0]!;
  const names = Object.keys(first).sort();
  if (names.length === 0) return undefined;
  const fields = names.map((name) => {
    const kind = bodyValueKind(first[name]);
    return kind === undefined ? undefined : { name, valueKind: kind };
  });
  if (fields.some((field) => field === undefined)) return undefined;
  for (const row of rows) {
    if (canonicalize(Object.keys(row).sort()) !== canonicalize(names)) return undefined;
    for (const field of fields) {
      if (field === undefined || bodyValueKind(row[field.name]) !== field.valueKind) return undefined;
    }
  }
  return {
    kind: Array.isArray(value) ? "list" : "object",
    itemCount: rows.length,
    fields,
  };
}

function deriveHttp(model: UnknownRecord): unknown[] | undefined {
  if (!exactRecord(model, ["requests"]) || !recordArray(model.requests)) return undefined;
  const values: unknown[] = [];
  for (const item of model.requests) {
    if (
      !exactRecord(item, ["status", "phase", "kind", "permitInitial404", "error", "result"], ["parsedResponse"])
      || !Number.isSafeInteger(item.status)
      || !nonEmptyString(item.phase)
      || !nonEmptyString(item.kind)
      || typeof item.permitInitial404 !== "boolean"
      || !exactRecord(item.error, [], ["code", "category"])
      || ![item.error.code, item.error.category].every((value) => value === undefined || nonEmptyString(value))
      || !nonEmptyString(item.result)
    ) return undefined;
    let responseBody: UnknownRecord | undefined;
    if (item.parsedResponse !== undefined) {
      if (
        !exactRecord(item.parsedResponse, ["schemaId", "targetList", "expectedFields", "body"])
        || !nonEmptyString(item.parsedResponse.schemaId)
        || !nonEmptyString(item.parsedResponse.targetList)
        || !stringArray(item.parsedResponse.expectedFields, false)
      ) return undefined;
      const actual = projectBody(item.parsedResponse.body);
      if (actual === undefined) return undefined;
      responseBody = {
        schemaId: item.parsedResponse.schemaId,
        targetListId: item.parsedResponse.targetList,
        expectedFields: item.parsedResponse.expectedFields,
        actual,
      };
    }
    values.push({
      status: item.status,
      phase: item.phase,
      requestKind: item.kind,
      allowCreateMissing404: item.permitInitial404,
      error: {
        ...(item.error.code === undefined ? {} : { platformCode: item.error.code }),
        ...(item.error.category === undefined ? {} : { messageCategory: item.error.category }),
      },
      ...(responseBody === undefined ? {} : { responseBody }),
      classification: item.result,
    });
  }
  return values;
}

function deriveIndexes(model: UnknownRecord): unknown[] | undefined {
  if (!exactRecord(model, ["transactions"]) || !recordArray(model.transactions)) return undefined;
  const values: unknown[] = [];
  for (const item of model.transactions) {
    if (
      !exactRecord(item, ["targetList", "before", "desired", "mode", "approval", "outcome", "maxWrites", "writes", "steps", "after"])
      || !nonEmptyString(item.targetList)
      || !stringArray(item.before)
      || !stringArray(item.desired)
      || !nonEmptyString(item.mode)
      || !exactRecord(item.approval, ["fresh", "bindsBefore", "bindsDesired"])
      || !Object.values(item.approval).every((value) => typeof value === "boolean")
      || !nonEmptyString(item.outcome)
      || !Number.isSafeInteger(item.maxWrites)
      || !Number.isSafeInteger(item.writes)
      || !Array.isArray(item.steps)
      || !stringArray(item.after)
    ) return undefined;
    const operations = [];
    for (const step of item.steps) {
      if (!exactRecord(step, ["order", "action", "field", "readback"], ["metadata"]) || !positiveInteger(step.order) || !nonEmptyString(step.action) || !nonEmptyString(step.field) || (step.metadata !== undefined && !nonEmptyString(step.metadata))) return undefined;
      let readback: unknown;
      if (typeof step.readback === "boolean") {
        readback = step.readback;
      } else if (exactRecord(step.readback, ["done", "fields"]) && typeof step.readback.done === "boolean" && stringArray(step.readback.fields)) {
        readback = { performed: step.readback.done, observedFields: step.readback.fields };
      } else return undefined;
      operations.push({ sequence: step.order, kind: step.action, field: step.field, ...(step.metadata === undefined ? {} : { payloadMetadataType: step.metadata }), readback });
    }
    values.push({
      listId: item.targetList,
      currentFields: item.before,
      requiredFields: item.desired,
      execution: item.mode,
      digest: { fresh: item.approval.fresh, bindsCurrent: item.approval.bindsBefore, bindsRequired: item.approval.bindsDesired },
      result: item.outcome,
      maximumWrites: item.maxWrites,
      writeCount: item.writes,
      operations,
      finalReadback: item.after,
    });
  }
  return values;
}

function deriveFacts(source: ParsedSourceIr): unknown[] | undefined {
  switch (source.section) {
    case "saveTransactions": return deriveSave(source.model);
    case "paginationTraversals": return derivePagination(source.model);
    case "odataRequests": return deriveOData(source.model);
    case "authorityChecks": return deriveAuthority(source.model);
    case "permissionModels": return derivePermissionModels(source.model);
    case "permissionProbes": return derivePermissionProbes(source.model);
    case "fieldOperations": return deriveFieldOperations(source.model);
    case "httpClassifications": return deriveHttp(source.model);
    case "indexPlans": return deriveIndexes(source.model);
  }
}

export function wp06SourceProfile(data: unknown): string | undefined {
  return parseSourceIr(data)?.profile;
}

export function deriveWp06SourceProjection(
  data: unknown,
): NormalizedWp06SourceProjection | undefined {
  const source = parseSourceIr(data);
  if (source === undefined) return undefined;
  let facts: unknown[] | undefined;
  try {
    facts = deriveFacts(source);
  } catch {
    return undefined;
  }
  if (facts === undefined) return undefined;
  return parseNormalizedWp06SourceProjection({
    sourceProjectionProfile: WP06_SOURCE_PROJECTION_PROFILE,
    projectionRevision: 1,
    contractRevision: source.contractRevision,
    sourceKind: source.sourceKind,
    section: source.section,
    adapter: {
      id: source.sourceKind === "frontend"
        ? "spflow.frontend-static-v1"
        : "spflow.power-automate-static-v1",
      version: 1,
    },
    facts,
  });
}

export function buildWp06ProjectionArtifact(source: ArtifactNode): ArtifactNode | undefined {
  const projection = deriveWp06SourceProjection(source.data);
  if (projection === undefined || source.kind !== projection.sourceKind) return undefined;
  const relativePath = `.spflow-derived/wp06/${source.kind}/${source.relativePath}.${projection.section}.json`;
  const bytes = Buffer.from(`${canonicalize(projection)}\n`, "utf8");
  return createArtifactNode({
    kind: "projection",
    relativePath,
    sourceProfile: WP06_DERIVED_PROJECTION_PROFILE,
    data: projection,
    bytes,
  });
}

export function parseWp06FrontendBundle(data: unknown): ParsedFrontendBundle | undefined {
  if (!exactRecord(data, ["artifactProfile", "artifactRevision", "contractRevision", "entrypoint", "files", "sources"])) return undefined;
  if (
    data.artifactProfile !== WP06_FRONTEND_BUNDLE_PROFILE
    || data.artifactRevision !== 1
    || !positiveInteger(data.contractRevision)
    || !nonEmptyString(data.entrypoint)
    || !stringArray(data.files, false)
    || !recordArray(data.sources)
  ) return undefined;
  const sources = [];
  for (const source of data.sources) {
    if (
      !exactRecord(source, ["path", "sha256", "bytes"])
      || !nonEmptyString(source.path)
      || !nonEmptyString(source.sha256)
      || !SHA256.test(source.sha256)
      || !positiveInteger(source.bytes)
    ) return undefined;
    sources.push({ path: source.path, sha256: source.sha256, bytes: source.bytes });
  }
  if (new Set(sources.map(({ path }) => path)).size !== sources.length) return undefined;
  return {
    contractRevision: data.contractRevision,
    entrypoint: data.entrypoint,
    files: data.files,
    sources,
  };
}

export function parseWp06PackageArtifact(
  data: unknown,
): ParsedWp06PackageArtifact | undefined {
  if (
    !exactRecord(data, ["packageId", "flowIds", "inventory"])
    || !nonEmptyString(data.packageId)
    || !stringArray(data.flowIds, false)
    || !stringArray(data.inventory, false)
  ) return undefined;
  return {
    packageId: data.packageId,
    flowIds: data.flowIds,
    inventory: data.inventory,
  };
}

export function parseWp06PackageManifest(
  data: unknown,
): ParsedWp06PackageManifest | undefined {
  if (exactRecord(data, ["packageId", "artifact"])) {
    if (
      !nonEmptyString(data.packageId)
      || !exactRecord(data.artifact, ["path", "sha256", "bytes"])
      || !nonEmptyString(data.artifact.path)
      || !nonEmptyString(data.artifact.sha256)
      || !SHA256.test(data.artifact.sha256)
      || !positiveInteger(data.artifact.bytes)
    ) return undefined;
    return {
      packageId: data.packageId,
      artifacts: [{
        path: data.artifact.path,
        sha256: data.artifact.sha256,
        bytes: data.artifact.bytes,
      }],
    };
  }

  if (!exactRecord(data, ["files"], ["schemaVersion"]) || !recordArray(data.files)) {
    return undefined;
  }
  if (data.schemaVersion !== undefined && !nonEmptyString(data.schemaVersion)) return undefined;
  const artifacts = [];
  for (const file of data.files) {
    if (
      !exactRecord(file, ["path", "sha256", "bytes"], ["mediaType", "role"])
      || !nonEmptyString(file.path)
      || !nonEmptyString(file.sha256)
      || !SHA256.test(file.sha256)
      || !positiveInteger(file.bytes)
      || (file.mediaType !== undefined && !nonEmptyString(file.mediaType))
      || (file.role !== undefined && !nonEmptyString(file.role))
    ) return undefined;
    artifacts.push({ path: file.path, sha256: file.sha256, bytes: file.bytes });
  }
  if (new Set(artifacts.map(({ path }) => path)).size !== artifacts.length) return undefined;
  return { artifacts };
}
