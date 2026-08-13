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
    && Number.isSafeInteger(value.status)
    && (value.status as number) >= 100
    && (value.status as number) <= 599
    && typeof value.phase === "string"
    && typeof value.requestKind === "string"
    && typeof value.allowCreateMissing404 === "boolean"
    && isRecord(value.error)
    && (value.error.platformCode === undefined || typeof value.error.platformCode === "string")
    && (value.error.messageCategory === undefined || typeof value.error.messageCategory === "string")
    && (value.responseBody === undefined
      || (isRecord(value.responseBody)
        && value.responseBody.bodyKind === "sharepoint-object"
        && value.responseBody.parsed === true
        && value.responseBody.schemaValid === true))
    && typeof value.classification === "string";
}

function hasValidFoundBody(value: NormalizedHttpClassification): boolean {
  return value.status !== 204
    && value.status !== 205
    && (value.requestKind === "initial-get" || value.requestKind === "other-get")
    && value.responseBody?.bodyKind === "sharepoint-object"
    && value.responseBody.parsed
    && value.responseBody.schemaValid;
}

function expectedClassification(value: NormalizedHttpClassification): string {
  if (value.status >= 200 && value.status <= 299) {
    return hasValidFoundBody(value) ? "FOUND" : "GET_FAILED";
  }
  if (value.status === 400) {
    return value.error.platformCode === MISSING_COLUMN_CODE
        || value.error.messageCategory === "column-does-not-exist"
      ? "MISSING_OBJECT"
      : "GET_FAILED";
  }
  if (value.status === 404) {
    return value.phase === "preflight"
        && value.requestKind === "initial-get"
        && value.allowCreateMissing404
      ? "CREATE_MISSING"
      : "GET_FAILED";
  }
  return "GET_FAILED";
}

function isValidClassification(value: unknown): value is NormalizedHttpClassification {
  return isClassification(value) && value.classification === expectedClassification(value);
}

function classificationKey(value: NormalizedHttpClassification): string {
  return JSON.stringify([
    value.status,
    value.phase,
    value.requestKind,
    value.allowCreateMissing404,
    value.error.platformCode ?? null,
    value.error.messageCategory ?? null,
    value.responseBody ?? null,
    value.classification,
  ]);
}

function hasUniqueClassifications(values: readonly unknown[]): boolean {
  if (!values.every(isClassification)) return false;
  const keys = values.map((value) => classificationKey(value as NormalizedHttpClassification));
  return new Set(keys).size === keys.length;
}

export const httpSemantic001: RuleDetector = Object.freeze({
  id: "HTTP-SEMANTIC-001",
  async validate(context: ValidationContext) {
    const selection = evidenceItems<NormalizedHttpClassification>(
      context,
      this.id,
      "httpClassifications",
      "builder",
    );
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    const invalid = selection.items.find(({ value }) => !isValidClassification(value));
    const duplicate = !hasUniqueClassifications(selection.items.map(({ value }) => value));
    const artifact = invalid?.artifact ?? selection.items[0]?.artifact;
    return invalid === undefined && !duplicate
      ? []
      : artifact === undefined
      ? []
      : [wp06Diagnostic(this.id, artifact, "/http/<classification>", HTTP_400_MESSAGE)];
  },
});

export const httpSemantic002: RuleDetector = Object.freeze({
  id: "HTTP-SEMANTIC-002",
  async validate(context: ValidationContext) {
    const selection = evidenceItems<NormalizedHttpClassification>(
      context,
      this.id,
      "httpClassifications",
      "builder",
    );
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    const invalid = selection.items.find(({ value }) => !isValidClassification(value));
    const duplicate = !hasUniqueClassifications(selection.items.map(({ value }) => value));
    const artifact = invalid?.artifact ?? selection.items[0]?.artifact;
    return invalid === undefined && !duplicate
      ? []
      : artifact === undefined
      ? []
      : [wp06Diagnostic(
        this.id,
        artifact,
        "/http/<classification>/phase",
        HTTP_404_MESSAGE,
      )];
  },
});
