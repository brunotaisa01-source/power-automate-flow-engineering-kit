import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  actionPointer,
  flowArtifacts,
  flowDiagnostic,
  missingFlowEvidenceDiagnostic,
} from "./common.ts";

const MESSAGE = "SharePoint REST mutation does not use POST with a MERGE override and exact ETag.";

function requiresMergeShape(
  connector: NonNullable<ReturnType<typeof connectorFromAction>>,
): boolean {
  return connector.method?.toUpperCase() === "MERGE"
    || connector.overrideMethod?.toUpperCase() === "MERGE"
    || /http/i.test(connector.operationId);
}

function connectorFromAction(action: { readonly connector?: {
  readonly operationId: string;
  readonly method?: string;
  readonly overrideMethod?: string;
  readonly ifMatch?: string;
} }) {
  return action.connector;
}

export const paConnector001: RuleDetector = Object.freeze({
  id: "PA-CONNECTOR-001",
  async validate(context: ValidationContext) {
    const missing = missingFlowEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const artifact of flowArtifacts(context)) {
      const invalid = [...artifact.flow.actions.values()].find((current) => {
        const connector = current.connector;
        if (connector === undefined) {
          return /(?:api|connection)/i.test(current.type);
        }
        return requiresMergeShape(connector)
          && (
            connector.method?.toUpperCase() !== "POST"
            || connector.overrideMethod?.toUpperCase() !== "MERGE"
            || connector.ifMatch === undefined
            || connector.ifMatch.length === 0
            || connector.ifMatch === "*"
          );
      });
      if (invalid !== undefined) {
        return [flowDiagnostic(
          this.id,
          artifact,
          `${actionPointer(invalid.id)}/connector`,
          MESSAGE,
        )];
      }
    }
    return [];
  },
});
