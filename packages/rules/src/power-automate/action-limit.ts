import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  flowArtifacts,
  flowDiagnostic,
  missingFlowEvidenceDiagnostic,
} from "./common.ts";

const MESSAGE = "Flow action count exceeds its project contract or platform budget.";
const PLATFORM_ACTION_BUDGET = 500;

export const paLimit001: RuleDetector = Object.freeze({
  id: "PA-LIMIT-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      if (
        artifact.flow.actionCount > artifact.contract.actionBudget
        || artifact.flow.actionCount > PLATFORM_ACTION_BUDGET
      ) {
        return [flowDiagnostic(this.id, artifact, "/actionCount", MESSAGE)];
      }
    }
    return [];
  },
});
