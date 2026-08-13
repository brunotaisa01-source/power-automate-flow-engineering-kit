import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";

import type { FlowContract, PackageContract } from "../../packages/core/src/types/flow.ts";
import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";
import type {
  NormalizedAction,
  NormalizedConnector,
  NormalizedExpression,
  NormalizedFlow,
  NormalizedRunAfter,
} from "../../packages/package-adapters/src/flow-normalizer.ts";
import { parseWdlExpression } from "../../packages/package-adapters/src/wdl-parser.ts";
import type { PackageInspection } from "../../packages/package-adapters/src/solution-v1.ts";

type FixtureAction = Omit<NormalizedAction, "containerId" | "containerIndex">;

const ROOT: string = resolve(import.meta.dirname, "../..");
const RULE_IDS = [
  "FLOW-DESTRUCTIVE-001",
  "FLOW-IDEMPOTENCY-001",
  "FLOW-RETRY-001",
  "FLOW-STATUS-001",
  "PA-CONNECTION-001",
  "PA-CONNECTOR-001",
  "PA-EXPRESSION-001",
  "PA-GRAPH-001",
  "PA-GRAPH-002",
  "PA-LIMIT-001",
  "PA-SCOPE-001",
  "PA-WDL-001",
  "PKG-ARCHIVE-001",
  "PKG-INTEGRITY-001",
  "PKG-NATIVE-001"
] as const;
const REGISTRY_PATH = resolve(ROOT, "packages/rules/src/registry.ts");

interface ExpectedDiagnostic {
  readonly code: string;
  readonly artifactPath: string;
  readonly messageContains: string;
}

interface ExpectedRun {
  readonly result: "PASS" | "FAIL";
  readonly diagnostics: readonly ExpectedDiagnostic[];
}

interface ExpectedFixture {
  readonly schemaVersion: "1.0";
  readonly ruleId: string;
  readonly red: ExpectedRun;
  readonly green: ExpectedRun;
  readonly positiveControl: ExpectedRun;
  readonly mutation: {
    readonly source: "green";
    readonly recipe: string;
    readonly result: "FAIL";
    readonly diagnosticCode: string;
  };
}

interface MutationOperation {
  readonly op: "json-set" | "json-delete";
  readonly path: "graph.json";
  readonly pointer: string;
  readonly value?: unknown;
}

interface Diagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

interface Detector {
  readonly id: string;
  validate(context: unknown): Promise<readonly Diagnostic[]>;
}

interface RegistryModule {
  readonly ruleRegistry: ReadonlyMap<string, Detector>;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function pointerSegments(pointer: string): string[] {
  assert.match(pointer, /^\/(?:[^/]+)(?:\/[^/]+)*$/);
  return pointer.slice(1).split("/").map((segment) =>
    segment.replaceAll("~1", "/").replaceAll("~0", "~")
  );
}

function parentAt(root: unknown, segments: readonly string[]): {
  readonly parent: Record<string, unknown> | unknown[];
  readonly key: string;
} {
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    assert.ok(current !== null && typeof current === "object");
    current = Array.isArray(current)
      ? current[Number(segment)]
      : (current as Record<string, unknown>)[segment];
  }
  assert.ok(current !== null && typeof current === "object");
  const key = segments.at(-1);
  assert.notEqual(key, undefined);
  return { parent: current as Record<string, unknown> | unknown[], key: key! };
}

function applyMutation(graph: unknown, mutation: MutationOperation): unknown {
  assert.equal(mutation.path, "graph.json");
  const result = structuredClone(graph);
  const { parent, key } = parentAt(result, pointerSegments(mutation.pointer));
  if (mutation.op === "json-set") {
    assert.ok(Object.hasOwn(mutation, "value"));
    if (Array.isArray(parent)) parent[Number(key)] = mutation.value;
    else parent[key] = mutation.value;
  } else if (Array.isArray(parent)) {
    parent.splice(Number(key), 1);
  } else {
    delete parent[key];
  }
  return result;
}

