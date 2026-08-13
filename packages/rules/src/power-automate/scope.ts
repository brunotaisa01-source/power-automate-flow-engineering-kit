import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  actionById,
  actionPointer,
  flowArtifacts,
  flowDiagnostic,
  missingFlowEvidenceDiagnostic,
} from "./common.ts";

const MESSAGE = "Terminate action is nested within a loop scope.";
const LOOP_TYPES = new Set(["apply_to_each", "foreach"]);

export const paScope001: RuleDetector = Object.freeze({
  id: "PA-SCOPE-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      const actions = actionById(artifact.flow);
      for (const current of artifact.flow.actions.values()) {
        if (current.type.toLowerCase() !== "terminate") {
          continue;
        }
        let parentId = current.parentId;
        while (parentId !== undefined) {
          const parent = actions.get(parentId);
          if (parent === undefined) {
            break;
          }
          if (LOOP_TYPES.has(parent.type.toLowerCase())) {
            return [flowDiagnostic(
              this.id,
              artifact,
              actionPointer(current.id),
              MESSAGE,
            )];
          }
          parentId = parent.parentId;
        }
      }
    }
    return [];
  },
});
