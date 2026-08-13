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
    && (value.responseBody === undefined || isRecord(value.responseBody))
    && typeof value.classification === "string";
}

function expectedValueKind(type: string | undefined, fieldName: string): string | undefined {
  if (fieldName === "ID") return "number";
  if (fieldName === "Title" && type === undefined) return "string";
  switch (type) {
    case "Boolean": return "boolean";
    case "Currency":
    case "Number": return "number";
    case "Choice":
    case "DateTime":
    case "Lookup":
    case "Text":
    case "User": return "string";
    default: return undefined;
  }
}

function hasValidFoundBody(
  value: NormalizedHttpClassification,
  context: ValidationContext,
): boolean {
  const body = value.responseBody;
  if (body === undefined) return false;
  const list = context.contract.sharePoint.lists.find(({ id }) => id === body.targetListId);
  if (list === undefined || body.schemaId !== `sharepoint-list-item-v1:${list.id}`) return false;
  const expectedKind = value.requestKind === "collection-get" ? "list" : "object";
  if (
    !["initial-get", "other-get", "collection-get"].includes(value.requestKind)
    || body.actual.kind !== expectedKind
    || body.actual.itemCount < 1
  ) return false;
  const actualNames = body.actual.fields.map(({ name }) => name);
  if (
    new Set(body.expectedFields).size !== body.expectedFields.length
    || new Set(actualNames).size !== actualNames.length
    || body.expectedFields.length !== actualNames.length
    || !body.expectedFields.every((field, index) => field === actualNames[index])
    || !body.expectedFields.every((field) => list.readAllowlist.includes(field))
  ) return false;
  return body.actual.fields.every(({ name, valueKind }) => {
    const field = list.fields.find(({ internalName }) => internalName === name);
    const expected = expectedValueKind(field?.type, name);
    return expected !== undefined && valueKind === expected;
  });
}

function hasValidFoundStatus(value: NormalizedHttpClassification): boolean {
  return value.status !== 204
    && value.status !== 205
    && value.status >= 200
    && value.status <= 299;
}

function expectedClassification(
  value: NormalizedHttpClassification,
  context: ValidationContext,
): string {
  if (value.status >= 200 && value.status <= 299) {
    return hasValidFoundStatus(value) && hasValidFoundBody(value, context)
      ? "FOUND"
      : "GET_FAILED";
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

function isValidClassification(
  value: unknown,
  context: ValidationContext,
): value is NormalizedHttpClassification {
  return isClassification(value) && value.classification === expectedClassification(value, context);
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

    const invalid = selection.items.find(({ value }) => !isValidClassification(value, context));
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

    const invalid = selection.items.find(({ value }) => !isValidClassification(value, context));
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