function expectedDiagnostics(run: ExpectedRun): Diagnostic[] {
  return run.diagnostics.map((item) => ({
    code: item.code,
    path: item.artifactPath,
    message: item.messageContains,
  }));
}

const IDENTITY_KEYS = new Set([
  "digest",
  "fixtureProfile",
  "id",
  "matchedContent",
  "mutationControl",
  "packageId",
  "relativePath",
  "sourceProfile",
]);
const SEMANTIC_STRING_KEYS = new Set([
  "completionStatus",
  "ifMatch",
  "kind",
  "method",
  "op",
  "relation",
  "role",
  "serialization",
  "statuses",
  "type",
  "uriClass",
  "usage",
]);

function semanticStructure(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => semanticStructure(item, key));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([name]) => !IDENTITY_KEYS.has(name))
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([name, item]) => [name, semanticStructure(item, name)]),
    );
  }
  if (typeof value === "string") {
    return SEMANTIC_STRING_KEYS.has(key) ? value : "<string>";
  }
  return `<${typeof value}>`;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function legacyExpressions(value: unknown): NormalizedExpression[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.pointer !== "string") {
      return [];
    }
    const valid = item.valid === true;
    const unsafe = item.usage === "structured-payload"
      && item.serialization !== "serializer-owned";
    return [Object.freeze({
      pointer: unsafe ? "/inputs/body" : item.pointer,
      source: valid
        ? unsafe
          ? "@concat('{synthetic:', variables('SyntheticValue'), '}')"
          : "@equals('Synthetic', 'Synthetic')"
        : "@equals('Synthetic',)",
      valid,
      functions: Object.freeze(unsafe ? ["concat"] : ["equals"]),
      actionReferences: Object.freeze(strings(item.references)),
      readbackAssertions: Object.freeze([]),
    })];
  });
}

function legacyRunAfter(value: unknown): NormalizedRunAfter[] {
  return Array.isArray(value)
    ? value.flatMap((item) =>
      isRecord(item) && typeof item.actionId === "string"
        ? [Object.freeze({
          actionId: item.actionId,
          statuses: Object.freeze(strings(item.statuses).sort()),
        })]
        : []
    )
    : [];
}

function legacyConnector(value: unknown): NormalizedConnector | undefined {
  if (!isRecord(value) || typeof value.operationId !== "string") {
    return undefined;
  }
  const identifier = typeof value.identifier === "string"
    ? value.identifier
    : "@triggerBody()?['TargetId']";
  const identifierDataflow = parseWdlExpression(identifier).directDataReference;
  return Object.freeze({
    reference: typeof value.reference === "string"
      ? value.reference
      : "synthetic_connection",
    operationId: value.operationId,
    resource: typeof value.resource === "string" ? value.resource : "synthetic-items",
    identifier,
    ...(identifierDataflow === undefined ? {} : { identifierDataflow }),
    ...(typeof value.method === "string" ? { method: value.method } : {}),
    ...(typeof value.uriClass === "string"
      && ["absolute", "dynamic", "relative"].includes(value.uriClass)
      ? { uriClass: value.uriClass as "absolute" | "dynamic" | "relative" }
      : {}),
    ...(typeof value.overrideMethod === "string"
      ? { overrideMethod: value.overrideMethod }
      : {}),
    ...(typeof value.ifMatch === "string" ? { ifMatch: value.ifMatch } : {}),
  });
}

function semanticExpression(reference: string): NormalizedExpression {
  const source = `@equals(body('${reference}')?['Status'], 'Applied')`;
  const parsed = parseWdlExpression(source);
  return Object.freeze({
    pointer: "/expression",
    source,
    valid: true,
    functions: parsed.functions,
    actionReferences: parsed.actionReferences,
    readbackAssertions: parsed.readbackAssertions,
  });
}

function fixtureExpression(source: string, _references: readonly string[] = []): NormalizedExpression {
  const parsed = parseWdlExpression(source);
  return Object.freeze({
    pointer: "/expression",
    source,
    valid: true,
    functions: parsed.functions,
    actionReferences: parsed.actionReferences,
    readbackAssertions: parsed.readbackAssertions,
  });
}

