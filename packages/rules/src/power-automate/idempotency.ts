import type {
  NormalizedAction,
  NormalizedFlow,
} from "@spflow/core/types/rule-input";

import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  actionSemanticText,
  buildFlowGraph,
  connectorOperationIdentity,
  connectorTargetsCommand,
  flowArtifacts,
  flowDiagnostic,
  isCommandMutation,
  isCondition,
  isConnectorMutation,
  isConnectorRead,
  isSuccessfulExecutionPredecessor,
  isSucceededCompletion,
  missingFlowEvidenceDiagnostic,
  reachableActions,
} from "./common.ts";

const MESSAGE = "Flow does not provide a deterministic non-empty key with explicit zero, one, and many handling.";

function expressionText(action: NormalizedAction): string {
  return action.expressions.map(({ source }) => source).join(" ").toLowerCase();
}

function derivesContractKey(
  action: NormalizedAction,
  keyFields: readonly string[],
): boolean {
  if (!["compose", "setvariable", "initializevariable"].includes(action.type.toLowerCase())) {
    return false;
  }
  const text = actionSemanticText(action);
  return action.expressions.length > 0
    && keyFields.length > 0
    && keyFields.every((field) => text.includes(field.toLowerCase()));
}

function guardsNonEmptyKey(action: NormalizedAction, keyId: string): boolean {
  if (!isCondition(action)) {
    return false;
  }
  const text = expressionText(action);
  const referencesKey = action.expressions.some(({ actionReferences }) =>
    actionReferences.includes(keyId)
  );
  return referencesKey
    && (/\bnot\s*\(\s*empty\s*\(/i.test(text)
      || /\bgreater\s*\(\s*length\s*\(/i.test(text)
      || /\bnot\s*\(\s*equals\s*\(/i.test(text));
}

function cardinalityHandler(
  action: NormalizedAction,
  lookupId: string,
  mode: "zero" | "one" | "many",
): boolean {
  if (!isCondition(action)) {
    return false;
  }
  const text = expressionText(action);
  if (
    !action.expressions.some(({ actionReferences }) => actionReferences.includes(lookupId))
    || !/length\s*\(/i.test(text)
  ) {
    return false;
  }
  switch (mode) {
    case "zero":
      return /equals\s*\([^,]+,\s*0\s*\)/i.test(text);
    case "one":
      return /equals\s*\([^,]+,\s*1\s*\)/i.test(text);
    case "many":
      return /(?:greater|greaterorequals)\s*\([^,]+,\s*[12]\s*\)/i.test(text);
  }
}

function trueBranchDescendants(
  flow: NormalizedFlow,
  handler: NormalizedAction,
): readonly NormalizedAction[] {
  return [...flow.actions.values()].filter((candidate) => {
    let current: NormalizedAction | undefined = candidate;
    while (current?.parentId !== undefined) {
      if (current.parentId === handler.id) {
        return current.controlBranch === "condition-true";
      }
      current = flow.actions.get(current.parentId);
    }
    return false;
  });
}

function meaningfulHandling(
  flow: NormalizedFlow,
  handler: NormalizedAction,
  mode: "zero" | "one" | "many",
  reachable: ReadonlySet<string>,
  protectedMutations: readonly NormalizedAction[],
): boolean {
  const branch = trueBranchDescendants(flow, handler)
    .filter(({ id }) => reachable.has(id));
  if (branch.length === 0) {
    return false;
  }
  switch (mode) {
    case "zero":
      return protectedMutations.length > 0
        && protectedMutations.every((mutation) =>
          reachable.has(mutation.id)
          && branch.some(({ id }) => id === mutation.id)
        );
    case "one":
      return branch.some((action) =>
        isConnectorRead(action)
        || isConnectorMutation(action)
        || isSucceededCompletion(action)
        || action.type.toLowerCase() === "response"
      );
    case "many":
      return branch.some((action) =>
        action.type.toLowerCase() === "terminate"
        && action.terminationStatus === "Failed"
      );
  }
}

export const flowIdempotency001: RuleDetector = Object.freeze({
  id: "FLOW-IDEMPOTENCY-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      if (artifact.contract.processorForCommandTypes.length === 0) {
        continue;
      }
      const commands = context.contract.commands.filter(({ type }) =>
        artifact.contract.processorForCommandTypes.includes(type)
      );
      const actions = [...artifact.flow.actions.values()];
      const reachable = reachableActions(artifact.flow, buildFlowGraph(artifact.flow));
      if (
        commands.length === 0
        || commands.some((command) => {
          const { idempotency } = command;
          if (
            idempotency.emptyKey !== "reject"
            || idempotency.zeroMatches !== "create-or-execute"
            || idempotency.oneMatch !== "return-existing-or-continue"
            || idempotency.manyMatches !== "fail-reconciliation"
          ) {
            return true;
          }
          const key = actions.find((action) =>
            derivesContractKey(action, idempotency.keyFields)
          );
          const emptyGuard = key === undefined
            ? undefined
            : actions.find((action) => guardsNonEmptyKey(action, key.id));
          const lookup = actions.find((action) => {
            const operation = connectorOperationIdentity(action);
            return isConnectorRead(action)
              && connectorTargetsCommand(action, command)
              && operation !== undefined
              && new Set(["find", "get", "list", "query", "search"])
                .has(operation.verb);
          });
          const handlers = lookup === undefined
            ? []
            : (["zero", "one", "many"] as const).map((mode) =>
                actions.find((action) => cardinalityHandler(action, lookup.id, mode))
              );
          const protectedMutations = actions.filter((action) =>
            isCommandMutation(action, command)
          );
          const lookupIsGuarded = emptyGuard !== undefined
            && lookup !== undefined
            && trueBranchDescendants(artifact.flow, emptyGuard)
              .some(({ id }) => id === lookup.id);
          const handlingIsMeaningful = handlers.length === 3
            && handlers.every((handler, index) => {
              const mode = (["zero", "one", "many"] as const)[index];
              return handler !== undefined
                && mode !== undefined
                && lookup !== undefined
                && isSuccessfulExecutionPredecessor(artifact.flow, lookup, handler)
                && meaningfulHandling(
                  artifact.flow,
                  handler,
                  mode,
                  reachable,
                  protectedMutations,
                );
            });
          return key === undefined
            || emptyGuard === undefined
            || lookup === undefined
            || !lookupIsGuarded
            || handlers.some((action) => action === undefined)
            || !handlingIsMeaningful
            || [key, emptyGuard, lookup, ...handlers]
              .some((action) => action === undefined || !reachable.has(action.id));
        })
      ) {
        return [flowDiagnostic(this.id, artifact, "/idempotency", MESSAGE)];
      }
    }
    return [];
  },
});
