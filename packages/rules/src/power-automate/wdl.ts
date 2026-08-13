import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  allExpressions,
  flowArtifacts,
  flowDiagnostic,
  missingFlowEvidenceDiagnostic,
} from "./common.ts";

const MESSAGE = "Flow contains a malformed or path-invalid workflow expression.";

export const paWdl001: RuleDetector = Object.freeze({
  id: "PA-WDL-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      const invalid = allExpressions(artifact.flow).find(({ expression }) =>
        !expression.valid
        || expression.actionReferences.some((reference) => !artifact.flow.actions.has(reference))
      );
      if (invalid !== undefined) {
        const owner = invalid.actionId === undefined
          ? "/trigger"
          : "/actions/<action>";
        return [flowDiagnostic(
          this.id,
          artifact,
          `${owner}${invalid.expression.pointer}`,
          MESSAGE,
        )];
      }
    }
    return [];
  },
});
