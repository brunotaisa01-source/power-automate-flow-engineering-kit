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
  connectorOperationIdentity,
  connectorTargetsCommand,
  expressionDataReference,
  expressionRoots,
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
const KEY_DERIVATION_FUNCTIONS = new Set([
  "coalesce",
  "concat",
  "formatnumber",
  "replace",
  "string",
  "substring",
  "tolower",
  "toupper",
  "trim",
]);

type NormalizedCallExpression = Extract<NormalizedExpressionNode, { readonly kind: "call" }>;
type StaticExpressionValue =
  | { readonly known: false }
  | { readonly known: true; readonly value: unknown };

const UNKNOWN_VALUE: StaticExpressionValue = Object.freeze({ known: false });

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

function staticExpressionValue(node: NormalizedExpressionNode): StaticExpressionValue {
  if (node.kind === "literal") {
    return { known: true, value: node.value };
  }
  if (node.kind !== "call") {
    return UNKNOWN_VALUE;
  }
  const name = node.name.toLowerCase();
  const values = node.arguments.map(staticExpressionValue);
  if (
    name === "equals"
    && node.arguments.length === 2
    && node.arguments[0] !== undefined
    && node.arguments[1] !== undefined
  ) {
    if (isDeepStrictEqual(node.arguments[0], node.arguments[1])) {
      return { known: true, value: true };
    }
    const left = values[0]!;
    const right = values[1]!;
    return left.known && right.known
      ? { known: true, value: isDeepStrictEqual(left.value, right.value) }
      : UNKNOWN_VALUE;
  }
  if (
    ["greater", "greaterorequals", "less", "lessorequals"].includes(name)
    && node.arguments.length === 2
    && node.arguments[0] !== undefined
    && node.arguments[1] !== undefined
  ) {
    if (isDeepStrictEqual(node.arguments[0], node.arguments[1])) {
      return {
        known: true,
        value: name === "greaterorequals" || name === "lessorequals",
      };
    }
    const left = values[0]!;
    const right = values[1]!;
    if (
      left.known
      && right.known
      && typeof left.value === "number"
      && typeof right.value === "number"
    ) {
      const value = name === "greater"
        ? left.value > right.value
        : name === "greaterorequals"
          ? left.value >= right.value
          : name === "less"
            ? left.value < right.value
            : left.value <= right.value;
      return { known: true, value };
    }
  }
  if (name === "not" && values.length === 1) {
    const value = values[0]!;
    return value.known && typeof value.value === "boolean"
      ? { known: true, value: !value.value }
      : UNKNOWN_VALUE;
  }
  if (name === "and" && values.length >= 2) {
    if (values.some((value) => value.known && value.value === false)) {
      return { known: true, value: false };
    }
    return values.every((value) => value.known && value.value === true)
      ? { known: true, value: true }
      : UNKNOWN_VALUE;
  }
  if (name === "or" && values.length >= 2) {
    if (values.some((value) => value.known && value.value === true)) {
      return { known: true, value: true };
    }
    return values.every((value) => value.known && value.value === false)
      ? { known: true, value: false }
      : UNKNOWN_VALUE;
  }
  if (name === "if" && node.arguments.length === 3) {
    const condition = values[0]!;
    return condition.known && typeof condition.value === "boolean"
      ? values[condition.value ? 1 : 2]!
      : isDeepStrictEqual(node.arguments[1], node.arguments[2])
        ? values[1]!
        : UNKNOWN_VALUE;
  }
  if (name === "coalesce" && values.length >= 2) {
    for (const value of values) {
      if (!value.known) {
        return UNKNOWN_VALUE;
      }
      if (value.value !== null) {
        return value;
      }
    }
    return { known: true, value: null };
  }
  return UNKNOWN_VALUE;
}

function influentialChildren(
  node: NormalizedCallExpression,
): readonly NormalizedExpressionNode[] {
  if (staticExpressionValue(node).known) {
    return [];
  }
  const name = node.name.toLowerCase();
  if (name === "if" && node.arguments.length === 3) {
    const condition = staticExpressionValue(node.arguments[0]!);
    return condition.known && typeof condition.value === "boolean"
      ? [node.arguments[condition.value ? 1 : 2]!]
      : node.arguments;
  }
  if (name === "coalesce") {
    const influential: NormalizedExpressionNode[] = [];
    for (const argument of node.arguments) {
      const value = staticExpressionValue(argument);
      if (value.known && value.value === null) {
        continue;
      }
      influential.push(argument);
      if (value.known) {
        break;
      }
    }
    return influential;
  }
  if (name === "and") {
    return node.arguments.filter((argument) => {
      const value = staticExpressionValue(argument);
      return !value.known || value.value !== true;
    });
  }
  if (name === "or") {
    return node.arguments.filter((argument) => {
      const value = staticExpressionValue(argument);
      return !value.known || value.value !== false;
    });
  }
  if ([
    "formatnumber",
    "replace",
    "string",
    "substring",
    "tolower",
    "toupper",
    "trim",
  ].includes(name)) {
    return node.arguments[0] === undefined ? [] : [node.arguments[0]];
  }
  return [
    "concat",
    "empty",
    "equals",
    "greater",
    "greaterorequals",
    "length",
    "less",
    "lessorequals",
    "not",
  ].includes(name)
    ? node.arguments
    : [];
}

