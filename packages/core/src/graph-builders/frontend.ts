import { createArtifactNode, type ArtifactNode, type ArtifactProjections } from "../artifact-node.js";
import type { FrontendContract } from "../types/project-contract.js";
import { isRecord, mergeProjections, nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";

export function frontendProjections(frontend: FrontendContract): ArtifactProjections {
  return {
    "save-mode": {
      frontend: frontend.directPatch.enabled ? "direct-patch" : frontend.protectedWriteModel,
    },
  };
}

export function buildFrontendArtifact(source: ArtifactSource): ArtifactNode {
  const derived = isRecord(source.data)
    && isRecord(source.data.directPatch)
    && typeof source.data.directPatch.enabled === "boolean"
    && typeof source.data.protectedWriteModel === "string"
      ? frontendProjections(source.data as unknown as FrontendContract)
      : {};
  return createArtifactNode({
    kind: "frontend",
    ...nodeInput(source, "frontend-projection-v1"),
    projections: mergeProjections(derived, projectionEnvelope(source.data)),
  });
}