function syntheticConnector(
  operationId: string,
  method: string,
): NormalizedConnector {
  const identifier = "@triggerBody()?['TargetId']";
  const identifierDataflow = parseWdlExpression(identifier).directDataReference;
  return Object.freeze({
    reference: "synthetic_connection",
    operationId,
    resource: "synthetic-items",
    identifier,
    ...(identifierDataflow === undefined ? {} : { identifierDataflow }),
    method,
    uriClass: "relative",
  });
}

function normalizedFixtureFlow(value: unknown): NormalizedFlow | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.actions)) {
    return undefined;
  }
  const declaredDestructive = value.destructive === true;
  const declaredKey = value.actions.find((item) =>
    isRecord(item) && item.role === "idempotency-key" && typeof item.id === "string"
  );
  const idempotencyKeyId = isRecord(declaredKey) && typeof declaredKey.id === "string"
    ? declaredKey.id
    : "MissingIdempotencyKey";
  const actions = new Map<string, FixtureAction>();
  for (const item of value.actions) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.type !== "string") {
      continue;
    }
    const role = typeof item.role === "string" ? item.role : undefined;
    const originalRunAfter = legacyRunAfter(item.runAfter);
    if (role === "readback") {
      const requestId = `${item.id}Request`;
      actions.set(requestId, Object.freeze({
        id: requestId,
        type: "OpenApiConnection",
        ...(typeof item.parentId === "string" ? { parentId: item.parentId } : {}),
        runAfter: Object.freeze(originalRunAfter),
        expressionPointers: Object.freeze([]),
        expressions: Object.freeze([]),
        connector: syntheticConnector("GetItem", "GET"),
        retryPolicy: Object.freeze({ type: "none" }),
      }));
      const expression = semanticExpression(requestId);
      actions.set(item.id, Object.freeze({
        id: item.id,
        type: "If",
        ...(typeof item.parentId === "string" ? { parentId: item.parentId } : {}),
        runAfter: Object.freeze([{
          actionId: requestId,
          statuses: Object.freeze(["Succeeded"]),
        }]),
        expressionPointers: Object.freeze([expression.pointer]),
        expressions: Object.freeze([expression]),
        declaredRole: role,
        role,
      }));
      continue;
    }

    let type = item.type;
    let connector = legacyConnector(item.connector);
    const expressions: NormalizedExpression[] = [];
    let terminationStatus = typeof item.completionStatus === "string"
      ? item.completionStatus
      : undefined;
    let semanticParent: NormalizedAction | undefined;
    if (["approval", "authorization", "idempotency-empty-guard"].includes(role ?? "")) {
      type = "If";
      expressions.push(role === "idempotency-empty-guard"
        ? fixtureExpression(`@not(empty(outputs('${idempotencyKeyId}')))`, [idempotencyKeyId])
        : fixtureExpression("@equals(triggerBody()?['approved'], true)"));
    }
    if (role === "idempotency-key") {
      expressions.push(fixtureExpression(
        "@concat(triggerBody()?['TargetId'], ':', triggerBody()?['CommandType'])",
      ));
    }
    if (["cardinality-zero", "cardinality-one", "cardinality-many"].includes(role ?? "")) {
      type = "If";
      const operator = role === "cardinality-many" ? "greater" : "equals";
      const expected = role === "cardinality-zero" ? 0 : 1;
      expressions.push(fixtureExpression(
        `@${operator}(length(body('SyntheticLookup')?['value']), ${expected})`,
        ["SyntheticLookup"],
      ));
      originalRunAfter.splice(0, originalRunAfter.length, {
        actionId: "SyntheticLookup",
        statuses: Object.freeze(["Succeeded"]),
      });
    }
    if (role === "completion") {
      type = "Terminate";
      terminationStatus ??= "Succeeded";
      const dependency = originalRunAfter.length === 1
        ? actions.get(originalRunAfter[0]?.actionId ?? "")
        : undefined;
      if (
        dependency?.declaredRole === "readback"
        && originalRunAfter[0]?.statuses.length === 1
        && originalRunAfter[0]?.statuses[0] === "Succeeded"
      ) {
        semanticParent = dependency as NormalizedAction;
        originalRunAfter.splice(0, originalRunAfter.length);
      }
    }
    if (role === "failure") {
      type = "Terminate";
      terminationStatus = "Failed";
    }
    if (role === "reconciliation") {
      connector = syntheticConnector("GetItem", "GET");
    }
    if (role === "state-reread") {
      connector = syntheticConnector("GetItem", "GET");
    }
    if (role === "mutation" && connector === undefined) {
      connector = syntheticConnector(
        declaredDestructive ? "DeleteItem" : "UpdateItem",
        declaredDestructive ? "DELETE" : "POST",
      );
    }
    if (["audit", "failure-audit", "compensation"].includes(role ?? "")) {
      connector ??= syntheticConnector(
        role === "compensation" ? "CreateCompensation" : "CreateAudit",
        "POST",
      );
    }
    if (role === "dry-run") {
      type = "If";
      expressions.push(fixtureExpression("@equals(triggerBody()?['DryRun'], true)"));
    }
    if (role === "target-allowlist") {
      type = "If";
      expressions.push(fixtureExpression(
        "@contains(createArray('DeleteItem'), triggerBody()?['Operation'])",
      ));
    }
    if (role === "plan-digest") {
      expressions.push(fixtureExpression("@sha256(string(triggerBody()?['Plan']))"));
    }
    if (role === "write-limit") {
      type = "If";
      expressions.push(fixtureExpression("@lessOrEquals(triggerBody()?['WriteCount'], 10)"));
    }
    if (role === "stop-unexpected") {
      type = "If";
      expressions.push(fixtureExpression("@equals(body('Readback')?['Unexpected'], false)", ["Readback"]));
    }
    const retryType = isRecord(item.retryPolicy) && typeof item.retryPolicy.type === "string"
      ? item.retryPolicy.type
      : connector === undefined
        ? undefined
        : "none";
    actions.set(item.id, Object.freeze({
      id: item.id,
      type,
      ...(typeof item.parentId === "string" ? { parentId: item.parentId } : {}),
      ...(semanticParent === undefined ? {} : {
        parentId: semanticParent.id,
        parentType: semanticParent.type,
        controlBranch: "condition-true" as const,
      }),
      runAfter: Object.freeze(originalRunAfter),
      expressionPointers: Object.freeze(expressions.map(({ pointer }) => pointer)),
      expressions: Object.freeze(expressions),
      ...(connector === undefined ? {} : { connector }),
      ...(retryType === undefined
        ? {}
        : { retryPolicy: Object.freeze({ type: retryType }) }),
      ...(terminationStatus === undefined ? {} : { terminationStatus }),
      ...(role === undefined ? {} : { declaredRole: role, role }),
    }));
  }

  const idempotencyGuard = [...actions.values()].find(
    ({ declaredRole }) => declaredRole === "idempotency-empty-guard",
  );
  if (idempotencyGuard !== undefined) {
    const handlers = [...actions.values()].filter(({ declaredRole }) =>
      ["cardinality-zero", "cardinality-one", "cardinality-many"].includes(
        declaredRole ?? "",
      )
    );
    for (const handler of handlers) {
      actions.delete(handler.id);
    }
    actions.set("SyntheticLookup", Object.freeze({
      id: "SyntheticLookup",
      type: "OpenApiConnection",
      parentId: idempotencyGuard.id,
      parentType: "If",
      controlBranch: "condition-true",
      runAfter: Object.freeze([]),
      expressionPointers: Object.freeze([]),
      expressions: Object.freeze([]),
      connector: syntheticConnector("GetItems", "GET"),
      retryPolicy: Object.freeze({ type: "none" }),
    }));
    for (const handler of handlers) {
      actions.set(handler.id, Object.freeze({
        ...handler,
        parentId: idempotencyGuard.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([{
          actionId: "SyntheticLookup",
          statuses: Object.freeze(["Succeeded"]),
        }]),
      }));
      const handlingId = `${handler.id}Handling`;
      const baseHandling = {
        id: handlingId,
        parentId: handler.id,
        parentType: "If",
        controlBranch: "condition-true" as const,
        runAfter: Object.freeze([]),
        expressionPointers: Object.freeze([]),
        expressions: Object.freeze([]),
      };
      const handling = handler.declaredRole === "cardinality-zero"
        ? {
            ...baseHandling,
            type: "OpenApiConnection",
            connector: syntheticConnector("UpdateItem", "POST"),
            retryPolicy: Object.freeze({ type: "none" }),
          }
        : handler.declaredRole === "cardinality-many"
          ? {
              ...baseHandling,
              type: "Terminate",
              terminationStatus: "Failed",
            }
          : { ...baseHandling, type: "Response" };
      actions.set(handlingId, Object.freeze(handling));
    }
  }

  if (declaredDestructive) {
    const roleAction = (role: string): NormalizedAction | undefined =>
      [...actions.values()].find(({ declaredRole }) => declaredRole === role);
    const mutation = [...actions.values()].find(({ declaredRole }) => declaredRole === "mutation");
    const audit = [...actions.values()].find(({ declaredRole }) => declaredRole === "failure-audit");
    const compensation = [...actions.values()].find(({ declaredRole }) => declaredRole === "compensation");
    const dryRun = roleAction("dry-run");
    const allowlist = roleAction("target-allowlist");
    const digest = roleAction("plan-digest");
    const approval = roleAction("approval");
    const writeLimit = roleAction("write-limit");
    const stateReread = roleAction("state-reread");
    const stopUnexpected = roleAction("stop-unexpected");
    const readback = roleAction("readback");
    const readbackRequest = readback === undefined
      ? undefined
      : actions.get(`${readback.id}Request`);
    const completeGates = [
      dryRun,
      allowlist,
      digest,
      approval,
      writeLimit,
      stateReread,
      stopUnexpected,
      mutation,
      readback,
      readbackRequest,
      audit,
      compensation,
    ].every((action) => action !== undefined);
    if (completeGates) {
      actions.set(allowlist!.id, Object.freeze({
        ...allowlist!,
        parentId: dryRun!.id,
        parentType: "If",
        controlBranch: "condition-false",
        runAfter: Object.freeze([]),
      }));
      actions.set(digest!.id, Object.freeze({
        ...digest!,
        parentId: allowlist!.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([]),
      }));
      actions.set(approval!.id, Object.freeze({
        ...approval!,
        parentId: allowlist!.id,
        parentType: "If",
        controlBranch: "condition-true",
      }));
      actions.set(writeLimit!.id, Object.freeze({
        ...writeLimit!,
        parentId: approval!.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([]),
      }));
      actions.set(stateReread!.id, Object.freeze({
        ...stateReread!,
        parentId: writeLimit!.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([]),
      }));
      actions.set(stopUnexpected!.id, Object.freeze({
        ...stopUnexpected!,
        parentId: writeLimit!.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([{
          actionId: stateReread!.id,
          statuses: Object.freeze(["Succeeded"]),
        }]),
      }));
      actions.set(mutation!.id, Object.freeze({
        ...mutation!,
        parentId: stopUnexpected!.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([]),
      }));
      actions.set(readbackRequest!.id, Object.freeze({
        ...readbackRequest!,
        parentId: stopUnexpected!.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([{
          actionId: mutation!.id,
          statuses: Object.freeze(["Succeeded"]),
        }]),
      }));
      actions.set(readback!.id, Object.freeze({
        ...readback!,
        parentId: stopUnexpected!.id,
        parentType: "If",
        controlBranch: "condition-true",
      }));
      actions.set(audit!.id, Object.freeze({
        ...audit!,
        parentId: stopUnexpected!.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([{
          actionId: mutation!.id,
          statuses: Object.freeze(["Failed", "TimedOut"]),
        }]),
      }));
      actions.set(compensation!.id, Object.freeze({
        ...compensation!,
        parentId: stopUnexpected!.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([{
          actionId: audit!.id,
          statuses: Object.freeze(["Succeeded"]),
        }]),
      }));
      actions.set("SyntheticFailure", Object.freeze({
        id: "SyntheticFailure",
        type: "Terminate",
        parentId: stopUnexpected!.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([{
          actionId: compensation!.id,
          statuses: Object.freeze(["Succeeded"]),
        }]),
        expressionPointers: Object.freeze([]),
        expressions: Object.freeze([]),
        terminationStatus: "Failed",
        declaredRole: "failure",
        role: "failure",
      }));
    }
    if (readback !== undefined) {
      actions.set("SyntheticCompletion", Object.freeze({
        id: "SyntheticCompletion",
        type: "Terminate",
        parentId: readback.id,
        parentType: "If",
        controlBranch: "condition-true",
        runAfter: Object.freeze([]),
        expressionPointers: Object.freeze([]),
        expressions: Object.freeze([]),
        terminationStatus: "Succeeded",
        declaredRole: "completion",
        role: "completion",
      }));
    }
  }

  const triggerExpressions = legacyExpressions(value.expressions);
  const connectionReferences = new Set(strings(value.declaredConnectionReferences));
  const positions = new Map<string, number>();
  const normalizedActions = new Map<string, NormalizedAction>();
  for (const [id, action] of actions) {
    const containerId = action.parentId === undefined ? "$" : `parent:${action.parentId}`;
    const containerIndex = positions.get(containerId) ?? 0;
    positions.set(containerId, containerIndex + 1);
    normalizedActions.set(id, Object.freeze({
      ...action,
      containerId,
      containerIndex,
    }));
  }
  return Object.freeze({
    id: value.id,
    trigger: Object.freeze({
      id: "SyntheticTrigger",
      type: "Request",
      expressionPointers: Object.freeze(triggerExpressions.map(({ pointer }) => pointer)),
      expressions: Object.freeze(triggerExpressions),
    }),
    actions: normalizedActions,
    connectionReferences,
    actionCount: normalizedActions.size,
    declaredDestructive,
  });
}

