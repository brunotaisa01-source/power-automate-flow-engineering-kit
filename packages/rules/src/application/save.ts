import type { NormalizedSaveTransaction } from "@spflow/core/types/wp06-evidence";

import type { RuleDetector, ValidationContext } from "../registry.ts";
import {
  evidenceItems,
  hasUniqueStrings,
  isRecord,
  strings,
  wp06Diagnostic,
} from "../sharepoint/wp06-common.ts";

const MESSAGE =
  "Direct patch does not satisfy the explicit Save and conflict-safe transaction contract.";

function isTransaction(value: unknown): value is NormalizedSaveTransaction {
  if (!isRecord(value)) return false;
  const request = value.request;
  const conflict = value.conflict;
  const ambiguous = value.ambiguousFailure;
  const readback = value.readback;
  return typeof value.listId === "string"
    && typeof value.trigger === "string"
    && strings(value.patchedFields) !== undefined
    && isRecord(request)
    && [
      request.method,
      request.methodOverride,
      request.serialization,
      request.digest,
      request.ifMatch,
    ].every((item) => typeof item === "string")
    && isRecord(conflict)
    && typeof conflict.status === "number"
    && typeof conflict.action === "string"
    && isRecord(ambiguous)
    && typeof ambiguous.action === "string"
    && typeof ambiguous.writeRetry === "boolean"
    && isRecord(readback)
    && typeof readback.method === "string"
    && typeof readback.semantic === "boolean"
    && typeof readback.beforeSuccess === "boolean";
}

export const appSave001: RuleDetector = Object.freeze({
  id: "APP-SAVE-001",
  async validate(context: ValidationContext) {
    if (!context.contract.verification.requiredRuleIds.includes(this.id)) return [];
    const directPatch = context.contract.frontend.directPatch;
    if (!directPatch.enabled) return [];

    const selection = evidenceItems<NormalizedSaveTransaction>(
      context,
      this.id,
      "saveTransactions",
      "frontend",
    );
    if (selection.missing !== undefined) return [selection.missing];

    const declaredLists = new Set(directPatch.listIds);
    const transactionLists = selection.items.map(({ value }) =>
      isTransaction(value) ? value.listId : ""
    );
    if (
      selection.items.length !== declaredLists.size
      || transactionLists.some((listId) => !declaredLists.has(listId))
      || new Set(transactionLists).size !== transactionLists.length
    ) {
      const first = selection.items[0];
      return first === undefined
        ? []
        : [wp06Diagnostic(this.id, first.artifact, "/saveTransactions", MESSAGE)];
    }

    for (const listId of [...directPatch.listIds].sort()) {
      const list = context.contract.sharePoint.lists.find(({ id }) => id === listId);
      const matches = selection.items.filter(({ value }) =>
        isTransaction(value) && value.listId === listId
      );
      const fallback = matches[0] ?? selection.items[0];
      const transaction = matches[0]?.value;
      const editable = new Set(
        list?.fields
          .filter(({ clientEditable }) => clientEditable)
          .map(({ internalName }) => internalName) ?? [],
      );
      const valid = list !== undefined
        && list.writeModel === "direct-patch"
        && matches.length === 1
        && isTransaction(transaction)
        && transaction.trigger === "explicit-save"
        && transaction.patchedFields.length > 0
        && hasUniqueStrings(transaction.patchedFields)
        && transaction.patchedFields.every((field) =>
          list.patchAllowlist.includes(field) && editable.has(field)
        )
        && transaction.request.method === directPatch.method
        && transaction.request.methodOverride === directPatch.methodOverride
        && transaction.request.serialization === "structured-json"
        && transaction.request.digest === "fresh-transaction"
        && transaction.request.ifMatch === "exact-etag"
        && transaction.conflict.status === directPatch.conflictStatus
        && transaction.conflict.action === "surface-conflict"
        && transaction.ambiguousFailure.action === "get-reconcile"
        && !transaction.ambiguousFailure.writeRetry
        && transaction.readback.method === "GET"
        && transaction.readback.semantic
        && transaction.readback.beforeSuccess;
      if (!valid && fallback !== undefined) {
        return [wp06Diagnostic(
          this.id,
          fallback.artifact,
          "/saveTransactions/<transaction>",
          MESSAGE,
        )];
      }
    }
    return [];
  },
});
