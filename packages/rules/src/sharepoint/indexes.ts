import type {
  NormalizedIndexOperation,
  NormalizedIndexPlan,
} from "@spflow/core/types/wp06-evidence";

import type { RuleDetector, ValidationContext } from "../registry.ts";
import {
  compareText,
  evidenceItems,
  isRecord,
  sameStringSet,
  strings,
  wp06Diagnostic,
} from "./wp06-common.ts";

const PLAN_MESSAGE =
  "Index remediation is not a bounded serial remove-before-add plan with fresh digest evidence.";
const READBACK_MESSAGE =
  "Index Apply does not prove per-step and final readback or a compatible zero-write NO_OP.";

function isReadback(value: unknown): value is { performed: boolean; observedFields: readonly string[] } {
  return isRecord(value)
    && typeof value.performed === "boolean"
    && strings(value.observedFields) !== undefined;
}

function isOperation(value: unknown): value is NormalizedIndexOperation {
  return isRecord(value)
    && Number.isSafeInteger(value.sequence)
    && typeof value.kind === "string"
    && typeof value.field === "string"
    && (value.payloadMetadataType === undefined || typeof value.payloadMetadataType === "string")
    && (typeof value.readback === "boolean" || isReadback(value.readback));
}

function isPlan(value: unknown): value is NormalizedIndexPlan {
  return isRecord(value)
    && typeof value.listId === "string"
    && strings(value.currentFields) !== undefined
    && strings(value.requiredFields) !== undefined
    && typeof value.execution === "string"
    && isRecord(value.digest)
    && typeof value.digest.fresh === "boolean"
    && typeof value.digest.bindsCurrent === "boolean"
    && typeof value.digest.bindsRequired === "boolean"
    && typeof value.result === "string"
    && Number.isSafeInteger(value.maximumWrites)
    && Number.isSafeInteger(value.writeCount)
    && Array.isArray(value.operations)
    && value.operations.every(isOperation)
    && strings(value.finalReadback) !== undefined;
}

function requiredFields(
  context: ValidationContext,
  listId: string,
): readonly string[] | undefined {
  const list = context.contract.sharePoint.lists.find(({ id }) => id === listId);
  return list === undefined
    ? undefined
    : [...list.indexes]
      .filter(({ required }) => required)
      .sort((left, right) => left.order - right.order || compareText(left.field, right.field))
      .map(({ field }) => field);
}

function sequencedOperations(
  plan: NormalizedIndexPlan,
): readonly NormalizedIndexOperation[] | undefined {
  const operations = [...plan.operations].sort((left, right) =>
    left.sequence - right.sequence || compareText(left.field, right.field)
  );
  return operations.every((operation, index) => operation.sequence === index + 1)
    ? operations
    : undefined;
}

function validPlanShape(context: ValidationContext, plan: NormalizedIndexPlan): boolean {
  const required = requiredFields(context, plan.listId);
  const operations = sequencedOperations(plan);
  if (
    required === undefined
    || operations === undefined
    || !sameStringSet(plan.requiredFields, required)
    || plan.requiredFields.some((field, index) => field !== required[index])
    || plan.execution !== "serial"
    || !plan.digest.fresh
    || !plan.digest.bindsCurrent
    || !plan.digest.bindsRequired
    || plan.maximumWrites !== plan.writeCount
    || plan.maximumWrites > context.contract.security.destructiveOperations.writeLimit
    || plan.maximumWrites < 0
  ) {
    return false;
  }

  const requiredSet = new Set(required);
  const currentSet = new Set(plan.currentFields);
  const removals = [...currentSet].filter((field) => !requiredSet.has(field)).sort(compareText);
  const additions = required.filter((field) => !currentSet.has(field));
  const expected = [
    ...removals.map((field) => ({ kind: "remove", field })),
    ...additions.map((field) => ({ kind: "add", field })),
  ];
  if (operations.length !== expected.length || plan.writeCount !== expected.length) {
    return false;
  }
  return operations.every((operation, index) => {
    const item = expected[index];
    return item !== undefined
      && operation.sequence === index + 1
      && operation.kind === item.kind
      && operation.field === item.field
      && (operation.kind !== "add" || operation.payloadMetadataType === "SP.Field");
  });
}

function validReadbacks(context: ValidationContext, plan: NormalizedIndexPlan): boolean {
  const required = requiredFields(context, plan.listId);
  const operations = sequencedOperations(plan);
  if (
    required === undefined
    || operations === undefined
    || !sameStringSet(plan.finalReadback, required)
  ) return false;

  const compatible = sameStringSet(plan.currentFields, required);
  if (compatible) {
    return plan.result === "NO_OP"
      && plan.maximumWrites === 0
      && plan.writeCount === 0
      && plan.operations.length === 0;
  }
  if (plan.result !== "APPLY") return false;

  const observed = new Set(plan.currentFields);
  for (const operation of operations) {
    if (operation.kind === "remove") observed.delete(operation.field);
    else if (operation.kind === "add") observed.add(operation.field);
    else return false;
    if (
      !isReadback(operation.readback)
      || !operation.readback.performed
      || !sameStringSet(operation.readback.observedFields, [...observed])
    ) {
      return false;
    }
  }
  return sameStringSet([...observed], required);
}

function completePlans(
  context: ValidationContext,
  plans: readonly NormalizedIndexPlan[],
): boolean {
  const indexedLists = context.contract.sharePoint.lists
    .filter(({ indexes }) => indexes.length > 0)
    .map(({ id }) => id)
    .sort(compareText);
  const planLists = plans.map(({ listId }) => listId);
  return new Set(planLists).size === planLists.length
    && sameStringSet(planLists, indexedLists);
}

export const spIndex001: RuleDetector = Object.freeze({
  id: "SP-INDEX-001",
  async validate(context: ValidationContext) {
    const selection = evidenceItems<NormalizedIndexPlan>(context, this.id, "indexPlans", "builder");
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];
    const plans = selection.items.filter(({ value }) => isPlan(value)).map(({ value }) => value);
    const invalid = selection.items.find(({ value }) => !isPlan(value) || !validPlanShape(context, value));
    if (!completePlans(context, plans)) {
      const first = selection.items[0];
      return first === undefined
        ? []
        : [wp06Diagnostic(this.id, first.artifact, "/indexes/<plan>/operations", PLAN_MESSAGE)];
    }
    return invalid === undefined
      ? []
      : [wp06Diagnostic(this.id, invalid.artifact, "/indexes/<plan>/operations", PLAN_MESSAGE)];
  },
});

export const spIndex002: RuleDetector = Object.freeze({
  id: "SP-INDEX-002",
  async validate(context: ValidationContext) {
    const selection = evidenceItems<NormalizedIndexPlan>(context, this.id, "indexPlans", "builder");
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];
    const plans = selection.items.filter(({ value }) => isPlan(value)).map(({ value }) => value);
    const invalid = selection.items.find(({ value }) =>
      !isPlan(value) || !validPlanShape(context, value) || !validReadbacks(context, value)
    );
    if (!completePlans(context, plans)) {
      const first = selection.items[0];
      return first === undefined
        ? []
        : [wp06Diagnostic(this.id, first.artifact, "/indexes/<plan>/readback", READBACK_MESSAGE)];
    }
    return invalid === undefined
      ? []
      : [wp06Diagnostic(this.id, invalid.artifact, "/indexes/<plan>/readback", READBACK_MESSAGE)];
  },
});