function fixtureContext(graph: unknown): unknown {
  assert.ok(isRecord(graph) && Array.isArray(graph.nodes) && Array.isArray(graph.edges));
  const zipNode = graph.nodes.find((node) =>
    isRecord(node) && node.kind === "zip" && isRecord(node.data)
  ) as UnknownRecord | undefined;
  const zipData = zipNode !== undefined && isRecord(zipNode.data) ? zipNode.data : undefined;
  const packagePath = typeof zipNode?.relativePath === "string"
    ? zipNode.relativePath
    : "artifacts/synthetic-solution.zip";
  const manifestNode = graph.nodes.find((node) =>
    isRecord(node) && node.kind === "manifest"
  );
  const manifestPath = isRecord(manifestNode) && typeof manifestNode.relativePath === "string"
    ? manifestNode.relativePath
    : "artifacts/manifest.json";
  const packageId = "synthetic-package";
  const flowValues = Array.isArray(zipData?.flows) ? zipData.flows : [];
  const flows = flowValues.flatMap((flow) => {
    const normalized = normalizedFixtureFlow(flow);
    return normalized === undefined ? [] : [normalized];
  });
  const flowContracts: FlowContract[] = flows.map((flow) => {
    const source = flowValues.find((value) => isRecord(value) && value.id === flow.id);
    return {
      id: flow.id,
      definitionPath: `definitions/${flow.id}.json`,
      trigger: "manual",
      processorForCommandTypes: ["SyntheticCommand"],
      connectionReferences: [...flow.connectionReferences],
      actionBudget: isRecord(source) && typeof source.actionBudget === "number"
        ? source.actionBudget
        : Math.max(1, flow.actionCount),
      concurrency: { enabled: true, degree: 1 },
      packageId,
    };
  });
  const packageContract: PackageContract = {
    id: packageId,
    path: packagePath,
    profile: "power-platform-solution-v1",
    manifestPath,
    flowIds: flows.map(({ id }) => id),
    importMode: "disabled",
    nestedArchives: "forbidden",
  };
  const contract = {
    flows: flowContracts,
    packages: [packageContract],
    commands: [{
      type: "SyntheticCommand",
      queueListId: "synthetic-items",
      targetListId: "synthetic-items",
      targetIdField: "TargetId",
      idempotency: {
        keyFields: ["TargetId", "CommandType"],
        emptyKey: "reject",
        zeroMatches: "create-or-execute",
        oneMatch: "return-existing-or-continue",
        manyMatches: "fail-reconciliation",
        ambiguousWrite: "get-reconcile-no-blind-retry",
      },
      readback: {
        required: true,
        fields: ["Status"],
        assertions: [{ field: "Status", operator: "equals", expected: "Applied" }],
      },
    }],
    security: {
      destructiveOperations: {
        dryRun: true,
        planDigest: true,
        humanApproval: true,
        itemLimit: 10,
        writeLimit: 10,
        stopOnUnexpected: true,
        semanticReadback: true,
      },
    },
  } as unknown as ProjectContract;
  const actualInventory = strings(zipData?.inventory).sort();
  const expectedInventory = strings(zipData?.expectedInventory).sort();
  const archiveSafe = isRecord(zipData?.archiveSafety)
    && zipData.archiveSafety.valid === true;
  const inventoryValid = actualInventory.length === expectedInventory.length
    && actualInventory.every((entry, index) => entry === expectedInventory[index]);
  const inspection: PackageInspection = Object.freeze({
    profile: "power-platform-solution-v1",
    valid: archiveSafe && inventoryValid,
    inventory: Object.freeze(actualInventory),
    expectedInventory: Object.freeze(expectedInventory),
    flows: Object.freeze(flows),
    diagnostics: Object.freeze(inventoryValid ? [] : [{
      code: "PKG-NATIVE-001",
      path: `${packagePath}#/inventory`,
      message: "Synthetic inventory mismatch.",
    }]),
  });
  const bytes = typeof zipData?.bytes === "number" ? zipData.bytes : 512;
  const sha256 = typeof zipNode?.digest === "string" ? zipNode.digest : "b".repeat(64);
  return {
    root: ".",
    offline: true,
    contract,
    graph,
    adapterEvidence: {
      packages: [{
        packageId,
        relativePath: packagePath,
        contract: packageContract,
        bytes,
        sha256,
        ...(archiveSafe ? { inspection } : { failure: "unsafe" }),
      }],
      flows: flows.map((flow, index) => ({
        packageId,
        packagePath,
        contract: flowContracts[index],
        flow,
      })),
    },
  };
}

