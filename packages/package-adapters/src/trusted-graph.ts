import { ArtifactGraph } from "@spflow/core/artifact-graph";
import {
  createArtifactEdge,
  createArtifactNode,
  type ArtifactEdge,
  type ArtifactNode,
} from "@spflow/core/artifact-node";
import type { ProjectContract } from "@spflow/core/types/project-contract";
import type { RuleAdapterEvidence } from "@spflow/core/types/rule-input";
import {
  WP06_EVIDENCE_PROFILE,
  WP06_SOURCE_PROJECTION_PROFILE,
  WP06_TRUSTED_ARTIFACT_PROFILE,
  WP06_TRUSTED_PROJECTION_PROFILE,
  canonicalWp06Value,
  parseNormalizedWp06Evidence,
  parseNormalizedWp06SourceProjection,
} from "@spflow/core/types/wp06-evidence";

function nodeBytes(data: unknown): Uint8Array {
  return Buffer.from(`${canonicalWp06Value(data)}\n`, "utf8");
}

function edgeKey(edge: ArtifactEdge): string {
  return `${edge.from}\0${edge.to}\0${edge.relation}`;
}

export function attachTrustedWp06Evidence(
  graph: Pick<ArtifactGraph, "toJSON">,
  contract: ProjectContract,
  adapterEvidence: RuleAdapterEvidence,
): ArtifactGraph {
  const repositoryGraph = graph.toJSON();
  const nodes = new Map(repositoryGraph.nodes.map((node) => [node.id, node]));
  const edges = new Map(repositoryGraph.edges.map((edge) => [edgeKey(edge), edge]));
  const contractNodes = repositoryGraph.nodes.filter((node) =>
    node.kind === "contract"
    && node.sourceProfile === "project-contract-v1"
    && node.relativePath === "project.contract.json"
  );
  const contractNode = contractNodes[0];
  if (contractNodes.length !== 1 || contractNode?.byteLength === undefined) {
    return new ArtifactGraph(repositoryGraph.nodes, repositoryGraph.edges);
  }

  const derivationCounts = new Map<string, number>();
  for (const derivation of adapterEvidence.wp06Derivations ?? []) {
    const key = `${derivation.sourceKind}\0${derivation.section}`;
    derivationCounts.set(key, (derivationCounts.get(key) ?? 0) + 1);
  }
  for (const derivation of adapterEvidence.wp06Derivations ?? []) {
    const key = `${derivation.sourceKind}\0${derivation.section}`;
    if (derivationCounts.get(key) !== 1) continue;
    const sources = repositoryGraph.nodes.filter((node) =>
      node.relativePath === derivation.sourceArtifactPath
      && node.digest === derivation.sourceArtifactSha256
      && node.byteLength === derivation.sourceArtifactBytes
      && (
        derivation.sourceKind === "frontend"
          ? node.kind === "frontend" && node.sourceProfile === "frontend-projection-v1"
          : node.kind === "definition" && node.sourceProfile === "normalized-flow-v1"
      )
    );
    const source = sources[0];
    if (
      sources.length !== 1
      || source === undefined
      || derivation.contractRevision !== contract.project.contractRevision
    ) continue;

    const projectionData = {
      sourceProjectionProfile: WP06_SOURCE_PROJECTION_PROFILE,
      projectionRevision: 1,
      contractRevision: derivation.contractRevision,
      sourceKind: derivation.sourceKind,
      section: derivation.section,
      adapter: { id: derivation.adapterId, version: derivation.adapterVersion },
      facts: derivation.facts,
    };
    if (parseNormalizedWp06SourceProjection(projectionData) === undefined) continue;
    const projection = createArtifactNode({
      kind: "projection",
      relativePath: `.spflow-derived/wp06/projections/${derivation.sourceKind}-${derivation.section}-${source.digest}.json`,
      sourceProfile: WP06_TRUSTED_PROJECTION_PROFILE,
      data: projectionData,
      bytes: nodeBytes(projectionData),
    });
    if (projection.byteLength === undefined) continue;

    const evidenceData = {
      evidenceProfile: WP06_EVIDENCE_PROFILE,
      contractRevision: derivation.contractRevision,
      binding: {
        section: derivation.section,
        contractArtifactPath: contractNode.relativePath,
        contractArtifactSha256: contractNode.digest,
        contractArtifactBytes: contractNode.byteLength,
        sourceArtifactPath: source.relativePath,
        sourceArtifactSha256: source.digest,
        sourceArtifactBytes: source.byteLength,
        sourceArtifactKind: derivation.sourceKind,
        projectionArtifactPath: projection.relativePath,
        projectionArtifactSha256: projection.digest,
        projectionArtifactBytes: projection.byteLength,
      },
      [derivation.section]: derivation.facts,
    };
    if (parseNormalizedWp06Evidence(evidenceData) === undefined) continue;
    const evidence = createArtifactNode({
      kind: derivation.sourceKind,
      relativePath: `.spflow-derived/wp06/evidence/${derivation.sourceKind}-${derivation.section}-${source.digest}.json`,
      sourceProfile: WP06_TRUSTED_ARTIFACT_PROFILE,
      data: evidenceData,
      bytes: nodeBytes(evidenceData),
    });

    const additions: readonly ArtifactNode[] = [projection, evidence];
    additions.forEach((node) => nodes.set(node.id, node));
    const relations: readonly ArtifactEdge[] = [
      createArtifactEdge({ from: projection.id, to: source.id, relation: "derives-from" }),
      createArtifactEdge({ from: evidence.id, to: source.id, relation: "derives-from" }),
      createArtifactEdge({ from: evidence.id, to: projection.id, relation: "matches-projection" }),
      createArtifactEdge({ from: evidence.id, to: contractNode.id, relation: "verifies-contract" }),
    ];
    relations.forEach((edge) => edges.set(edgeKey(edge), edge));
  }
  return new ArtifactGraph([...nodes.values()], [...edges.values()]);
}
