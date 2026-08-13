import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { PackageContract } from "@spflow/core/types/flow";
import { ArtifactGraph, buildArtifactGraph } from "@spflow/core/artifact-graph";
import {
  createArtifactEdge,
  createArtifactNode,
  type ArtifactEdge,
  type ArtifactNode,
} from "@spflow/core/artifact-node";
import type { ProjectContract } from "@spflow/core/types/project-contract";
import type {
  DefinitionRuleEvidence,
  FlowRuleEvidence,
  PackageInspection,
  PackageRuleEvidence,
  RuleAdapterEvidence,
} from "@spflow/core/types/rule-input";
import {
  WP06_EVIDENCE_PROFILE,
  WP06_SOURCE_PROJECTION_PROFILE,
  WP06_TRUSTED_ARTIFACT_PROFILE,
  WP06_TRUSTED_PROJECTION_PROFILE,
  canonicalWp06Value,
  parseNormalizedWp06Evidence,
  parseNormalizedWp06SourceProjection,
} from "@spflow/core/types/wp06-evidence";

import { ArchiveSafetyError } from "./archive-reader.ts";
import { normalizeFlow } from "./flow-normalizer.ts";
import { inspectFrontendInventory } from "./frontend-inventory.ts";
import { deriveDefinitionWp06, deriveFrontendWp06 } from "./wp06-derivation.ts";

export type {
  FlowRuleEvidence,
  PackageRuleEvidence,
  RuleAdapterEvidence,
} from "@spflow/core/types/rule-input";

export type PackageBytesInspector = (
  bytes: Uint8Array,
) => Promise<PackageInspection>;

export interface TrustedProjectArtifacts {
  readonly graph: ArtifactGraph;
  readonly adapterEvidence: RuleAdapterEvidence;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function trustedNodeBytes(data: unknown): Uint8Array {
  return Buffer.from(`${canonicalWp06Value(data)}\n`, "utf8");
}

function trustedEdgeKey(edge: ArtifactEdge): string {
  return `${edge.from}\0${edge.to}\0${edge.relation}`;
}

function attachTrustedWp06Evidence(
  graph: Pick<ArtifactGraph, "toJSON">,
  contract: ProjectContract,
  adapterEvidence: RuleAdapterEvidence,
): ArtifactGraph {
  const repositoryGraph = graph.toJSON();
  const nodes = new Map(repositoryGraph.nodes.map((node) => [node.id, node]));
  const edges = new Map(repositoryGraph.edges.map((edge) => [trustedEdgeKey(edge), edge]));
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
      bytes: trustedNodeBytes(projectionData),
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
      bytes: trustedNodeBytes(evidenceData),
    });

    const additions: readonly ArtifactNode[] = [projection, evidence];
    additions.forEach((node) => nodes.set(node.id, node));
    const relations: readonly ArtifactEdge[] = [
      createArtifactEdge({ from: projection.id, to: source.id, relation: "derives-from" }),
      createArtifactEdge({ from: evidence.id, to: source.id, relation: "derives-from" }),
      createArtifactEdge({ from: evidence.id, to: projection.id, relation: "matches-projection" }),
      createArtifactEdge({ from: evidence.id, to: contractNode.id, relation: "verifies-contract" }),
    ];
    relations.forEach((edge) => edges.set(trustedEdgeKey(edge), edge));
  }
  return new ArtifactGraph([...nodes.values()], [...edges.values()]);
}

function normalizeContractPath(path: string): string {
  if (
    path.length === 0
    || isAbsolute(path)
    || /^[A-Za-z]:/.test(path)
    || /^[\\/]/.test(path)
    || /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new TypeError("Contract package path must be repository-relative.");
  }
  const segments = path.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new TypeError("Contract package path must be normalized.");
  }
  return segments.join("/");
}

function pathIsWithinRoot(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot === ""
    || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== ".." && !isAbsolute(fromRoot));
}

