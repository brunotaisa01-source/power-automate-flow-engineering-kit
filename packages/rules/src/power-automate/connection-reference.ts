import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  flowArtifacts,
  flowDiagnostic,
  missingFlowEvidenceDiagnostic,
} from "./common.ts";

const MESSAGE = "Flow connection references are missing, implicit, inconsistent, or unused.";

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export const paConnection001: RuleDetector = Object.freeze({
  id: "PA-CONNECTION-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      const declared = sortedUnique(artifact.contract.connectionReferences);
      const packaged = sortedUnique([...artifact.flow.connectionReferences]);
      const used = sortedUnique([...artifact.flow.actions.values()].flatMap((current) =>
        current.connector?.reference === undefined ? [] : [current.connector.reference]
      ));
      if (
        declared.some((reference) => reference.length === 0)
        || packaged.some((reference) => reference.length === 0)
        || used.some((reference) => reference.length === 0)
        || declared.length !== packaged.length
        || declared.length !== used.length
        || declared.some((reference, index) => reference !== packaged[index])
        || declared.some((reference, index) => reference !== used[index])
      ) {
        return [flowDiagnostic(this.id, artifact, "/connectionReferences", MESSAGE)];
      }
    }
    return [];
  },
});
