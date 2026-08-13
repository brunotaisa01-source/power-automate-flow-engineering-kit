import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  actionPointer,
  buildFlowGraph,
  flowArtifacts,
  flowDiagnostic,
  hasSuccessfulConditionAncestor,
  isConnectorMutation,
  missingFlowEvidenceDiagnostic,
  reachableActions,
} from "./common.ts";

const MESSAGE = "Flow action graph contains a missing, cross-container, unreachable, or bypassable dependency.";

export const paGraph001: RuleDetector = Object.freeze({
  id: "PA-GRAPH-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      for (const current of artifact.flow.actions.values()) {
        for (const dependency of current.runAfter) {
          const predecessor = artifact.flow.actions.get(dependency.actionId);
          if (predecessor === undefined) {
            return [flowDiagnostic(
              this.id,
              artifact,
              `${actionPointer(current.id)}/runAfter/<predecessor>`,
              "Action predecessor does not exist.",
            )];
          }
          if (predecessor.containerId !== current.containerId) {
            return [flowDiagnostic(
              this.id,
              artifact,
              `${actionPointer(current.id)}/runAfter/<predecessor>`,
              "Action predecessor is outside the action's container.",
            )];
          }
        }
      }

      const graph = buildFlowGraph(artifact.flow);
      const reachable = reachableActions(artifact.flow, graph);
      const unreachable = [...artifact.flow.actions.values()].find(
        (current) => !reachable.has(current.id),
      );
      if (unreachable !== undefined) {
        return [flowDiagnostic(
          this.id,
          artifact,
          actionPointer(unreachable.id),
          MESSAGE,
        )];
      }

      if (artifact.contract.processorForCommandTypes.length > 0) {
        const bypass = [...artifact.flow.actions.values()].find((current) =>
          isConnectorMutation(current)
          && !hasSuccessfulConditionAncestor(artifact.flow, current)
        );
        if (bypass !== undefined) {
          return [flowDiagnostic(
            this.id,
            artifact,
            actionPointer(bypass.id),
            MESSAGE,
          )];
        }
      }
    }
    return [];
  },
});