function isMissing(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function normalizedFlowSha256(flow: FlowRuleEvidence["flow"]): string {
  const serialized = JSON.stringify({
    id: flow.id,
    trigger: flow.trigger,
    actions: [...flow.actions.entries()],
    connectionReferences: [...flow.connectionReferences].sort(compareText),
    actionCount: flow.actionCount,
    declaredDestructive: flow.declaredDestructive,
  });
  return createHash("sha256").update(serialized).digest("hex");
}

async function inspectDefinition(
  repositoryRoot: string,
  contract: ProjectContract["flows"][number],
): Promise<DefinitionRuleEvidence> {
  const relativePath = normalizeContractPath(contract.definitionPath);
  const target = resolve(repositoryRoot, ...relativePath.split("/"));
  let bytes: Buffer;
  try {
    const resolvedTarget = await realpath(target);
    if (!pathIsWithinRoot(repositoryRoot, resolvedTarget)) {
      return Object.freeze({ flowId: contract.id, relativePath, contract, failure: "invalid" });
    }
    bytes = await readFile(resolvedTarget);
  } catch (error) {
    return Object.freeze({
      flowId: contract.id,
      relativePath,
      contract,
      failure: isMissing(error) ? "missing" : "invalid",
    });
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    const raw = JSON.parse(bytes.toString("utf8")) as unknown;
    const flow = normalizeFlow(raw, { id: contract.id });
    return Object.freeze({
      flowId: contract.id,
      relativePath,
      contract,
      bytes: bytes.byteLength,
      sha256,
      normalizedSha256: normalizedFlowSha256(flow),
      flow,
    });
  } catch {
    return Object.freeze({
      flowId: contract.id,
      relativePath,
      contract,
      bytes: bytes.byteLength,
      sha256,
      failure: "invalid",
    });
  }
}

async function inspectPackage(
  repositoryRoot: string,
  contract: PackageContract,
  inspectSolutionBytes: PackageBytesInspector,
): Promise<PackageRuleEvidence> {
  const relativePath = normalizeContractPath(contract.path);
  const target = resolve(repositoryRoot, ...relativePath.split("/"));
  let resolvedTarget: string;
  let bytes: Buffer;
  try {
    resolvedTarget = await realpath(target);
    if (!pathIsWithinRoot(repositoryRoot, resolvedTarget)) {
      return Object.freeze({
        packageId: contract.id,
        relativePath,
        contract,
        failure: "invalid",
      });
    }
    bytes = await readFile(resolvedTarget);
  } catch (error) {
    if (isMissing(error)) {
      return Object.freeze({
        packageId: contract.id,
        relativePath,
        contract,
        failure: "missing",
      });
    }
    return Object.freeze({
      packageId: contract.id,
      relativePath,
      contract,
      failure: "invalid",
    });
  }

  const digest = createHash("sha256").update(bytes).digest("hex");
  try {
    const inspection = await inspectSolutionBytes(bytes);
    return Object.freeze({
      packageId: contract.id,
      relativePath,
      contract,
      bytes: bytes.byteLength,
      sha256: digest,
      inspection,
    });
  } catch (error) {
    if (error instanceof ArchiveSafetyError) {
      return Object.freeze({
        packageId: contract.id,
        relativePath,
        contract,
        bytes: bytes.byteLength,
        sha256: digest,
        failure: "unsafe",
        archiveReason: error.reason,
      });
    }
    return Object.freeze({
      packageId: contract.id,
      relativePath,
      contract,
      bytes: bytes.byteLength,
      sha256: digest,
      failure: "invalid",
    });
  }
}

export function createProjectRuleEvidenceInspector(
  inspectSolutionBytes: PackageBytesInspector,
): (root: string, contract: ProjectContract) => Promise<RuleAdapterEvidence> {
  return async (root, contract) => {
    const repositoryRoot = await realpath(resolve(root));
    const definitions: DefinitionRuleEvidence[] = [];
    for (const flow of [...contract.flows].sort((left, right) =>
      compareText(left.definitionPath, right.definitionPath) || compareText(left.id, right.id)
    )) {
      definitions.push(await inspectDefinition(repositoryRoot, flow));
    }
    const frontendContract = (contract as Partial<ProjectContract>).frontend;
    const frontendBundles = frontendContract === undefined
      ? []
      : [await inspectFrontendInventory(
          repositoryRoot,
          frontendContract.root,
          contract.project.contractRevision,
        )];
    const wp06Derivations = definitions.flatMap((definition) =>
      deriveDefinitionWp06(contract, definition)
    );
    const frontendBundle = frontendBundles[0];
    if (frontendBundle?.valid) {
      for (const sourcePath of frontendBundle.sourcePaths) {
        const source = frontendBundle.files.find(({ relativePath }) => relativePath === sourcePath);
        if (source === undefined) continue;
        try {
          const target = await realpath(resolve(repositoryRoot, ...sourcePath.split("/")));
          if (!pathIsWithinRoot(repositoryRoot, target)) continue;
          const bytes = await readFile(target);
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          if (bytes.byteLength !== source.bytes || sha256 !== source.sha256) continue;
          wp06Derivations.push(...deriveFrontendWp06(contract, source, bytes.toString("utf8")));
        } catch {
          // The inventory becomes non-authoritative when a source cannot be read back exactly.
        }
      }
    }
    const packages: PackageRuleEvidence[] = [];
    for (const packageContract of [...contract.packages].sort((left, right) =>
      compareText(left.path, right.path) || compareText(left.id, right.id)
    )) {
      packages.push(await inspectPackage(
        repositoryRoot,
        packageContract,
        inspectSolutionBytes,
      ));
    }

    const flowContracts = new Map(contract.flows.map((flow) => [flow.id, flow]));
    const flows: FlowRuleEvidence[] = [];
    for (const packaged of packages) {
      for (const flow of packaged.inspection?.flows ?? []) {
        const flowContract = flowContracts.get(flow.id);
        if (
          flowContract !== undefined
          && flowContract.packageId === packaged.packageId
          && packaged.contract.flowIds.includes(flow.id)
        ) {
          flows.push(Object.freeze({
            packageId: packaged.packageId,
            packagePath: packaged.relativePath,
            contract: flowContract,
            flow,
            normalizedSha256: normalizedFlowSha256(flow),
          }));
        }
      }
    }
    flows.sort((left, right) =>
      compareText(left.packagePath, right.packagePath)
      || compareText(left.flow.id, right.flow.id)
    );
    return Object.freeze({
      packages: Object.freeze(packages),
      flows: Object.freeze(flows),
      definitions: Object.freeze(definitions),
      frontendBundles: Object.freeze(frontendBundles),
      wp06Derivations: Object.freeze(wp06Derivations),
    });
  };
}

export function createTrustedProjectArtifactsInspector(
  inspectSolutionBytes: PackageBytesInspector,
): (root: string, contract: ProjectContract) => Promise<TrustedProjectArtifacts> {
  const inspectEvidence = createProjectRuleEvidenceInspector(inspectSolutionBytes);
  return async (root, contract) => {
    const [repositoryGraph, adapterEvidence] = await Promise.all([
      buildArtifactGraph(root, contract),
      inspectEvidence(root, contract),
    ]);
    return Object.freeze({
      graph: attachTrustedWp06Evidence(repositoryGraph, contract, adapterEvidence),
      adapterEvidence,
    });
  };
}
