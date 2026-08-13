import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  actionPointer,
  buildFlowGraph,
  firstCycle,
  flowArtifacts,
  flowDiagnostic,
  missingFlowEvidenceDiagnostic,
} from "./common.ts";

const MESSAGE = "Flow action graph contains a cycle or unsatisfiable dependency.";
const SUPPORTED_STATUSES = new Set([
  "Cancelled",
  "Failed",
  "Skipped",
  "Succeeded",
  "TimedOut",
]);

export const paGraph002: RuleDetector = Object.freeze({
  id: "PA-GRAPH-002",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      for (const current of artifact.flow.actions.values()) {
        const unsatisfiable = current.runAfter.some((dependency) =>
          dependency.statuses.length === 0
          || dependency.statuses.some((status) => !SUPPORTED_STATUSES.has(status))
        );
        if (unsatisfiable) {
          return [flowDiagnostic(
            this.id,
            artifact,
            `${actionPointer(current.id)}/runAfter`,
            MESSAGE,
          )];
        }
      }
      const cycleId = firstCycle(artifact.flow, buildFlowGraph(artifact.flow));
      if (cycleId !== undefined) {
        return [flowDiagnostic(
          this.id,
          artifact,
          `${actionPointer(cycleId)}/runAfter`,
          MESSAGE,
        )];
      }
    }
    return [];
  },
});
