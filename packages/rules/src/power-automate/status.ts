import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  actionPointer,
  flowArtifacts,
  flowDiagnostic,
  hasSuccessfulSemanticReadback,
  isSucceededCompletion,
  missingFlowEvidenceDiagnostic,
} from "./common.ts";

const MESSAGE = "Succeeded completion is not guarded by successful semantic readback.";

export const flowStatus001: RuleDetector = Object.freeze({
  id: "FLOW-STATUS-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      const invalid = [...artifact.flow.actions.values()].find((current) =>
        isSucceededCompletion(current)
        && !hasSuccessfulSemanticReadback(context, artifact, current)
      );
      if (invalid !== undefined) {
        return [flowDiagnostic(
          this.id,
          artifact,
          actionPointer(invalid.id),
          MESSAGE,
        )];
      }
    }
    return [];
  },
});
