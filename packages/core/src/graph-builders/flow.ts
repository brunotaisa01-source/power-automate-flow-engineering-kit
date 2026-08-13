import { createArtifactNode, type ArtifactNode, type ArtifactProjections } from "../artifact-node.js";
import type { FlowContract } from "../types/flow.js";
import { isRecord, mergeProjections, nodeInput, projectionEnvelope, type ArtifactSource } from "./common.js";

export function flowProjections(flow: FlowContract): ArtifactProjections {
  return {
    "connection-references": { [flow.id]: flow.connectionReferences },
    "action-budget": { [flow.id]: flow.actionBudget },
  };
}

export function buildFlowArtifact(source: ArtifactSource): ArtifactNode {
  const data = source.data;
  const derived = isRecord(data)
    && typeof data.id === "string"
    && Array.isArray(data.connectionReferences)
    && typeof data.actionBudget === "number"
      ? flowProjections(data as unknown as FlowContract)
      : {};
  return createArtifactNode({
    kind: "contract",
    ...nodeInput(source, "flow-contract-v1"),
    projections: mergeProjections(derived, projectionEnvelope(data)),
  });
}
