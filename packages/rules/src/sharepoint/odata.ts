import type { NormalizedODataRequest } from "@spflow/core/types/wp06-evidence";

import type { RuleDetector, ValidationContext } from "../registry.ts";
import {
  evidenceItems,
  isRecord,
  strings,
  wp06Diagnostic,
} from "./wp06-common.ts";

const MESSAGE = "OData request accepts raw fragments or lacks structured escaping and encoding.";

function isRequest(value: unknown): value is NormalizedODataRequest {
  return isRecord(value)
    && typeof value.listId === "string"
    && strings(value.fieldNames) !== undefined
    && typeof value.fieldSource === "string"
    && typeof value.queryConstruction === "string"
    && typeof value.pathConstruction === "string"
    && typeof value.stringLiteralEscaping === "string"
    && typeof value.rawFragmentsAccepted === "boolean"
    && typeof value.parameterEncoding === "string";
}

export const spOdata001: RuleDetector = Object.freeze({
  id: "SP-ODATA-001",
  async validate(context: ValidationContext) {
    const selection = evidenceItems<NormalizedODataRequest>(context, this.id, "odataRequests");
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    const invalid = selection.items.find(({ value }) => {
      if (!isRequest(value)) return true;
      const list = context.contract.sharePoint.lists.find(({ id }) => id === value.listId);
      return list === undefined
        || value.fieldNames.length === 0
        || value.fieldNames.some((field) => !list.readAllowlist.includes(field))
        || value.fieldSource !== "contract-allowlist"
        || value.queryConstruction !== "url-api"
        || value.pathConstruction !== "url-api"
        || value.stringLiteralEscaping !== "double-single-quote-before-encoding"
        || value.rawFragmentsAccepted
        || value.parameterEncoding !== "url-search-params";
    });
    return invalid === undefined
      ? []
      : [wp06Diagnostic(this.id, invalid.artifact, "/odata/<request>", MESSAGE)];
  },
});
