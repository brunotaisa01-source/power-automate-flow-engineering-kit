import { createArtifactNode, type ArtifactNode } from "../artifact-node.js";
import { nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";

export function buildBuilderArtifact(source: ArtifactSource): ArtifactNode {
  return createArtifactNode({
    kind: "builder",
    ...nodeInput(source, "builder-source-v1"),
    projections: projectionEnvelope(source.data),
  });
}
