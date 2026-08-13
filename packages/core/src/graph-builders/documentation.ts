import { createArtifactNode, type ArtifactNode } from "../artifact-node.js";
import { nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";

export function buildDocumentationArtifact(source: ArtifactSource): ArtifactNode {
  return createArtifactNode({
    kind: "documentation",
    ...nodeInput(source, "documentation-v1"),
    projections: projectionEnvelope(source.data),
  });
}
