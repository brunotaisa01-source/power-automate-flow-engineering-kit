import { createArtifactNode, type ArtifactNode, type ArtifactProjections } from "../artifact-node.js";
import { isRecord, mergeProjections, nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";

function definitionProjections(data: unknown): ArtifactProjections {
  if (!isRecord(data) || typeof data.id !== "string") {
    return {};
  }
  const projections: Record<string, Record<string, unknown>> = {};
  if (Array.isArray(data.connectionReferences)) {
    projections["connection-references"] = { [data.id]: data.connectionReferences };
  }
  if (typeof data.actionBudget === "number" || typeof data.actionCount === "number") {
    projections["action-budget"] = {
      [data.id]: data.actionBudget ?? data.actionCount,
    };
  }
  return projections as ArtifactProjections;
}

export function buildDefinitionArtifact(source: ArtifactSource): ArtifactNode {
  return createArtifactNode({
    kind: "definition",
    ...nodeInput(source, "normalized-flow-v1"),
    projections: mergeProjections(
      definitionProjections(source.data),
      projectionEnvelope(source.data),
    ),
  });
}
