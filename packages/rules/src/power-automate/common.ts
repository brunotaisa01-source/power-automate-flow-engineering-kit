import { isDeepStrictEqual } from "node:util";

import type { Diagnostic } from "@spflow/core/types/diagnostics";
import type { FlowContract } from "@spflow/core/types/flow";
import type {
  CommandContract,
  ReadbackAssertion,
} from "@spflow/core/types/project-contract";
import type {
  FlowRuleEvidence,
  NormalizedAction,
  NormalizedDataReference,
  NormalizedExpression,
  NormalizedExpressionNode,
  NormalizedFlow,
  NormalizedReadbackAssertion,
} from "@spflow/core/types/rule-input";

import type { ValidationContext } from "../registry.ts";

export interface FlowArtifact extends FlowRuleEvidence {}

export interface FlowGraph {
  readonly outgoing: ReadonlyMap<string, readonly string[]>;
  readonly roots: readonly string[];
}

export interface FlowExpression {
  readonly actionId?: string;
  readonly expression: NormalizedExpression;
}

const READ_METHODS = new Set(["GET", "HEAD"]);
const CONDITION_TYPES = new Set(["condition", "if"]);
const MUTATION_OPERATION_VERBS = new Set([
  "apply",
  "create",
  "delete",
  "execute",
  "merge",
  "patch",
  "remove",
  "set",
  "update",
  "write",
]);
const AUXILIARY_OPERATION_SUBJECTS = new Set([
  "audit",
  "compensation",
  "event",
  "history",
  "log",
  "message",
  "notification",
]);

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function expectedFlowLocations(
  context: ValidationContext,
): Array<{ readonly flowId: string; readonly packagePath: string }> {
  const packageById = new Map(context.contract.packages.map((item) => [item.id, item]));
  return context.contract.flows
    .flatMap((flow) => {
      const packaged = packageById.get(flow.packageId);
      return packaged === undefined
        ? []
        : [{ flowId: flow.id, packagePath: packaged.path }];
    })
    .sort((left, right) =>
      compareText(left.packagePath, right.packagePath)
      || compareText(left.flowId, right.flowId)
    );
}

function structurallyValidEvidence(evidence: FlowRuleEvidence): boolean {
  if (
    evidence.flow.id !== evidence.contract.id
    || !(evidence.flow.actions instanceof Map)
    || !(evidence.flow.connectionReferences instanceof Set)
    || evidence.flow.actionCount !== evidence.flow.actions.size
  ) {
    return false;
  }
  const positions = new Map<string, Set<number>>();
  for (const action of evidence.flow.actions.values()) {
    if (
      typeof action.containerId !== "string"
      || action.containerId.length === 0
      || typeof action.containerIndex !== "number"
      || !Number.isSafeInteger(action.containerIndex)
      || action.containerIndex < 0
    ) {
      return false;
    }
    const indexes = positions.get(action.containerId) ?? new Set<number>();
    if (indexes.has(action.containerIndex)) {
      return false;
    }
    indexes.add(action.containerIndex);
    positions.set(action.containerId, indexes);
  }
  return [...positions.values()].every((indexes) =>
    [...indexes].sort((left, right) => left - right)
      .every((position, index) => position === index)
  );
}

export function flowArtifacts(context: ValidationContext): FlowArtifact[] {
  const expected = new Set(
    expectedFlowLocations(context).map(({ flowId, packagePath }) => `${packagePath}\0${flowId}`),
  );
  return [...(context.adapterEvidence?.flows ?? [])]
    .filter((evidence) =>
      expected.has(`${evidence.packagePath}\0${evidence.flow.id}`)
      && structurallyValidEvidence(evidence)
    )
    .sort((left, right) =>
      compareText(left.packagePath, right.packagePath)
      || compareText(left.flow.id, right.flow.id)
    );
}

