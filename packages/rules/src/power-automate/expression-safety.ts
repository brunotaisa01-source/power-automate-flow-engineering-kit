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

const MESSAGE = "Flow uses unsafe raw interpolation in a structured payload.";

export const paExpression001: RuleDetector = Object.freeze({
  id: "PA-EXPRESSION-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      const invalid = allExpressions(artifact.flow).find(({ expression }) =>
        /\/(?:body|queries)(?:\/|$)/i.test(expression.pointer)
        && expression.functions.some((name) => name.toLowerCase() === "concat")
        && !expression.functions.some((name) => name.toLowerCase() === "json")
      );
      if (invalid !== undefined) {
        return [flowDiagnostic(
          this.id,
          artifact,
          `/expressions/${invalid.actionId === undefined ? "trigger" : "<action>"}${invalid.expression.pointer}`,
          MESSAGE,
        )];
      }
    }
    return [];
  },
});
