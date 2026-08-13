import type {
  NormalizedPermissionGrant,
  NormalizedPermissionModel,
  NormalizedPermissionProbe,
} from "@spflow/core/types/wp06-evidence";

import type { RuleDetector, ValidationContext } from "../registry.ts";
import {
  booleans,
  compareText,
  evidenceItems,
  isRecord,
  sameStringSet,
  strings,
  wp06Diagnostic,
} from "./wp06-common.ts";

const MODEL_MESSAGE = "Declared permission matrix permits a forbidden principal or browser operation.";
const PROBE_MESSAGE = "Effective permission evidence does not match the required operation booleans.";
const OPERATION_UNIVERSE = ["create", "delete", "read", "update"] as const;

function isGrant(value: unknown): value is NormalizedPermissionGrant {
  return isRecord(value)
    && typeof value.principalKind === "string"
    && typeof value.principalBinding === "string"
    && typeof value.role === "string"
    && strings(value.allowedOperations) !== undefined;
}

function isModel(value: unknown): value is NormalizedPermissionModel {
  return isRecord(value)
    && typeof value.listId === "string"
    && typeof value.inheritance === "string"
    && typeof value.directUserGrants === "string"
    && strings(value.browserOperations) !== undefined
    && Array.isArray(value.grants)
    && value.grants.every(isGrant);
}

function isProbe(value: unknown): value is NormalizedPermissionProbe {
  return isRecord(value)
    && typeof value.listId === "string"
    && typeof value.principalBinding === "string"
    && booleans(value.operations) !== undefined;
}

function expectedBrowserOperations(role: string, writeModel: string): readonly string[] {
  if (role === "command-queue") return ["read", "create"];
  if (role === "protected-domain") {
    return writeModel === "direct-patch" ? ["read", "update"] : ["read"];
  }
  if (role === "reference" || role === "outbox") return ["read"];
  return [];
}

function grantKey(grant: { principalBinding: string; role: string }): string {
  return `${grant.principalBinding}\0${grant.role}`;
}

export const spAcl001: RuleDetector = Object.freeze({
  id: "SP-ACL-001",
  async validate(context: ValidationContext) {
    const selection = evidenceItems<NormalizedPermissionModel>(
      context,
      this.id,
      "permissionModels",
    );
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    for (const list of [...context.contract.sharePoint.lists].sort((left, right) =>
      compareText(left.id, right.id)
    )) {
      const matches = selection.items.filter(({ value }) =>
        isModel(value) && value.listId === list.id
      );
      const fallback = matches[0] ?? selection.items[0];
      const model = matches[0]?.value;
      const expectedGrants = [...list.permissions.minimumRoles].sort((left, right) =>
        compareText(grantKey(left), grantKey(right))
      );
      const actualGrants = isModel(model)
        ? [...model.grants].sort((left, right) => compareText(grantKey(left), grantKey(right)))
        : [];
      const grantsMatch = actualGrants.length === expectedGrants.length
        && actualGrants.every((grant, index) => {
          const expected = expectedGrants[index];
          return expected !== undefined
            && grant.principalKind === "binding"
            && grant.principalBinding === expected.principalBinding
            && grant.role === expected.role
            && sameStringSet(grant.allowedOperations, expected.allowedOperations);
        });
      const valid = matches.length === 1
        && isModel(model)
        && model.inheritance === list.permissions.inheritance
        && model.directUserGrants === "forbidden"
        && sameStringSet(
          model.browserOperations,
          expectedBrowserOperations(list.role, list.writeModel),
        )
        && grantsMatch;
      if (!valid && fallback !== undefined) {
        return [wp06Diagnostic(this.id, fallback.artifact, "/permissions/<list>", MODEL_MESSAGE)];
      }
    }
    return [];
  },
});

export const spAcl002: RuleDetector = Object.freeze({
  id: "SP-ACL-002",
  async validate(context: ValidationContext) {
    const selection = evidenceItems<NormalizedPermissionProbe>(
      context,
      this.id,
      "permissionProbes",
    );
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    for (const list of [...context.contract.sharePoint.lists].sort((left, right) =>
      compareText(left.id, right.id)
    )) {
      for (const role of [...list.permissions.minimumRoles].sort((left, right) =>
        compareText(grantKey(left), grantKey(right))
      )) {
        const matches = selection.items.filter(({ value }) =>
          isProbe(value)
          && value.listId === list.id
          && value.principalBinding === role.principalBinding
        );
        const fallback = matches[0] ?? selection.items[0];
        const probe = matches[0]?.value;
        const operations = isProbe(probe) ? probe.operations : {};
        const valid = matches.length === 1
          && OPERATION_UNIVERSE.every((operation) =>
            Object.hasOwn(operations, operation)
            && operations[operation] === role.allowedOperations.includes(operation)
          )
          && Object.entries(operations).every(([operation, allowed]) =>
            !allowed || role.allowedOperations.includes(operation)
          );
        if (!valid && fallback !== undefined) {
          return [wp06Diagnostic(
            this.id,
            fallback.artifact,
            "/effectivePermissions/<probe>",
            PROBE_MESSAGE,
          )];
        }
      }
    }
    return [];
  },
});
