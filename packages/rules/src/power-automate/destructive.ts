import type {
  NormalizedAction,
  NormalizedFlow,
} from "@spflow/core/types/rule-input";

import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  buildFlowGraph,
  flowArtifacts,
  flowDiagnostic,
  hasSuccessfulSemanticReadback,
  isCondition,
  isConnectorMutation,
  isConnectorRead,
  isDestructiveMutation,
  isSuccessfulExecutionPredecessor,
  isSucceededCompletion,
  missingFlowEvidenceDiagnostic,
  reachableActions,
} from "./common.ts";

const MESSAGE = "Destructive flow lacks required authorization, audit, readback, or compensation evidence.";
const RUNTIME_SOURCE_FUNCTIONS = new Set([
  "actions",
  "body",
  "item",
  "items",
  "parameters",
  "trigger",
  "triggerbody",
  "triggeroutputs",
  "variables",
  "workflow",
  "outputs",
]);

function findOperation(
  actions: readonly NormalizedAction[],
  predicate: (action: NormalizedAction) => boolean,
): NormalizedAction | undefined {
  return actions.find(predicate);
}

function runtimeExpressionText(action: NormalizedAction): string {
  return action.expressions
    .filter((expression) => expression.valid
      && (
        expression.actionReferences.length > 0
        || expression.functions.some((name) =>
          RUNTIME_SOURCE_FUNCTIONS.has(name.toLowerCase())
        )
      ))
    .map(({ source }) => source)
    .join(" ")
    .toLowerCase();
}

function conditionWith(action: NormalizedAction, terms: readonly RegExp[]): boolean {
  const text = runtimeExpressionText(action);
  return isCondition(action)
    && text.length > 0
    && terms.every((term) => term.test(text));
}

function followsExactly(
  action: NormalizedAction,
  predecessorId: string,
  statuses: readonly string[],
): boolean {
  return action.runAfter.length === 1
    && action.runAfter[0]?.actionId === predecessorId
    && action.runAfter[0].statuses.length === statuses.length
    && action.runAfter[0].statuses.every((status, index) => status === statuses[index]);
}

interface DestructiveGates {
  readonly dryRun: readonly NormalizedAction[];
  readonly allowlist: readonly NormalizedAction[];
  readonly digest: readonly NormalizedAction[];
  readonly approval: readonly NormalizedAction[];
  readonly writeLimit: readonly NormalizedAction[];
  readonly stateReread: readonly NormalizedAction[];
  readonly stopUnexpected: readonly NormalizedAction[];
}

function derivedGates(
  context: ValidationContext,
  actions: readonly NormalizedAction[],
): DestructiveGates | undefined {
  const limit = context.contract.security.destructiveOperations.writeLimit;
  const dryRun = actions.filter((action) => conditionWith(action, [/dry\s*run|dryrun/i]));
  const allowlist = actions.filter((action) => conditionWith(action, [/(?:allow|contains|operation)/i]));
  const digest = actions.filter((action) =>
    /(?:compose|setvariable|initializevariable)/i.test(action.type)
    && /(?:sha256|digest|hash)/i.test(runtimeExpressionText(action))
  );
  const approval = actions.filter((action) => conditionWith(action, [/(?:approval|approved|token)/i]));
  const writeLimit = actions.filter((action) => conditionWith(action, [
    /(?:less|limit|count)/i,
    new RegExp(`\\b${limit}\\b`),
  ]));
  const stateReread = actions.filter((action) => isConnectorRead(action)
    && /(?:get|read|state|item)/i.test(action.connector?.operationId ?? ""));
  const stopUnexpected = actions.filter((action) => conditionWith(action, [
    /(?:unexpected|stop|abort)/i,
  ]));
  const gates = [dryRun, allowlist, digest, approval, writeLimit, stateReread, stopUnexpected];
  if (gates.some((candidates) => candidates.length === 0)) {
    return undefined;
  }
  return {
    dryRun,
    allowlist,
    digest,
    approval,
    writeLimit,
    stateReread,
    stopUnexpected,
  };
}

function conditionBranchGates(
  flow: NormalizedFlow,
  condition: NormalizedAction,
  target: NormalizedAction,
  branch: "condition-true" | "condition-false",
): boolean {
  let current: NormalizedAction | undefined = target;
  while (current?.parentId !== undefined) {
    if (current.parentId === condition.id) {
      return current.controlBranch === branch;
    }
    current = flow.actions.get(current.parentId);
  }
  return false;
}

