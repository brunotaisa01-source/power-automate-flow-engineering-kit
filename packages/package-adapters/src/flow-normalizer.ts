import { parseWdlExpression, WdlParseError } from "./wdl-parser.ts";
import type {
  NormalizedAction,
  NormalizedControlBranch,
  NormalizedConnector,
  NormalizedExpression,
  NormalizedFlow,
  NormalizedRetryPolicy,
  NormalizedRunAfter,
} from "@spflow/core/types/rule-input";

export type {
  NormalizedAction,
  NormalizedControlBranch,
  NormalizedConnector,
  NormalizedExpression,
  NormalizedFlow,
  NormalizedRetryPolicy,
  NormalizedRunAfter,
  NormalizedTrigger,
} from "@spflow/core/types/rule-input";

export interface NormalizeFlowOptions {
  readonly id: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function requireRecord(value: unknown): UnknownRecord {
  if (!isRecord(value)) {
    throw new TypeError("Flow definition contains an unsupported structure.");
  }
  return value;
}

function cloneAndFreeze(value: unknown): unknown {
  const clone = structuredClone(value);
  const seen = new Set<object>();
  const freeze = (item: unknown): void => {
    if (item === null || typeof item !== "object" || seen.has(item)) {
      return;
    }
    seen.add(item);
    for (const child of Object.values(item)) {
      freeze(child);
    }
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}

function collectExpressions(value: unknown, pointer = ""): NormalizedExpression[] {
  if (typeof value === "string") {
    if (value.startsWith("@")) {
      try {
        const parsed = parseWdlExpression(value);
        return [Object.freeze({
          pointer,
          source: value,
          valid: true,
          functions: parsed.functions,
          actionReferences: parsed.actionReferences,
          readbackAssertions: parsed.readbackAssertions,
          root: parsed.root,
        })];
      } catch (error) {
        if (!(error instanceof WdlParseError)) {
          throw error;
        }
        return [Object.freeze({
          pointer,
          source: value,
          valid: false,
          functions: Object.freeze([]),
          actionReferences: Object.freeze([]),
          readbackAssertions: Object.freeze([]),
        })];
      }
    }
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectExpressions(item, `${pointer}/${index}`)
    );
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value)
    .sort(([left], [right]) => compareText(left, right))
    .flatMap(([key, child]) =>
      collectExpressions(child, `${pointer}/${pointerSegment(key)}`)
    );
}

function ownExpressions(action: UnknownRecord): readonly NormalizedExpression[] {
  const structuralKeys = new Set(["actions", "cases", "default", "else"]);
  return Object.freeze(
    Object.entries(action)
      .filter(([key]) => !structuralKeys.has(key))
      .sort(([left], [right]) => compareText(left, right))
      .flatMap(([key, value]) =>
        collectExpressions(value, `/${pointerSegment(key)}`)
      ),
  );
}

function normalizeRunAfter(value: unknown): readonly NormalizedRunAfter[] {
  if (value === undefined) {
    return Object.freeze([]);
  }
  const runAfter = requireRecord(value);
  return Object.freeze(
    Object.entries(runAfter)
      .sort(([left], [right]) => compareText(left, right))
      .map(([actionId, statuses]) => {
        if (!Array.isArray(statuses) || !statuses.every((status) => typeof status === "string")) {
          throw new TypeError("Action runAfter statuses must be strings.");
        }
        return Object.freeze({
          actionId,
          statuses: Object.freeze([...new Set(statuses)].sort(compareText)),
        });
      }),
  );
}

function optionalString(record: UnknownRecord, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function headerValue(
  headers: UnknownRecord | undefined,
  expectedName: string,
): string | undefined {
  if (headers === undefined) {
    return undefined;
  }
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === expectedName.toLowerCase(),
  );
  return entry !== undefined && typeof entry[1] === "string" ? entry[1] : undefined;
}

function firstString(
  record: UnknownRecord | undefined,
  keys: readonly string[],
): string | undefined {
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    const value = optionalString(record, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function normalizeConnector(action: UnknownRecord): NormalizedConnector | undefined {
  const inputs = isRecord(action.inputs) ? action.inputs : undefined;
  const host = inputs !== undefined && isRecord(inputs.host) ? inputs.host : undefined;
  const connection = host !== undefined && isRecord(host.connection) ? host.connection : undefined;
  const reference = connection === undefined
    ? undefined
    : optionalString(connection, "referenceName") ?? optionalString(connection, "name");
  const operationId = host === undefined
    ? undefined
    : optionalString(host, "operationId") ?? optionalString(inputs ?? {}, "operationId");
  if (reference === undefined && operationId === undefined) {
    return undefined;
  }
  if (reference === undefined || operationId === undefined) {
    throw new TypeError("Connector action is missing normalized operation metadata.");
  }

  const method = optionalString(inputs ?? {}, "method");
  const uri = optionalString(inputs ?? {}, "uri");
  const parameters = inputs !== undefined && isRecord(inputs.parameters)
    ? inputs.parameters
    : undefined;
  const resource = firstString(parameters, ["listId", "table", "resource"]);
  const identifier = firstString(parameters, ["itemId", "id"]);
  let identifierDataflow: NormalizedConnector["identifierDataflow"];
  if (identifier?.startsWith("@")) {
    try {
      identifierDataflow = parseWdlExpression(identifier).directDataReference;
    } catch (error) {
      if (!(error instanceof WdlParseError)) {
        throw error;
      }
    }
  }
  const headers = inputs !== undefined && isRecord(inputs.headers)
    ? inputs.headers
    : undefined;
  const overrideMethod = headerValue(headers, "X-HTTP-Method");
  const ifMatch = headerValue(headers, "IF-MATCH");
  const uriClass = uri === undefined
    ? undefined
    : uri.startsWith("@")
      ? "dynamic" as const
      : /^https?:\/\//i.test(uri)
        ? "absolute" as const
        : "relative" as const;
  return Object.freeze({
    reference,
    operationId,
    ...(resource === undefined ? {} : { resource }),
    ...(identifier === undefined ? {} : { identifier }),
    ...(identifierDataflow === undefined ? {} : { identifierDataflow }),
    ...(method === undefined ? {} : { method }),
    ...(uriClass === undefined ? {} : { uriClass }),
    ...(overrideMethod === undefined ? {} : { overrideMethod }),
    ...(ifMatch === undefined ? {} : { ifMatch }),
  });
}

function terminationStatus(action: UnknownRecord): string | undefined {
  if (optionalString(action, "type")?.toLowerCase() !== "terminate") {
    return undefined;
  }
  return isRecord(action.inputs) ? optionalString(action.inputs, "status") : undefined;
}

function normalizeRetryPolicy(action: UnknownRecord): NormalizedRetryPolicy | undefined {
  const runtime = isRecord(action.runtimeConfiguration) ? action.runtimeConfiguration : undefined;
  const policy = runtime !== undefined && isRecord(runtime.retryPolicy)
    ? runtime.retryPolicy
    : undefined;
  if (policy === undefined) {
    return undefined;
  }
  const type = optionalString(policy, "type");
  if (type === undefined) {
    throw new TypeError("Retry policy is missing its type.");
  }
  const count = typeof policy.count === "number" ? policy.count : undefined;
  const interval = optionalString(policy, "interval");
  return Object.freeze({
    type,
    ...(count === undefined ? {} : { count }),
    ...(interval === undefined ? {} : { interval }),
  });
}

interface NestedActionRecord {
  readonly actions: UnknownRecord;
  readonly segment: string;
  readonly controlBranch: NormalizedControlBranch;
}

function nestedActionRecords(action: UnknownRecord, actionType: string): NestedActionRecord[] {
  const children: NestedActionRecord[] = [];
  if (action.actions !== undefined) {
    children.push({
      actions: requireRecord(action.actions),
      segment: "actions",
      controlBranch: ["condition", "if"].includes(actionType.toLowerCase())
        ? "condition-true"
        : "container",
    });
  }
  for (const branchName of ["else", "default"] as const) {
    const branch = action[branchName];
    if (branch === undefined) {
      continue;
    }
    const branchRecord = requireRecord(branch);
    if (branchRecord.actions !== undefined) {
      children.push({
        actions: requireRecord(branchRecord.actions),
        segment: `${branchName}/actions`,
        controlBranch: branchName === "else" ? "condition-false" : "default",
      });
    }
  }
  if (action.cases !== undefined) {
    const cases = requireRecord(action.cases);
    for (const [caseName, value] of Object.entries(cases).sort(([left], [right]) =>
      compareText(left, right)
    )) {
      const caseRecord = requireRecord(value);
      if (caseRecord.actions !== undefined) {
        children.push({
          actions: requireRecord(caseRecord.actions),
          segment: `cases/${pointerSegment(caseName)}/actions`,
          controlBranch: "case",
        });
      }
    }
  }
  return children;
}

export function normalizeFlow(
  rawFlow: unknown,
  options: NormalizeFlowOptions,
): NormalizedFlow {
  const envelope = requireRecord(rawFlow);
  const properties = isRecord(envelope.properties) ? envelope.properties : envelope;
  const definition = isRecord(properties.definition) ? properties.definition : properties;
  const flowMetadata = isRecord(properties.metadata) ? properties.metadata : undefined;
  const triggers = requireRecord(definition.triggers);
  const triggerEntries = Object.entries(triggers).sort(([left], [right]) => compareText(left, right));
  if (triggerEntries.length !== 1) {
    throw new TypeError("Flow definition must contain exactly one trigger.");
  }
  const triggerEntry = triggerEntries[0];
  if (triggerEntry === undefined) {
    throw new TypeError("Flow definition must contain exactly one trigger.");
  }
  const [triggerId, triggerValue] = triggerEntry;
  const triggerRecord = requireRecord(triggerValue);
  const triggerType = optionalString(triggerRecord, "type");
  if (triggerType === undefined) {
    throw new TypeError("Flow trigger is missing its type.");
  }

  const normalizedById = new Map<string, NormalizedAction>();
  const foldedIds = new Set<string>();
  const visitActions = (
    actions: UnknownRecord,
    parent?: {
      readonly id: string;
      readonly type: string;
      readonly controlBranch: NormalizedControlBranch;
    },
    containerId = "$",
  ): void => {
    for (const [containerIndex, [id, value]] of Object.entries(actions).entries()) {
      const foldedId = id.toLowerCase();
      if (foldedIds.has(foldedId)) {
        throw new TypeError("Action IDs must be unique after case normalization.");
      }
      foldedIds.add(foldedId);
      const action = requireRecord(value);
      const type = optionalString(action, "type");
      if (type === undefined) {
        throw new TypeError("Flow action is missing its type.");
      }
      const metadata = isRecord(action.metadata) ? action.metadata : undefined;
      const declaredRole = metadata === undefined ? undefined : optionalString(metadata, "spflowRole");
      const connector = normalizeConnector(action);
      const retryPolicy = normalizeRetryPolicy(action);
      const expressions = ownExpressions(action);
      const status = terminationStatus(action);
      const normalized: NormalizedAction = Object.freeze({
        id,
        type,
        containerId,
        containerIndex,
        ...(parent === undefined ? {} : {
          parentId: parent.id,
          parentType: parent.type,
          controlBranch: parent.controlBranch,
        }),
        runAfter: normalizeRunAfter(action.runAfter),
        expressionPointers: Object.freeze(expressions.map(({ pointer }) => pointer)),
        expressions,
        ...(connector === undefined ? {} : { connector }),
        ...(retryPolicy === undefined ? {} : { retryPolicy }),
        ...(action.inputs === undefined ? {} : { inputs: cloneAndFreeze(action.inputs) }),
        ...(status === undefined ? {} : { terminationStatus: status }),
        ...(declaredRole === undefined ? {} : {
          declaredRole,
          role: declaredRole,
        }),
      });
      normalizedById.set(id, normalized);
      for (const nested of nestedActionRecords(action, type)) {
        visitActions(
          nested.actions,
          { id, type, controlBranch: nested.controlBranch },
          `${containerId}/${pointerSegment(id)}/${nested.segment}`,
        );
      }
    }
  };
  visitActions(requireRecord(definition.actions));

  const connectionReferenceRecord = isRecord(properties.connectionReferences)
    ? properties.connectionReferences
    : {};
  const connectionReferences = new Set(Object.keys(connectionReferenceRecord).sort(compareText));
  const actions = new Map(
    [...normalizedById.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  const triggerExpressions = ownExpressions(triggerRecord);
  return Object.freeze({
    id: options.id,
    trigger: Object.freeze({
      id: triggerId,
      type: triggerType,
      expressionPointers: Object.freeze(triggerExpressions.map(({ pointer }) => pointer)),
      expressions: triggerExpressions,
    }),
    actions,
    connectionReferences,
    actionCount: actions.size,
    declaredDestructive: flowMetadata?.spflowDestructive === true,
  });
}
