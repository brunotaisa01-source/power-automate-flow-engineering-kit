import type { NormalizedPaginationTraversal } from "@spflow/core/types/wp06-evidence";

import type { RuleDetector, ValidationContext } from "../registry.ts";
import {
  evidenceItems,
  isRecord,
  wp06Diagnostic,
} from "../sharepoint/wp06-common.ts";

const MESSAGE = "Complete read does not exhaust guarded continuation links.";

function isTraversal(value: unknown): value is NormalizedPaginationTraversal {
  if (!isRecord(value) || !isRecord(value.continuation)) return false;
  const continuation = value.continuation;
  return typeof value.completeness === "string"
    && typeof value.mode === "string"
    && typeof continuation.urlParsing === "string"
    && typeof continuation.sameOrigin === "boolean"
    && typeof continuation.sitePath === "boolean"
    && typeof continuation.visitedLinks === "boolean"
    && typeof continuation.pageLimit === "number"
    && typeof continuation.onLoop === "string"
    && typeof continuation.onCrossOrigin === "string"
    && typeof continuation.onSitePathEscape === "string"
    && typeof continuation.onPageLimit === "string"
    && typeof value.accumulation === "string"
    && typeof value.termination === "string";
}

export const appPagination001: RuleDetector = Object.freeze({
  id: "APP-PAGINATION-001",
  async validate(context: ValidationContext) {
    const selection = evidenceItems<NormalizedPaginationTraversal>(
      context,
      this.id,
      "paginationTraversals",
    );
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    const invalid = selection.items.find(({ value }) =>
      !isTraversal(value)
      || value.completeness !== "required"
      || value.mode !== context.contract.frontend.pagination.mode
      || value.continuation.urlParsing !== "url-api"
      || !value.continuation.sameOrigin
      || !value.continuation.sitePath
      || !value.continuation.visitedLinks
      || !Number.isSafeInteger(value.continuation.pageLimit)
      || value.continuation.pageLimit < 1
      || value.continuation.onLoop !== "fail"
      || value.continuation.onCrossOrigin !== "fail"
      || value.continuation.onSitePathEscape !== "fail"
      || value.continuation.onPageLimit !== "fail"
      || value.accumulation !== "append-server-order"
      || value.termination !== "next-link-absent"
    );
    return invalid === undefined
      ? []
      : [wp06Diagnostic(this.id, invalid.artifact, "/pagination/<traversal>", MESSAGE)];
  },
});
