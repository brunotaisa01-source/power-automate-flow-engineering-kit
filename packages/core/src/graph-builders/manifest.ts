import { createArtifactNode, type ArtifactNode, type ArtifactProjections } from "../artifact-node.js";
import { isRecord, mergeProjections, nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";

function manifestProjections(data: unknown): ArtifactProjections {
  if (!isRecord(data) || !Array.isArray(data.files)) {
    return {};
  }
  const entries = data.files.filter(isRecord);
  const inventory = entries
    .map(({ path }) => path)
    .filter((path): path is string => typeof path === "string");
  const digests = Object.fromEntries(
    entries
      .filter(({ path, sha256 }) => typeof path === "string" && typeof sha256 === "string")
      .map(({ path, sha256 }) => [path as string, sha256]),
  );
  return {
    inventory: { release: inventory },
    digests: { release: digests },
  };
}

export function buildManifestArtifact(source: ArtifactSource): ArtifactNode {
  return createArtifactNode({
    kind: "manifest",
    ...nodeInput(source, "artifact-manifest-v1"),
    projections: mergeProjections(
      manifestProjections(source.data),
      projectionEnvelope(source.data),
    ),
  });
}