export function missingFlowEvidenceDiagnostic(
  context: ValidationContext,
  ruleId: string,
): Diagnostic | undefined {
  const expected = expectedFlowLocations(context);
  const artifacts = flowArtifacts(context);
  for (const location of expected) {
    const matches = artifacts.filter((artifact) =>
      artifact.packagePath === location.packagePath
      && artifact.flow.id === location.flowId
    );
    if (matches.length !== 1) {
      return Object.freeze({
        code: ruleId,
        path: `${location.packagePath}#/inspection`,
        message: "Required normalized flow evidence is missing.",
      });
    }
  }
  return undefined;
}

export function flowDiagnostic(
  ruleId: string,
  artifact: FlowArtifact,
  pointer: string,
  message: string,
): Diagnostic {
  const sanitizedPointer = pointer
    .replace(/\/actions\/[^/]+/g, "/actions/<action>")
    .replace(/\/runAfter\/[^/]+/g, "/runAfter/<predecessor>");
  return Object.freeze({
    code: ruleId,
    path: `${artifact.packagePath}#/flows/<flow>${sanitizedPointer}`,
    message,
  });
}

export function actionPointer(_actionId: string): string {
  return "/actions/<action>";
}

export function actionById(flow: NormalizedFlow): ReadonlyMap<string, NormalizedAction> {
  return flow.actions;
}

export function buildFlowGraph(flow: NormalizedFlow): FlowGraph {
  const outgoing = new Map<string, string[]>();
  const roots: string[] = [];
  for (const action of flow.actions.values()) {
    outgoing.set(action.id, []);
  }
  for (const current of flow.actions.values()) {
    if (current.runAfter.length === 0) {
      if (current.containerIndex === 0) {
        if (current.parentId === undefined) {
          roots.push(current.id);
        } else if (flow.actions.has(current.parentId)) {
          outgoing.get(current.parentId)?.push(current.id);
        }
      }
    }
    for (const dependency of current.runAfter) {
      const predecessor = flow.actions.get(dependency.actionId);
      if (predecessor !== undefined && predecessor.containerId === current.containerId) {
        outgoing.get(predecessor.id)?.push(current.id);
      }
    }
  }
  for (const neighbors of outgoing.values()) {
    neighbors.sort(compareText);
  }
  roots.sort(compareText);
  return { outgoing, roots };
}

export function reachableActions(
  flow: NormalizedFlow,
  graph: FlowGraph,
  excluded: (action: NormalizedAction) => boolean = () => false,
): ReadonlySet<string> {
  const reached = new Set<string>();
  const queue = [...graph.roots];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || reached.has(id)) {
      continue;
    }
    const current = flow.actions.get(id);
    if (current === undefined || excluded(current)) {
      continue;
    }
    reached.add(id);
    for (const next of graph.outgoing.get(id) ?? []) {
      if (!reached.has(next)) {
        queue.push(next);
      }
    }
    queue.sort(compareText);
  }
  return reached;
}

export function firstCycle(flow: NormalizedFlow, graph: FlowGraph): string | undefined {
  const state = new Map<string, "active" | "complete">();
  const visit = (id: string): string | undefined => {
    state.set(id, "active");
    for (const next of graph.outgoing.get(id) ?? []) {
      if (state.get(next) === "active") {
        return next;
      }
      if (state.get(next) === undefined) {
        const cycle = visit(next);
        if (cycle !== undefined) {
          return cycle;
        }
      }
    }
    state.set(id, "complete");
    return undefined;
  };
  for (const current of flow.actions.values()) {
    if (state.get(current.id) === undefined) {
      const cycle = visit(current.id);
      if (cycle !== undefined) {
        return cycle;
      }
    }
  }
  return undefined;
}

export function allExpressions(flow: NormalizedFlow): FlowExpression[] {
  const expressions: FlowExpression[] = [
    ...flow.trigger.expressions.map((expression) => ({ expression })),
    ...[...flow.actions.values()].flatMap((action) =>
      action.expressions.map((expression) => ({ actionId: action.id, expression }))
    ),
  ];
  return expressions.sort((left, right) =>
    compareText(left.actionId ?? "", right.actionId ?? "")
    || compareText(left.expression.pointer, right.expression.pointer)
  );
}

