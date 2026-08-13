import { isDeepStrictEqual } from "node:util";

import type { FieldContract } from "@spflow/core/types/sharepoint";
import type {
  NormalizedFieldCompatibility,
  NormalizedFieldIdentity,
  NormalizedFieldOperation,
  NormalizedFieldPayload,
  NormalizedFieldUse,
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

const IDENTITY_MESSAGE =
  "SharePoint field use is not bound to a confirmed internal name and EntityPropertyName.";
const PAYLOAD_MESSAGE =
  "SharePoint field payload lacks endpoint-required typed metadata or structured serialization.";
const COMPATIBILITY_MESSAGE =
  "Existing SharePoint field compatibility is not classified property by property.";

const FIELD_PAYLOADS: Readonly<Record<string, { metadata: string; kind: number }>> = {
  Boolean: { metadata: "SP.FieldBoolean", kind: 8 },
  Choice: { metadata: "SP.FieldChoice", kind: 6 },
  Currency: { metadata: "SP.FieldCurrency", kind: 10 },
  DateTime: { metadata: "SP.FieldDateTime", kind: 4 },
  Guid: { metadata: "SP.FieldGuid", kind: 14 },
  Lookup: { metadata: "SP.FieldLookup", kind: 7 },
  Note: { metadata: "SP.FieldMultiLineText", kind: 3 },
  Number: { metadata: "SP.FieldNumber", kind: 9 },
  Text: { metadata: "SP.FieldText", kind: 2 },
  User: { metadata: "SP.FieldUser", kind: 20 },
};

function isIdentity(value: unknown): value is NormalizedFieldIdentity {
  return isRecord(value)
    && typeof value.source === "string"
    && typeof value.internalName === "string"
    && typeof value.entityPropertyName === "string";
}

function isUse(value: unknown): value is NormalizedFieldUse {
  return isRecord(value)
    && typeof value.operation === "string"
    && typeof value.fieldName === "string"
    && typeof value.source === "string";
}

function isPayload(value: unknown): value is NormalizedFieldPayload {
  return isRecord(value)
    && typeof value.serialization === "string"
    && typeof value.metadataType === "string"
    && (value.fieldTypeKind === undefined || typeof value.fieldTypeKind === "number");
}

function isCompatibility(value: unknown): value is NormalizedFieldCompatibility {
  return isRecord(value)
    && typeof value.response === "string"
    && strings(value.comparedProperties) !== undefined
    && (value.actual === undefined || isRecord(value.actual))
    && typeof value.outcome === "string"
    && typeof value.writeAction === "string";
}

function isFieldOperation(value: unknown): value is NormalizedFieldOperation {
  return isRecord(value)
    && typeof value.listId === "string"
    && typeof value.logicalName === "string"
    && (value.identity === undefined || isIdentity(value.identity))
    && (value.uses === undefined || (Array.isArray(value.uses) && value.uses.every(isUse)))
    && (value.createPayload === undefined || isPayload(value.createPayload))
    && (value.indexPayload === undefined || isPayload(value.indexPayload))
    && (value.compatibility === undefined || isCompatibility(value.compatibility));
}

function fieldEntries(context: ValidationContext): Array<{
  readonly listId: string;
  readonly field: FieldContract;
}> {
  return context.contract.sharePoint.lists
    .flatMap((list) => list.fields.map((field) => ({ listId: list.id, field })))
    .sort((left, right) =>
      compareText(left.listId, right.listId)
      || compareText(left.field.logicalName, right.field.logicalName)
    );
}

function operationMatches(
  value: NormalizedFieldOperation,
  listId: string,
  field: FieldContract,
): boolean {
  return value.listId === listId && value.logicalName === field.logicalName;
}

function expectedCompatibility(field: FieldContract): Readonly<Record<string, unknown>> {
  return {
    logicalName: field.logicalName,
    internalName: field.internalName,
    type: field.type,
    required: field.required,
    indexed: field.indexed,
    unique: field.unique,
    clientEditable: field.clientEditable,
    serverAuthoritative: field.serverAuthoritative,
    immutableAfterCreate: field.immutableAfterCreate,
    sensitive: field.sensitive,
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    ...(field.dateTimeMode === undefined ? {} : { dateTimeMode: field.dateTimeMode }),
    ...(field.choices === undefined ? {} : { choices: field.choices }),
    ...(field.lookupListId === undefined ? {} : { lookupListId: field.lookupListId }),
    ...(field.lookupField === undefined ? {} : { lookupField: field.lookupField }),
  };
}

function fieldSelection(context: ValidationContext, ruleId: string) {
  return evidenceItems<NormalizedFieldOperation>(context, ruleId, "fieldOperations");
}

export const spSchema001: RuleDetector = Object.freeze({
  id: "SP-SCHEMA-001",
  async validate(context: ValidationContext) {
    const selection = fieldSelection(context, this.id);
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    for (const { listId, field } of fieldEntries(context)) {
      const matches = selection.items.filter(({ value }) =>
        isFieldOperation(value)
        && operationMatches(value, listId, field)
        && value.identity !== undefined
      );
      const fallback = matches[0] ?? selection.items[0];
      const operation = matches[0]?.value;
      const valid = matches.length === 1
        && isFieldOperation(operation)
        && isIdentity(operation.identity)
        && operation.identity.source === "field-readback"
        && operation.identity.internalName === field.internalName
        && operation.identity.entityPropertyName.length > 0
        && Array.isArray(operation.uses)
        && operation.uses.length > 0
        && operation.uses.every((use) =>
          isUse(use)
          && use.source === "entity-property-name"
          && use.fieldName === operation.identity?.entityPropertyName
        );
      if (!valid && fallback !== undefined) {
        return [wp06Diagnostic(
          this.id,
          fallback.artifact,
          "/schema/<field>/identity",
          IDENTITY_MESSAGE,
        )];
      }
    }
    return [];
  },
});

export const spSchema002: RuleDetector = Object.freeze({
  id: "SP-SCHEMA-002",
  async validate(context: ValidationContext) {
    const selection = fieldSelection(context, this.id);
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    for (const { listId, field } of fieldEntries(context)) {
      const matches = selection.items.filter(({ value }) =>
        isFieldOperation(value)
        && operationMatches(value, listId, field)
        && value.createPayload !== undefined
      );
      const fallback = matches[0] ?? selection.items[0];
      const operation = matches[0]?.value;
      const payload = FIELD_PAYLOADS[field.type];
      const valid = matches.length === 1
        && payload !== undefined
        && isFieldOperation(operation)
        && isPayload(operation.createPayload)
        && operation.createPayload.serialization === "structured-json"
        && operation.createPayload.metadataType === payload.metadata
        && operation.createPayload.fieldTypeKind === payload.kind
        && (!field.indexed
          || (isPayload(operation.indexPayload)
            && operation.indexPayload.serialization === "structured-json"
            && operation.indexPayload.metadataType === "SP.Field"));
      if (!valid && fallback !== undefined) {
        return [wp06Diagnostic(
          this.id,
          fallback.artifact,
          "/schema/<field>/payload",
          PAYLOAD_MESSAGE,
        )];
      }
    }
    return [];
  },
});

export const spSchema003: RuleDetector = Object.freeze({
  id: "SP-SCHEMA-003",
  async validate(context: ValidationContext) {
    const selection = fieldSelection(context, this.id);
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    for (const { listId, field } of fieldEntries(context)) {
      const matches = selection.items.filter(({ value }) =>
        isFieldOperation(value)
        && operationMatches(value, listId, field)
        && value.compatibility !== undefined
      );
      const fallback = matches[0] ?? selection.items[0];
      const operation = matches[0]?.value;
      const compatibility = isFieldOperation(operation) ? operation.compatibility : undefined;
      const expected = expectedCompatibility(field);
      const expectedProperties = Object.keys(expected);
      let valid = matches.length === 1 && isCompatibility(compatibility);
      if (valid && compatibility !== undefined) {
        if (compatibility.response === "FOUND") {
          const actual = compatibility.actual;
          const exact = isRecord(actual)
            && expectedProperties.every((property) =>
              Object.hasOwn(actual, property)
              && isDeepStrictEqual(actual[property], expected[property])
            );
          valid = sameStringSet(compatibility.comparedProperties, expectedProperties)
            && compatibility.outcome === (exact ? "MATCH" : "INCOMPATIBLE")
            && compatibility.writeAction === "none";
        } else if (compatibility.response === "MISSING_OBJECT") {
          valid = compatibility.outcome === "CREATE_MISSING"
            && compatibility.writeAction === "create-approved-plan";
        } else if (compatibility.response === "GET_FAILED") {
          valid = compatibility.outcome === "GET_FAILED"
            && compatibility.writeAction === "none";
        } else {
          valid = false;
        }
      }
      if (!valid && fallback !== undefined) {
        return [wp06Diagnostic(
          this.id,
          fallback.artifact,
          "/schema/<field>/compatibility",
          COMPATIBILITY_MESSAGE,
        )];
      }
    }
    return [];
  },
});
