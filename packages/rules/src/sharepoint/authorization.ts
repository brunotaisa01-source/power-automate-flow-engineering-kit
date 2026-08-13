import type { NormalizedAuthorityCheck } from "@spflow/core/types/wp06-evidence";

import type { RuleDetector, ValidationContext } from "../registry.ts";
import {
  compareText,
  evidenceItems,
  isRecord,
  wp06Diagnostic,
  type Wp06EvidenceItem,
} from "./wp06-common.ts";

const AUTHORITY_MESSAGE =
  "Protected mutation is not preceded by server identity and active capability re-read.";
const SCOPE_MESSAGE =
  "Protected mutation scope is not checked against current target state and the active capability.";

function isAuthorityCheck(value: unknown): value is NormalizedAuthorityCheck {
  if (!isRecord(value)) return false;
  const sequence = value.sequence;
  const sources = value.authoritySources;
  const capability = value.capability;
  const scope = value.scope;
  const operation = value.effectiveOperation;
  return typeof value.commandType === "string"
    && typeof value.targetListId === "string"
    && isRecord(sequence)
    && [sequence.identityRead, sequence.capabilityRead, sequence.targetRead, sequence.mutation]
      .every((item) => Number.isSafeInteger(item))
    && isRecord(sources)
    && [
      sources.actor,
      sources.role,
      sources.scope,
      sources.protectedState,
      sources.owner,
      sources.amount,
      sources.approval,
    ].every((item) => typeof item === "string")
    && isRecord(capability)
    && typeof capability.id === "string"
    && typeof capability.accessListId === "string"
    && typeof capability.activeField === "string"
    && typeof capability.principalField === "string"
    && typeof capability.capabilityField === "string"
    && typeof capability.source === "string"
    && typeof capability.activeOnly === "boolean"
    && typeof capability.matchCardinality === "string"
    && typeof capability.commandDeclared === "boolean"
    && typeof capability.stateTransitionDeclared === "boolean"
    && isRecord(scope)
    && typeof scope.mode === "string"
    && (scope.targetField === undefined || typeof scope.targetField === "string")
    && (scope.accessField === undefined || typeof scope.accessField === "string")
    && (scope.lookupListId === undefined || typeof scope.lookupListId === "string")
    && typeof scope.targetValueSource === "string"
    && typeof scope.capabilityValueSource === "string"
    && typeof scope.evaluation === "string"
    && typeof scope.checkedBeforeMutation === "boolean"
    && isRecord(operation)
    && typeof operation.operation === "string"
    && typeof operation.allowed === "boolean";
}

function authorityChecks(
  context: ValidationContext,
  ruleId: string,
): ReturnType<typeof evidenceItems<NormalizedAuthorityCheck>> {
  return evidenceItems<NormalizedAuthorityCheck>(context, ruleId, "authorityChecks", "builder");
}

function firstArtifact(
  items: readonly Wp06EvidenceItem<NormalizedAuthorityCheck>[],
): Wp06EvidenceItem<NormalizedAuthorityCheck> | undefined {
  return items[0];
}

function authorityKey(value: { commandType: string; targetListId: string }): string {
  return `${value.commandType}\0${value.targetListId}`;
}

function exactAuthorityOwnership(
  context: ValidationContext,
  items: readonly Wp06EvidenceItem<NormalizedAuthorityCheck>[],
): boolean {
  const expected = context.contract.commands
    .map(({ type, targetListId }) => authorityKey({ commandType: type, targetListId }))
    .sort(compareText);
  const actual = items.map(({ value }) => isAuthorityCheck(value) ? authorityKey(value) : "");
  return actual.length === expected.length
    && new Set(actual).size === actual.length
    && actual.sort(compareText).every((key, index) => key === expected[index]);
}