function conjuncts(
  node: NormalizedExpressionNode,
): readonly NormalizedExpressionNode[] | undefined {
  const constant = staticExpressionValue(node);
  if (constant.known && typeof constant.value === "boolean") {
    return constant.value ? [] : undefined;
  }
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

function parsedPredicate(
  action: NormalizedAction,
  predicate: (node: NormalizedExpressionNode) => boolean,
): boolean {
  return isCondition(action) && expressionRoots(action).some((root) => {
    const leaves = conjuncts(root);
    return leaves !== undefined && leaves.some(predicate);
  });
}

function referencesAction(
  node: NormalizedExpressionNode,
  actionId: string,
  requiredPath?: string,
): boolean {
  const reference = expressionDataReference(node);
  return reference?.source === "action"
    && reference.actionId === actionId
    && (requiredPath === undefined
      || reference.path.some((part) =>
        typeof part === "string" && part.toLowerCase() === requiredPath.toLowerCase()
      ));
}

function triggerFieldReferences(
  node: NormalizedExpressionNode,
): ReadonlySet<string> {
  const reference = expressionDataReference(node);
  if (
    reference?.source === "trigger"
    && reference.path.length === 1
    && typeof reference.path[0] === "string"
  ) {
    return new Set([reference.path[0].toLowerCase()]);
  }
  return new Set(
    node.kind === "call"
      ? influentialChildren(node).flatMap((child) => [...triggerFieldReferences(child)])
      : [],
  );
}

function derivesContractKey(
  action: NormalizedAction,
  keyFields: readonly string[],
): boolean {
  if (!["compose", "setvariable", "initializevariable"].includes(action.type.toLowerCase())) {
    return false;
  }
  if (keyFields.length === 0) {
    return false;
  }
  return expressionRoots(action).some((root) => {
    const dataflowRoot = root.kind === "access"
      || root.kind === "call" && KEY_DERIVATION_FUNCTIONS.has(root.name.toLowerCase());
    const references = triggerFieldReferences(root);
    return dataflowRoot
      && keyFields.every((field) => references.has(field.toLowerCase()));
  });
}

function guardsNonEmptyKey(action: NormalizedAction, keyId: string): boolean {
  return parsedPredicate(action, (node) => {
    if (isCall(node) && isNamedCall(node, "not", 1)) {
      const negated = node.arguments[0]!;
      if (isCall(negated) && isNamedCall(negated, "empty", 1)) {
        return referencesAction(negated.arguments[0]!, keyId);
      }
      if (isCall(negated) && isNamedCall(negated, "equals", 2)) {
        const left = negated.arguments[0]!;
        const right = negated.arguments[1]!;
        const emptyLiteral = (candidate: NormalizedExpressionNode): boolean =>
          candidate.kind === "literal" && (candidate.value === "" || candidate.value === null);
        return referencesAction(left, keyId) && emptyLiteral(right)
          || referencesAction(right, keyId) && emptyLiteral(left);
      }
    }
    if (!isCall(node) || !isNamedCall(node, "greater", 2)) {
      return false;
    }
    const measured = node.arguments[0]!;
    const minimum = node.arguments[1]!;
    return isCall(measured)
      && isNamedCall(measured, "length", 1)
      && referencesAction(measured.arguments[0]!, keyId)
      && minimum.kind === "literal"
      && minimum.value === 0;
  });
}

function cardinalityHandler(
  action: NormalizedAction,
  lookupId: string,
  mode: "zero" | "one" | "many",
): boolean {
  return parsedPredicate(action, (node) => {
    if (node.kind !== "call" || node.arguments.length !== 2) {
      return false;
    }
    const measured = node.arguments[0]!;
    const expected = node.arguments[1]!;
    if (
      !isCall(measured)
      || !isNamedCall(measured, "length", 1)
      || !referencesAction(measured.arguments[0]!, lookupId, "value")
      || expected.kind !== "literal"
      || typeof expected.value !== "number"
    ) {
      return false;
    }
    switch (mode) {
      case "zero":
        return node.name.toLowerCase() === "equals" && expected.value === 0;
      case "one":
        return node.name.toLowerCase() === "equals" && expected.value === 1;
      case "many":
        return node.name.toLowerCase() === "greater" && expected.value === 1
          || node.name.toLowerCase() === "greaterorequals" && expected.value === 2;
    }
  });
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
            && key !== undefined
            && isSuccessfulExecutionPredecessor(artifact.flow, key, emptyGuard)
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