export function expressionRoots(action: NormalizedAction): readonly NormalizedExpressionNode[] {
  return action.expressions.flatMap((expression) =>
    expression.valid && expression.root !== undefined ? [expression.root] : []
  );
}

export function walkExpression(
  root: NormalizedExpressionNode,
): readonly NormalizedExpressionNode[] {
  switch (root.kind) {
    case "literal":
      return [root];
    case "access":
      return [root, ...walkExpression(root.target)];
    case "call":
      return [root, ...root.arguments.flatMap(walkExpression)];
  }
}

export function expressionDataReference(
  node: NormalizedExpressionNode,
): NormalizedDataReference | undefined {
  const path: Array<string | number> = [];
  let current = node;
  while (current.kind === "access") {
    path.unshift(current.key);
    current = current.target;
  }
  if (current.kind !== "call") {
    return undefined;
  }

  const functionName = current.name.toLowerCase();
  if (
    ["triggerbody", "triggeroutputs"].includes(functionName)
    && current.arguments.length === 0
  ) {
    const normalizedPath = functionName === "triggeroutputs" && path[0] === "body"
      ? path.slice(1)
      : path;
    return normalizedPath.length === 0
      ? undefined
      : Object.freeze({ source: "trigger", path: Object.freeze(normalizedPath) });
  }
  if (
    ["action", "actions", "body", "outputs", "result"].includes(functionName)
    && current.arguments.length === 1
  ) {
    const action = current.arguments[0];
    if (action?.kind !== "literal" || typeof action.value !== "string") {
      return undefined;
    }
    const normalizedPath = ["action", "actions", "outputs", "result"].includes(functionName)
        && path[0] === "body"
      ? path.slice(1)
      : path;
    return Object.freeze({
      source: "action",
      actionId: action.value,
      path: Object.freeze(normalizedPath),
    });
  }
  return undefined;
}

export function isCondition(action: NormalizedAction): boolean {
  return CONDITION_TYPES.has(action.type.toLowerCase())
    && action.expressions.some((expression) => expression.valid);
}

function serializedInput(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function actionSemanticText(action: NormalizedAction): string {
  return [
    action.type,
    action.connector?.operationId ?? "",
    action.connector?.method ?? "",
    action.connector?.overrideMethod ?? "",
    action.expressions.map(({ source }) => source).join(" "),
    serializedInput(action.inputs),
  ].join(" ").toLowerCase();
}

export function hasSemanticTerms(
  action: NormalizedAction,
  ...terms: readonly (string | RegExp)[]
): boolean {
  const text = actionSemanticText(action);
  return terms.every((term) =>
    typeof term === "string" ? text.includes(term.toLowerCase()) : term.test(text)
  );
}

export function isConnectorRead(action: NormalizedAction): boolean {
  const method = action.connector?.method?.toUpperCase();
  return method !== undefined && READ_METHODS.has(method);
}

export function isConnectorMutation(action: NormalizedAction): boolean {
  const connector = action.connector;
  if (connector === undefined) {
    return false;
  }
  const method = connector.method?.toUpperCase();
  if (method !== undefined) {
    return !READ_METHODS.has(method);
  }
  return /(?:create|delete|merge|patch|send|update|write)/i.test(connector.operationId);
}

interface OperationIdentity {
  readonly verb: string;
  readonly subject: string;
}

function operationWords(value: string): readonly string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length > 0);
}

export function connectorOperationIdentity(
  action: NormalizedAction,
): OperationIdentity | undefined {
  const words = operationWords(action.connector?.operationId ?? "");
  const verb = words[0];
  if (verb === undefined || words.length < 2) {
    return undefined;
  }
  return Object.freeze({ verb, subject: words.slice(1).join("") });
}

