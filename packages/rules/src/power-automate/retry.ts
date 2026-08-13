import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  actionPointer,
  flowArtifacts,
  flowDiagnostic,
  isConnectorMutation,
  isConnectorRead,
  missingFlowEvidenceDiagnostic,
} from "./common.ts";

const MESSAGE = "Mutating action can retry an ambiguous result without GET reconciliation.";

export const flowRetry001: RuleDetector = Object.freeze({
  id: "FLOW-RETRY-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      for (const mutation of [...artifact.flow.actions.values()].filter(isConnectorMutation)) {
        const reconciles = [...artifact.flow.actions.values()].some((current) =>
          isConnectorRead(current)
          && current.runAfter.some((dependency) =>
            dependency.actionId === mutation.id
            && dependency.statuses.includes("Failed")
            && dependency.statuses.includes("TimedOut")
          )
        );
        if (mutation.retryPolicy?.type !== "none" || !reconciles) {
          return [flowDiagnostic(
            this.id,
            artifact,
            `${actionPointer(mutation.id)}/retryPolicy`,
            MESSAGE,
          )];
        }
      }
    }
    return [];
  },
});