function gatesMutation(
  flow: NormalizedFlow,
  gates: DestructiveGates,
  mutation: NormalizedAction,
  reachable: ReadonlySet<string>,
): boolean {
  const connected = (
    candidates: readonly NormalizedAction[],
    predicate: (candidate: NormalizedAction) => boolean,
  ): boolean => candidates.some((candidate) =>
    reachable.has(candidate.id) && predicate(candidate)
  );
  return connected(gates.dryRun, (gate) =>
    conditionBranchGates(flow, gate, mutation, "condition-false"))
    && connected(gates.allowlist, (gate) =>
      conditionBranchGates(flow, gate, mutation, "condition-true"))
    && connected(gates.digest, (gate) =>
      isSuccessfulExecutionPredecessor(flow, gate, mutation))
    && connected(gates.approval, (gate) =>
      conditionBranchGates(flow, gate, mutation, "condition-true"))
    && connected(gates.writeLimit, (gate) =>
      conditionBranchGates(flow, gate, mutation, "condition-true"))
    && connected(gates.stateReread, (gate) =>
      isSuccessfulExecutionPredecessor(flow, gate, mutation))
    && connected(gates.stopUnexpected, (gate) =>
      conditionBranchGates(flow, gate, mutation, "condition-true"));
}

function conditionGatesTarget(
  flow: NormalizedFlow,
  gates: DestructiveGates,
  target: NormalizedAction,
  reachable: ReadonlySet<string>,
): boolean {
  const gated = (
    candidates: readonly NormalizedAction[],
    branch: "condition-true" | "condition-false",
  ): boolean => candidates.some((candidate) =>
    reachable.has(candidate.id)
    && conditionBranchGates(flow, candidate, target, branch)
  );
  return gated(gates.dryRun, "condition-false")
    && gated(gates.allowlist, "condition-true")
    && gated(gates.approval, "condition-true")
    && gated(gates.writeLimit, "condition-true")
    && gated(gates.stopUnexpected, "condition-true");
}

export const flowDestructive001: RuleDetector = Object.freeze({
  id: "FLOW-DESTRUCTIVE-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      const actions = [...artifact.flow.actions.values()];
      const mutations = actions.filter(isDestructiveMutation);
      if (!artifact.flow.declaredDestructive && mutations.length === 0) {
        continue;
      }
      const gates = derivedGates(context, actions);
      const completion = findOperation(actions, isSucceededCompletion);
      const graph = buildFlowGraph(artifact.flow);
      const reachable = reachableActions(artifact.flow, graph);
      if (
        mutations.length === 0
        || gates === undefined
        || completion === undefined
        || !reachable.has(completion.id)
      ) {
        return [flowDiagnostic(this.id, artifact, "/destructiveGates", MESSAGE)];
      }

      for (const mutation of mutations) {
        const audit = findOperation(actions, (action) =>
          isConnectorMutation(action)
          && /audit|log|record/i.test(action.connector?.operationId ?? "")
          && followsExactly(action, mutation.id, ["Failed", "TimedOut"])
        );
        const compensation = audit === undefined
          ? undefined
          : findOperation(actions, (action) =>
              isConnectorMutation(action)
              && /compensat|rollback|restore/i.test(action.connector?.operationId ?? "")
              && followsExactly(action, audit.id, ["Succeeded"])
            );
        const failure = compensation === undefined
          ? undefined
          : findOperation(actions, (action) =>
              action.type.toLowerCase() === "terminate"
              && action.terminationStatus === "Failed"
              && followsExactly(action, compensation.id, ["Succeeded"])
            );
        if (
          !reachable.has(mutation.id)
          || !gatesMutation(artifact.flow, gates, mutation, reachable)
          || audit === undefined
          || compensation === undefined
          || failure === undefined
          || !reachable.has(audit.id)
          || !reachable.has(compensation.id)
          || !reachable.has(failure.id)
          || !conditionGatesTarget(artifact.flow, gates, audit, reachable)
          || !conditionGatesTarget(artifact.flow, gates, compensation, reachable)
          || !conditionGatesTarget(artifact.flow, gates, failure, reachable)
          || !hasSuccessfulSemanticReadback(context, artifact, completion, mutation)
        ) {
          return [flowDiagnostic(this.id, artifact, "/destructiveGates", MESSAGE)];
        }
      }
    }
    return [];
  },
});