function isCommandTargetIdentity(
  action: NormalizedAction,
  command: CommandContract,
): boolean {
  const dataflow = action.connector?.identifierDataflow;
  return dataflow?.source === "trigger"
    && dataflow.actionId === undefined
    && dataflow.path.length === 1
    && dataflow.path[0] === command.targetIdField;
}

export function connectorTargetsCommand(
  action: NormalizedAction,
  command: CommandContract,
): boolean {
  return action.connector?.resource === command.targetListId
    && isCommandTargetIdentity(action, command);
}

export function isCommandMutation(
  action: NormalizedAction,
  command: CommandContract,
): boolean {
  if (!isConnectorMutation(action) || !connectorTargetsCommand(action, command)) {
    return false;
  }
  const operation = connectorOperationIdentity(action);
  return operation !== undefined
    && MUTATION_OPERATION_VERBS.has(operation.verb)
    && ![...AUXILIARY_OPERATION_SUBJECTS].some((subject) =>
      operation.subject.includes(subject)
    );
}

export function isCommandReadback(
  action: NormalizedAction,
  command: CommandContract,
  mutation: NormalizedAction,
): boolean {
  if (!isConnectorRead(action) || !connectorTargetsCommand(action, command)) {
    return false;
  }
  const read = action.connector;
  const write = mutation.connector;
  const writeOperation = write?.operationId.match(
    /^(?:Apply|Create|Delete|Execute|Merge|Patch|Remove|Set|Update|Write)([A-Z][A-Za-z0-9]*)$/,
  );
  return read !== undefined
    && write !== undefined
    && writeOperation !== undefined
    && writeOperation !== null
    && read.reference === write.reference
    && read.operationId === `Get${writeOperation[1]}`
    && read.resource === write.resource
    && read.identifier === write.identifier
    && isDeepStrictEqual(read.identifierDataflow, write.identifierDataflow);
}

export function isDestructiveMutation(action: NormalizedAction): boolean {
  return action.connector?.method?.toUpperCase() === "DELETE"
    || /delete|remove|purge/i.test(action.connector?.operationId ?? "");
}

export function isSucceededCompletion(action: NormalizedAction): boolean {
  return action.type.toLowerCase() === "terminate"
    && action.terminationStatus === "Succeeded";
}

function requiresOnlySuccess(statuses: readonly string[]): boolean {
  return statuses.length === 1 && statuses[0] === "Succeeded";
}

export function successfulAncestors(
  flow: NormalizedFlow,
  action: NormalizedAction,
): ReadonlySet<string> {
  const reached = new Set<string>();
  const queue = action.runAfter
    .filter(({ statuses }) => requiresOnlySuccess(statuses))
    .map(({ actionId }) => actionId)
    .sort(compareText);
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || reached.has(id)) {
      continue;
    }
    const current = flow.actions.get(id);
    if (current === undefined || current.containerId !== action.containerId) {
      continue;
    }
    reached.add(id);
    for (const dependency of current.runAfter) {
      if (requiresOnlySuccess(dependency.statuses) && !reached.has(dependency.actionId)) {
        queue.push(dependency.actionId);
      }
    }
    queue.sort(compareText);
  }
  return reached;
}

function requiredReadbackCommands(
  context: ValidationContext,
  flowContract: FlowContract,
): readonly CommandContract[] {
  const commandTypes = new Set(flowContract.processorForCommandTypes);
  const commands = context.contract.commands.filter(({ type }) => commandTypes.has(type));
  if (
    commands.length === 0
    || commands.some(({ readback }) =>
      readback.required !== true
      || readback.fields.length === 0
      || readback.assertions.length === 0
    )
  ) {
    return [];
  }
  return commands;
}

interface SemanticReadbackProof {
  readonly assertion: NormalizedAction;
  readonly readback: NormalizedAction;
  readonly facts: readonly NormalizedReadbackAssertion[];
}

