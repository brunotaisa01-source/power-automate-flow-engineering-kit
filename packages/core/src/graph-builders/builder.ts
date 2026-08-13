import { createArtifactNode, type ArtifactNode } from "../artifact-node.js";
import { nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";
import { normalizeWp06ArtifactSource } from "./wp06-evidence.js";

export function buildBuilderArtifact(source: ArtifactSource): ArtifactNode {
  const normalized = normalizeWp06ArtifactSource(source);
  return createArtifactNode({
    kind: "builder",
    ...nodeInput(normalized, "builder-source-v1"),
    projections: projectionEnvelope(normalized.data),
  });
}