async function loadRegistry(): Promise<RegistryModule> {
  await access(REGISTRY_PATH);
  return import(pathToFileURL(REGISTRY_PATH).href) as Promise<RegistryModule>;
}

async function validate(detector: Detector, graph: unknown): Promise<Diagnostic[]> {
  return [...await detector.validate(fixtureContext(graph))];
}

describe("package and flow rules", () => {
  test("catalog and canonical fixtures exist before detector registration", async () => {
    for (const ruleId of RULE_IDS) {
      const fixtureRoot = resolve(ROOT, "fixtures/rules", ruleId);
      const catalog = await readJson<Record<string, unknown>>(
        resolve(ROOT, "rules/catalog", `${ruleId}.json`),
      );
      const expected = await readJson<ExpectedFixture>(resolve(fixtureRoot, "expected.json"));
      const mutation = await readJson<MutationOperation>(resolve(fixtureRoot, "mutation.json"));
      assert.equal(catalog.id, ruleId);
      assert.equal(expected.ruleId, ruleId);
      assert.equal(expected.red.result, "FAIL");
      assert.equal(expected.green.result, "PASS");
      assert.equal(expected.positiveControl.result, "PASS");
      assert.equal(expected.mutation.diagnosticCode, ruleId);
      assert.equal(mutation.path, "graph.json");
      await access(resolve(fixtureRoot, "red/graph.json"));
      await access(resolve(fixtureRoot, "green/graph.json"));
      await access(resolve(fixtureRoot, "controls/positive/graph.json"));
    }
  });

  test("registry contains every Wave 1 detector", async () => {
    const { ruleRegistry } = await loadRegistry();
    assert.deepEqual([...ruleRegistry.keys()], [...RULE_IDS]);
  });

  test("positive controls have a structurally independent semantic topology", async () => {
    for (const ruleId of RULE_IDS) {
      const fixtureRoot = resolve(ROOT, "fixtures/rules", ruleId);
      const green = await readJson<unknown>(resolve(fixtureRoot, "green/graph.json"));
      const positive = await readJson<unknown>(
        resolve(fixtureRoot, "controls/positive/graph.json"),
      );
      assert.notDeepEqual(
        semanticStructure(positive),
        semanticStructure(green),
        `${ruleId} positive control must not be a renamed GREEN fixture.`,
      );
    }
  });

  for (const ruleId of RULE_IDS) {
    test(`${ruleId} rejects RED exactly and passes GREEN and an independent positive control`, async () => {
      const { ruleRegistry } = await loadRegistry();
      const detector = ruleRegistry.get(ruleId);
      assert.notEqual(detector, undefined);
      const fixtureRoot = resolve(ROOT, "fixtures/rules", ruleId);
      const expected = await readJson<ExpectedFixture>(resolve(fixtureRoot, "expected.json"));
      const red = await readJson<unknown>(resolve(fixtureRoot, "red/graph.json"));
      const green = await readJson<unknown>(resolve(fixtureRoot, "green/graph.json"));
      const positive = await readJson<unknown>(
        resolve(fixtureRoot, "controls/positive/graph.json"),
      );

      const redDiagnostics = await validate(detector!, red);
      assert.deepEqual(redDiagnostics, expectedDiagnostics(expected.red));
      assert.equal(JSON.stringify(redDiagnostics).includes("SYNTHETIC_MATCH_VALUE"), false);
      assert.deepEqual(await validate(detector!, green), expectedDiagnostics(expected.green));
      assert.deepEqual(
        await validate(detector!, positive),
        expectedDiagnostics(expected.positiveControl),
      );
    });

    test(`${ruleId} mutation restores the canonical failure`, async () => {
      const { ruleRegistry } = await loadRegistry();
      const detector = ruleRegistry.get(ruleId);
      assert.notEqual(detector, undefined);
      const fixtureRoot = resolve(ROOT, "fixtures/rules", ruleId);
      const expected = await readJson<ExpectedFixture>(resolve(fixtureRoot, "expected.json"));
      const green = await readJson<unknown>(resolve(fixtureRoot, "green/graph.json"));
      const mutation = await readJson<MutationOperation>(resolve(fixtureRoot, "mutation.json"));
      assert.doesNotMatch(
        mutation.pointer,
        /\/(?:id|role|declaredRole|fixtureProfile|matchedContent|sourceProfile)$/,
        `${ruleId} mutation must change structural evidence, not labels or identity metadata.`,
      );
      const mutated = applyMutation(green, mutation);
      const red = await readJson<unknown>(resolve(fixtureRoot, "red/graph.json"));
      assert.notDeepEqual(
        mutated,
        red,
        `${ruleId} mutation must disable the safety predicate without replaying RED.`,
      );
      const diagnostics = await validate(detector!, mutated);

      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0]?.code, expected.mutation.diagnosticCode);
      assert.equal(diagnostics[0]?.path.includes("SYNTHETIC_MATCH_VALUE"), false);
    });
  }

  test("diagnostics are stable when graph nodes and normalized actions are reordered", async () => {
    const { ruleRegistry } = await loadRegistry();
    const detector = ruleRegistry.get("PA-GRAPH-001");
    assert.notEqual(detector, undefined);
    const red = await readJson<{ nodes: Array<{ data: { flows?: Array<{ actions?: unknown[] }> } }> }>(
      resolve(ROOT, "fixtures/rules/PA-GRAPH-001/red/graph.json"),
    );
    const reordered = structuredClone(red);
    reordered.nodes.reverse();
    for (const node of reordered.nodes) {
      node.data.flows?.forEach((flow) => flow.actions?.reverse());
    }

    assert.deepEqual(await validate(detector!, reordered), await validate(detector!, red));
  });
});
