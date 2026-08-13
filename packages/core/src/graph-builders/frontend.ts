import { createArtifactNode, type ArtifactNode, type ArtifactProjections } from "../artifact-node.js";
import type { FrontendContract } from "../types/project-contract.js";
import { isRecord, mergeProjections, nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";
import { normalizeWp06ArtifactSource } from "./wp06-evidence.js";

export function frontendProjections(frontend: FrontendContract): ArtifactProjections {
  return {
    "save-mode": {
      frontend: frontend.directPatch.enabled ? "direct-patch" : frontend.protectedWriteModel,
    },
  };
}

export function buildFrontendArtifact(source: ArtifactSource): ArtifactNode {
  const normalized = normalizeWp06ArtifactSource(source);
  const derived = isRecord(normalized.data)
    && isRecord(normalized.data.directPatch)
    && typeof normalized.data.directPatch.enabled === "boolean"
    && typeof normalized.data.protectedWriteModel === "string"
      ? frontendProjections(normalized.data as unknown as FrontendContract)
      : {};
  return createArtifactNode({
    kind: "frontend",
    ...nodeInput(normalized, "frontend-projection-v1"),
    projections: mergeProjections(derived, projectionEnvelope(normalized.data)),
  });
}