export const spAuthz001: RuleDetector = Object.freeze({
  id: "SP-AUTHZ-001",
  async validate(context: ValidationContext) {
    const selection = authorityChecks(context, this.id);
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    if (!exactAuthorityOwnership(context, selection.items)) {
      const candidate = firstArtifact(selection.items);
      return candidate === undefined
        ? []
        : [wp06Diagnostic(this.id, candidate.artifact, "/authority/<check>", AUTHORITY_MESSAGE)];
    }

    const malformed = selection.items.find(({ value }) => !isAuthorityCheck(value));
    if (malformed !== undefined) {
      return [wp06Diagnostic(this.id, malformed.artifact, "/authority/<check>", AUTHORITY_MESSAGE)];
    }

    const commands = [...context.contract.commands].sort((left, right) =>
      compareText(left.type, right.type)
    );
    for (const command of commands) {
      const matches = selection.items.filter(({ value }) =>
        value.commandType === command.type && value.targetListId === command.targetListId
      );
      const candidate = matches[0] ?? firstArtifact(selection.items);
      const check = candidate?.value;
      const capability = context.contract.capabilities.find(({ id }) =>
        id === command.requiredCapability
      );
      const transition = context.contract.stateMachines
        .flatMap(({ transitions }) => transitions)
        .find(({ id }) => id === command.transitionId);
      const valid = matches.length === 1
        && check !== undefined
        && capability !== undefined
        && transition !== undefined
        && check.capability.id === command.requiredCapability
        && check.capability.accessListId === capability.accessListId
        && check.capability.activeField === capability.activeField
        && check.capability.principalField === capability.principalField
        && check.capability.capabilityField === capability.capabilityField
        && check.capability.source === "active-access-row"
        && check.capability.activeOnly
        && check.capability.matchCardinality === "one"
        && check.capability.commandDeclared
        && check.capability.stateTransitionDeclared
        && capability.allowedCommands.includes(command.type)
        && transition.commandType === command.type
        && transition.requiredCapability === command.requiredCapability
        && check.sequence.identityRead < check.sequence.mutation
        && check.sequence.capabilityRead < check.sequence.mutation
        && check.sequence.targetRead < check.sequence.mutation
        && check.authoritySources.actor === "server-system-identity"
        && check.authoritySources.role === "active-access-row"
        && check.authoritySources.scope === "active-access-row"
        && check.authoritySources.protectedState === "current-target-read"
        && check.authoritySources.owner === "current-target-read"
        && check.authoritySources.amount === "current-target-read"
        && check.authoritySources.approval === "server-contract"
        && check.effectiveOperation.operation === "update"
        && check.effectiveOperation.allowed;
      if (!valid && candidate !== undefined) {
        return [wp06Diagnostic(this.id, candidate.artifact, "/authority/<check>", AUTHORITY_MESSAGE)];
      }
    }
    return [];
  },
});

export const spAuthz002: RuleDetector = Object.freeze({
  id: "SP-AUTHZ-002",
  async validate(context: ValidationContext) {
    const selection = authorityChecks(context, this.id);
    if (!selection.applicable) return [];
    if (selection.missing !== undefined) return [selection.missing];

    if (!exactAuthorityOwnership(context, selection.items)) {
      const candidate = firstArtifact(selection.items);
      return candidate === undefined
        ? []
        : [wp06Diagnostic(this.id, candidate.artifact, "/authority/<check>/scope", SCOPE_MESSAGE)];
    }

    for (const item of selection.items) {
      if (!isAuthorityCheck(item.value)) {
        return [wp06Diagnostic(this.id, item.artifact, "/authority/<check>/scope", SCOPE_MESSAGE)];
      }
      const command = context.contract.commands.find(({ type, targetListId }) =>
        type === item.value.commandType && targetListId === item.value.targetListId
      );
      const capability = context.contract.capabilities.find(({ id }) =>
        id === command?.requiredCapability
      );
      const expectedEvaluation = capability?.scope.mode === "global"
        ? "global"
        : capability?.scope.mode === "lookup-membership"
        ? "lookup-membership"
        : "exact-match";
      if (
        command === undefined
        || capability === undefined
        || item.value.capability.id !== capability.id
        || item.value.capability.accessListId !== capability.accessListId
        || item.value.capability.source !== "active-access-row"
        || item.value.capability.matchCardinality !== "one"
        || item.value.scope.mode !== capability.scope.mode
        || item.value.scope.targetField !== capability.scope.targetField
        || item.value.scope.accessField !== capability.scope.accessField
        || item.value.scope.lookupListId !== capability.scope.lookupListId
        || (capability.scope.targetField !== undefined
          && !command.serverReadFields.includes(capability.scope.targetField))
        || item.value.scope.targetValueSource !== "current-target-read"
        || item.value.scope.capabilityValueSource !== "active-access-row"
        || item.value.scope.evaluation !== expectedEvaluation
        || !item.value.scope.checkedBeforeMutation
        || item.value.sequence.targetRead >= item.value.sequence.mutation
        || item.value.authoritySources.scope !== "active-access-row"
      ) {
        return [wp06Diagnostic(this.id, item.artifact, "/authority/<check>/scope", SCOPE_MESSAGE)];
      }
    }
    return [];
  },
});
