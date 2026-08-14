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
  action: { readonly inputs?: unknown; readonly connector?: {
    readonly operationId: string;
    readonly method?: string;
    readonly overrideMethod?: string;
    readonly ifMatch?: string;
  } },
): boolean {
  const connector = action.connector;
  if (connector === undefined) return false;
  const method = connector.method?.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method ?? "")) return false;
  if (method === "MERGE" || method === "PATCH" || connector.overrideMethod !== undefined) return true;
  if (!/http/i.test(connector.operationId)) return false;
  if (method !== "POST") return true;
  const inputs = action.inputs !== null && typeof action.inputs === "object" && !Array.isArray(action.inputs)
    ? action.inputs as Record<string, unknown>
    : undefined;
  const uri = typeof inputs?.uri === "string" ? inputs.uri.split("?", 1)[0] : undefined;
  if (uri === undefined || uri.startsWith("@")) return true;
  const knownNonUpdatePost = /^\/_api\/contextinfo$/i.test(uri)
    || /\/fields$/i.test(uri)
    || /\/breakroleinheritance\(.+\)$/i.test(uri)
    || /\/roleassignments\/addroleassignment\(.+\)$/i.test(uri);
  return !knownNonUpdatePost;
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
        return requiresMergeShape(current)
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
