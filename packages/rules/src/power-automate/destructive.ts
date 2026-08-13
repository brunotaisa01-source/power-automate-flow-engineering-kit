import { isDeepStrictEqual } from "node:util";

import type {
  NormalizedAction,
  NormalizedExpressionNode,
  NormalizedFlow,
} from "@spflow/core/types/rule-input";

import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  buildFlowGraph,
  expressionDataReference,
  expressionRoots,
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
  walkExpression,
} from "./common.ts";

const MESSAGE = "Destructive flow lacks required authorization, audit, readback, or compensation evidence.";

function findOperation(
  actions: readonly NormalizedAction[],
  predicate: (action: NormalizedAction) => boolean,
): NormalizedAction | undefined {
  return actions.find(predicate);
}

type NormalizedCallExpression = Extract<NormalizedExpressionNode, { readonly kind: "call" }>;

function isCall(node: NormalizedExpressionNode): node is NormalizedCallExpression {
  return node.kind === "call";
}

function isNamedCall(
  node: NormalizedCallExpression,
  name: string,
  argumentCount?: number,
): boolean {
  return node.name.toLowerCase() === name
    && (argumentCount === undefined || node.arguments.length === argumentCount);
}

function conjuncts(
  node: NormalizedExpressionNode,
): readonly NormalizedExpressionNode[] | undefined {
  if (isCall(node) && isNamedCall(node, "or")) {
    return undefined;
  }
  if (!isCall(node) || !isNamedCall(node, "and")) {
    return [node];
  }
  const nested = node.arguments.map(conjuncts);
  return nested.some((values) => values === undefined)
    ? undefined
    : nested.flatMap((values) => values ?? []);
}

function conditionWith(
  action: NormalizedAction,
  predicate: (node: NormalizedExpressionNode) => boolean,
): boolean {
  return isCondition(action) && expressionRoots(action).some((root) => {
    const leaves = conjuncts(root);
    return leaves !== undefined && leaves.some(predicate);
  });
}

function referencePathMatches(
  node: NormalizedExpressionNode,
  pattern: RegExp,
  source?: "trigger" | "action",
): boolean {
  const reference = expressionDataReference(node);
  return reference !== undefined
    && (source === undefined || reference.source === source)
    && reference.path.some((part) => typeof part === "string" && pattern.test(part));
}

function literalEquals(node: NormalizedExpressionNode, expected: unknown): boolean {
  return node.kind === "literal" && node.value === expected;
}

function isNonTautologicalBinary(
  node: NormalizedCallExpression,
  names: readonly string[],
): boolean {
  return names.includes(node.name.toLowerCase())
    && node.arguments.length === 2
    && node.arguments[0] !== undefined
    && node.arguments[1] !== undefined
    && !isDeepStrictEqual(node.arguments[0], node.arguments[1]);
}

function fieldComparedToLiteral(
  node: NormalizedExpressionNode,
  field: RegExp,
  expected: unknown,
  source?: "trigger" | "action",
): boolean {
  if (!isCall(node) || !isNonTautologicalBinary(node, ["equals"])) {
    return false;
  }
  const left = node.arguments[0]!;
  const right = node.arguments[1]!;
  return referencePathMatches(left, field, source) && literalEquals(right, expected)
    || referencePathMatches(right, field, source) && literalEquals(left, expected);
}

function dryRunPredicate(node: NormalizedExpressionNode): boolean {
  return fieldComparedToLiteral(node, /^dry_?run$/i, true, "trigger");
}

function allowlistPredicate(node: NormalizedExpressionNode): boolean {
  if (!isCall(node) || !isNamedCall(node, "contains", 2)) {
    return false;
  }
  const allowlist = node.arguments[0]!;
  const requestedOperation = node.arguments[1]!;
  return walkExpression(allowlist).some((part) =>
    part.kind === "literal" && typeof part.value === "string" && part.value.length > 0
  )
    && !walkExpression(allowlist).some((part) => expressionDataReference(part) !== undefined)
    && referencePathMatches(requestedOperation, /^(?:command|operation|target)$/i, "trigger");
}

function digestExpression(action: NormalizedAction): boolean {
  return expressionRoots(action).some((root) =>
    walkExpression(root).some((node) =>
      node.kind === "call"
      && ["digest", "hash", "sha256"].includes(node.name.toLowerCase())
      && node.arguments.some((argument) =>
        walkExpression(argument).some((part) =>
          referencePathMatches(part, /(?:plan|target)/i)
        )
      )
    )
  );
}

function approvalPredicate(node: NormalizedExpressionNode): boolean {
  if (!isCall(node) || !isNonTautologicalBinary(node, ["equals"])) {
    return false;
  }
  const left = node.arguments[0]!;
  const right = node.arguments[1]!;
  const leftApproval = referencePathMatches(left, /(?:approval|approved|token)/i);
  const rightApproval = referencePathMatches(right, /(?:approval|approved|token)/i);
  if (!leftApproval && !rightApproval) {
    return false;
  }
  const counterpart = leftApproval ? right : left;
  return counterpart.kind === "literal"
    || expressionDataReference(counterpart) !== undefined;
}

function writeLimitPredicate(
  node: NormalizedExpressionNode,
  limit: number,
): boolean {
  if (!isCall(node) || !isNonTautologicalBinary(node, ["less", "lessorequals"])) {
    return false;
  }
  const left = node.arguments[0]!;
  const right = node.arguments[1]!;
  return referencePathMatches(left, /(?:count|limit|writes?)/i)
    && literalEquals(right, limit);
}

function stopUnexpectedPredicate(
  node: NormalizedExpressionNode,
  stateRereadIds: ReadonlySet<string>,
): boolean {
  if (!isCall(node) || !isNonTautologicalBinary(node, ["equals"])) {
    return false;
  }
  const left = node.arguments[0]!;
  const right = node.arguments[1]!;
  const stateReference = (candidate: NormalizedExpressionNode): boolean => {
    const reference = expressionDataReference(candidate);
    return reference?.source === "action"
      && reference.actionId !== undefined
      && stateRereadIds.has(reference.actionId)
      && reference.path.some((part) =>
        typeof part === "string" && /(?:state|status|unexpected)/i.test(part)
      );
  };
  return stateReference(left) && literalEquals(right, false)
    || stateReference(right) && literalEquals(left, false);
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
  const dryRun = actions.filter((action) => conditionWith(action, dryRunPredicate));
  const allowlist = actions.filter((action) => conditionWith(action, allowlistPredicate));
  const digest = actions.filter((action) =>
    /(?:compose|setvariable|initializevariable)/i.test(action.type)
    && digestExpression(action)
  );
  const approval = actions.filter((action) => conditionWith(action, approvalPredicate));
  const writeLimit = actions.filter((action) =>
    conditionWith(action, (node) => writeLimitPredicate(node, limit))
  );
  const stateReread = actions.filter((action) => isConnectorRead(action)
    && /(?:get|read|state|item)/i.test(action.connector?.operationId ?? ""));
  const stateRereadIds = new Set(stateReread.map(({ id }) => id));
  const stopUnexpected = actions.filter((action) =>
    conditionWith(action, (node) => stopUnexpectedPredicate(node, stateRereadIds))
  );
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
