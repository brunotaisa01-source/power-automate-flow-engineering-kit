import { createArtifactNode, type ArtifactNode, type ArtifactProjections } from "../artifact-node.js";
import { isRecord, mergeProjections, nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";

function zipProjections(data: unknown): ArtifactProjections {
  if (!isRecord(data) || typeof data.packageId !== "string") {
    return {};
  }
  const inventory: Record<string, unknown> = {};
  if (Array.isArray(data.flowIds)) {
    inventory[`package:${data.packageId}:flows`] = data.flowIds;
  }
  if (Array.isArray(data.inventory)) {
    inventory[`package:${data.packageId}:entries`] = data.inventory;
  }
  return Object.keys(inventory).length === 0 ? {} : { inventory };
}

export function buildZipArtifact(source: ArtifactSource): ArtifactNode {
  return createArtifactNode({
    kind: "zip",
    ...nodeInput(source, "package-bytes-v1"),
    projections: mergeProjections(zipProjections(source.data), projectionEnvelope(source.data)),
  });
}
