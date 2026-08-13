import { createArtifactNode, type ArtifactNode, type ArtifactProjections } from "../artifact-node.js";
import { isRecord, mergeProjections, nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";

function evidenceProjections(data: unknown): ArtifactProjections {
  if (!isRecord(data) || !Array.isArray(data.artifacts)) {
    return {};
  }
  const artifacts = data.artifacts.filter(isRecord);
  const paths = artifacts
    .map(({ path }) => path)
    .filter((path): path is string => typeof path === "string");
  const digests = Object.fromEntries(
    artifacts
      .filter(({ path, sha256 }) => typeof path === "string" && typeof sha256 === "string")
      .map(({ path, sha256 }) => [path as string, sha256]),
  );
  return {
    inventory: { release: paths },
    digests: { release: digests },
  };
}

export function buildEvidenceArtifact(source: ArtifactSource): ArtifactNode {
  return createArtifactNode({
    kind: "evidence",
    ...nodeInput(source, "evidence-record-v1"),
    projections: mergeProjections(
      evidenceProjections(source.data),
      projectionEnvelope(source.data),
    ),
  });
}
