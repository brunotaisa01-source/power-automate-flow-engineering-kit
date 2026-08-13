import type { NormalizedHttpClassification } from "@spflow/core/types/wp06-evidence";

import type { RuleDetector, ValidationContext } from "../registry.ts";
import {
  evidenceItems,
  isRecord,
  wp06Diagnostic,
} from "../sharepoint/wp06-common.ts";

const HTTP_400_MESSAGE =
  "HTTP 400 classification is not derived from the approved missing-column semantic signature.";
const HTTP_404_MESSAGE =
  "HTTP 404 classification is not restricted to the declared initial Preflight GET.";
const MISSING_COLUMN_CODE = "-2147024809";

function isClassification(value: unknown): value is NormalizedHttpClassification {
  return isRecord(value)
    && typeof value.status === "number"
    && typeof value.phase === "string"
    && typeof value.requestKind === "string"
    && typeof value.allowCreateMissing404 === "boolean"
    && isRecord(value.error)
    && (value.error.platformCode === undefined || typeof value.error.platformCode === "string")
    && (value.error.messageCategory === undefined || typeof value.error.messageCategory === "string")
    && typeof value.classification === "string";
}

export const httpSemantic001: RuleDetector = Object.freeze({
  id: "HTTP-SEMANTIC-001",
  async validate(context: ValidationContext) {
    const selection = evidenceItems<NormalizedHttpClassification>(
      context,
      this.id,
      "httpClassifications",
    );
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    const invalid = selection.items.find(({ value }) => {
      if (!isClassification(value) || value.status !== 400) return !isClassification(value);
      const missingSignature = value.error.platformCode === MISSING_COLUMN_CODE
        || value.error.messageCategory === "column-does-not-exist";
      return value.classification !== (missingSignature ? "MISSING_OBJECT" : "GET_FAILED");
    });
    return invalid === undefined
      ? []
      : [wp06Diagnostic(this.id, invalid.artifact, "/http/<classification>", HTTP_400_MESSAGE)];
  },
});

export const httpSemantic002: RuleDetector = Object.freeze({
  id: "HTTP-SEMANTIC-002",
  async validate(context: ValidationContext) {
    const selection = evidenceItems<NormalizedHttpClassification>(
      context,
      this.id,
      "httpClassifications",
    );
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    const invalid = selection.items.find(({ value }) => {
      if (!isClassification(value) || value.status !== 404) return !isClassification(value);
      const mayCreate = value.phase === "preflight"
        && value.requestKind === "initial-get"
        && value.allowCreateMissing404;
      return value.classification !== (mayCreate ? "CREATE_MISSING" : "GET_FAILED");
    });
    return invalid === undefined
      ? []
      : [wp06Diagnostic(
        this.id,
        invalid.artifact,
        "/http/<classification>/phase",
        HTTP_404_MESSAGE,
      )];
  },
});
