import { createArtifactNode, type ArtifactNode, type ArtifactProjections } from "../artifact-node.js";
import type { SharePointContract } from "../types/sharepoint.js";
import { mergeProjections, nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";

export function schemaProjections(schema: SharePointContract): ArtifactProjections {
  return {
    fields: Object.fromEntries(schema.lists.map(({ id, fields }) => [id, fields])),
    indexes: Object.fromEntries(schema.lists.map(({ id, indexes }) => [id, indexes])),
  };
}

export function buildSchemaArtifact(source: ArtifactSource): ArtifactNode {
  const derived = source.data as SharePointContract;
  return createArtifactNode({
    kind: "schema",
    ...nodeInput(source, "sharepoint-schema-v1"),
    projections: mergeProjections(
      Array.isArray(derived?.lists) ? schemaProjections(derived) : {},
      projectionEnvelope(source.data),
    ),
  });
}