function semanticReadbackProofs(
  context: ValidationContext,
  artifact: FlowArtifact,
): readonly SemanticReadbackProof[] {
  if (requiredReadbackCommands(context, artifact.contract).length === 0) {
    return [];
  }
  return [...artifact.flow.actions.values()].flatMap((assertion) => {
    if (!isCondition(assertion)) {
      return [];
    }
    const facts = assertion.expressions.flatMap(
      (expression) => expression.readbackAssertions ?? [],
    );
    return assertion.runAfter.flatMap((dependency) => {
      const readback = artifact.flow.actions.get(dependency.actionId);
      const matchingFacts = readback === undefined
        ? []
        : facts.filter(({ actionId }) => actionId === readback.id);
      return readback !== undefined
          && isConnectorRead(readback)
          && requiresOnlySuccess(dependency.statuses)
          && matchingFacts.length > 0
        ? [{ assertion, readback, facts: Object.freeze(matchingFacts) }]
        : [];
    });
  });
}

export function semanticReadbackAssertions(
  context: ValidationContext,
  artifact: FlowArtifact,
): readonly NormalizedAction[] {
  return [...new Map(
    semanticReadbackProofs(context, artifact).map(({ assertion }) => [assertion.id, assertion]),
  ).values()];
}

function successfulBranchContains(
  flow: NormalizedFlow,
  assertion: NormalizedAction,
  completion: NormalizedAction,
): boolean {
  let current: NormalizedAction | undefined = completion;
  while (current?.parentId !== undefined) {
    if (current.parentId === assertion.id) {
      return current.controlBranch === "condition-true";
    }
    current = flow.actions.get(current.parentId);
  }
  return false;
}

function assertionMatches(
  required: ReadbackAssertion,
  actual: NormalizedReadbackAssertion,
): boolean {
  return actual.field === required.field
    && actual.operator === required.operator
    && isDeepStrictEqual(actual.expected, required.expected);
}

export function isSuccessfulExecutionPredecessor(
  flow: NormalizedFlow,
  predecessor: NormalizedAction,
  target: NormalizedAction,
): boolean {
  let current: NormalizedAction | undefined = target;
  while (current !== undefined) {
    if (successfulAncestors(flow, current).has(predecessor.id)) {
      return true;
    }
    current = current.parentId === undefined
      ? undefined
      : flow.actions.get(current.parentId);
  }
  return false;
}

export function hasSuccessfulSemanticReadback(
  context: ValidationContext,
  artifact: FlowArtifact,
  completion: NormalizedAction,
  requiredPredecessor?: NormalizedAction,
): boolean {
  const commands = requiredReadbackCommands(context, artifact.contract);
  if (commands.length === 0) {
    return false;
  }
  const proofs = semanticReadbackProofs(context, artifact).filter(({ assertion }) =>
    successfulBranchContains(artifact.flow, assertion, completion)
  );
  return commands.every((command) => {
    const mutations = requiredPredecessor === undefined
      ? [...artifact.flow.actions.values()].filter((action) =>
          isCommandMutation(action, command)
        )
      : isCommandMutation(requiredPredecessor, command)
        ? [requiredPredecessor]
        : [];
    return mutations.some((mutation) =>
      proofs.some(({ readback, facts }) =>
        isCommandReadback(readback, command, mutation)
        && isSuccessfulExecutionPredecessor(artifact.flow, mutation, readback)
        && command.readback.assertions.every((expected) =>
          facts.some((actual) => assertionMatches(expected, actual))
        )
      )
    );
  });
}

export function hasSuccessfulConditionAncestor(
  flow: NormalizedFlow,
  action: NormalizedAction,
): boolean {
  const ancestors = successfulAncestors(flow, action);
  return [...ancestors].some((id) => {
    const candidate = flow.actions.get(id);
    return candidate !== undefined && isCondition(candidate);
  });
}
