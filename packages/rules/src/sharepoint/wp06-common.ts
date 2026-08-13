import type { Diagnostic } from "@spflow/core/types/diagnostics";
import {
  WP06_ARTIFACT_PROFILE,
  WP06_EVIDENCE_PROFILE,
  canonicalWp06Value,
  parseNormalizedWp06Evidence,
  parseNormalizedWp06SourceProjection,
  wp06ProjectionMatchesEvidence,
  type NormalizedWp06Evidence,
  type Wp06SourceArtifactKind,
  type Wp06EvidenceSection,
} from "@spflow/core/types/wp06-evidence";
import {
  WP06_DERIVED_PROJECTION_PROFILE,
  WP06_FRONTEND_BUNDLE_PROFILE,
  WP06_FRONTEND_SOURCE_IR_PROFILE,
  WP06_POWER_AUTOMATE_SOURCE_IR_PROFILE,
  deriveWp06SourceProjection,
  parseWp06FrontendBundle,
  parseWp06PackageArtifact,
  parseWp06PackageManifest,
} from "@spflow/core/wp06-source-adapters";

import type { ArtifactNodeInput, ValidationContext } from "../registry.ts";

export interface Wp06EvidenceItem<T> {
  readonly artifact: ArtifactNodeInput;
  readonly value: T;
}

export interface Wp06EvidenceSelection<T> {
  readonly applicable: boolean;
  readonly items: readonly Wp06EvidenceItem<T>[];
  readonly missing?: Diagnostic;
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function strings(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

export function booleans(value: unknown): Readonly<Record<string, boolean>> | undefined {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "boolean")
    ? value as Readonly<Record<string, boolean>>
    : undefined;
}

export function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length) return false;
  const leftSorted = [...leftSet].sort(compareText);
  const rightSorted = [...rightSet].sort(compareText);
  return leftSorted.length === rightSorted.length
    && leftSorted.every((item, index) => item === rightSorted[index]);
}

export function hasUniqueStrings(value: readonly string[]): boolean {
  return new Set(value).size === value.length;
}

function bindingDiagnostic(
  ruleId: string,
  artifact: ArtifactNodeInput | undefined,
): Diagnostic {
  return Object.freeze({
    code: ruleId,
    path: artifact === undefined
      ? "<contract>#/verification/requiredRuleIds"
      : `${artifact.relativePath}#/binding`,
    message: "Required WP-06 evidence binding is missing, ambiguous, stale, or does not match the artifact graph.",
  });
}

function validatedEvidence(
  context: ValidationContext,
  evidenceArtifact: ArtifactNodeInput,
  expectedKind: Wp06SourceArtifactKind,
  section: Wp06EvidenceSection,
): {
  readonly contract: ArtifactNodeInput;
  readonly evidence: NormalizedWp06Evidence;
  readonly projection: ArtifactNodeInput;
  readonly source: ArtifactNodeInput;
} | undefined {
  const evidence = parseNormalizedWp06Evidence(evidenceArtifact.data);
  if (
    evidenceArtifact.sourceProfile !== WP06_ARTIFACT_PROFILE
    || evidenceArtifact.kind !== expectedKind
    || evidence === undefined
    || evidence.contractRevision !== context.contract.project.contractRevision
    || evidence.binding.section !== section
    || evidence.binding.sourceArtifactKind !== expectedKind
    || evidence.binding.sourceArtifactPath === evidenceArtifact.relativePath
  ) {
    return undefined;
  }

  const binding = evidence.binding;
  const contractNodes = context.graph.nodes.filter((node) =>
    node.kind === "contract"
    && node.sourceProfile === "project-contract-v1"
    && node.relativePath === binding.contractArtifactPath
  );
  const sourceNodes = context.graph.nodes.filter((node) =>
    node.relativePath === binding.sourceArtifactPath
    && node.kind === expectedKind
    && node.sourceProfile === (
      expectedKind === "frontend"
        ? WP06_FRONTEND_SOURCE_IR_PROFILE
        : WP06_POWER_AUTOMATE_SOURCE_IR_PROFILE
    )
  );
  const projectionNodes = context.graph.nodes.filter((node) =>
    node.relativePath === binding.projectionArtifactPath
    && node.kind === "projection"
    && node.sourceProfile === WP06_DERIVED_PROJECTION_PROFILE
  );
  const contractNode = contractNodes[0];
  const sourceNode = sourceNodes[0];
  const projectionNode = projectionNodes[0];
  if (
    contractNodes.length !== 1
    || contractNode?.digest !== binding.contractArtifactSha256
    || contractNode.byteLength !== binding.contractArtifactBytes
    || sourceNodes.length !== 1
    || sourceNode === undefined
    || sourceNode.id === evidenceArtifact.id
    || sourceNode.digest !== binding.sourceArtifactSha256
    || sourceNode.byteLength !== binding.sourceArtifactBytes
    || projectionNodes.length !== 1
    || projectionNode === undefined
    || projectionNode.digest !== binding.projectionArtifactSha256
    || projectionNode.byteLength !== binding.projectionArtifactBytes
  ) return undefined;

  const projection = parseNormalizedWp06SourceProjection(projectionNode.data);
  const derived = deriveWp06SourceProjection(sourceNode.data);
  if (
    projection === undefined
    || derived === undefined
    || canonicalWp06Value(projection) !== canonicalWp06Value(derived)
    || !wp06ProjectionMatchesEvidence(derived, evidence)
  ) {
    return undefined;
  }

  const relationEdges = context.graph.edges.filter((edge) =>
    edge.from === evidenceArtifact.id
    && (
      edge.relation === "derives-from"
      || edge.relation === "verifies-contract"
      || edge.relation === "matches-projection"
    )
  );
  const sourceEdges = relationEdges.filter((edge) =>
    edge.to === sourceNode.id && edge.relation === "derives-from"
  );
  const contractEdges = relationEdges.filter((edge) =>
    edge.to === contractNode.id && edge.relation === "verifies-contract"
  );
  const projectionEdges = relationEdges.filter((edge) =>
    edge.to === projectionNode.id && edge.relation === "matches-projection"
  );
  const sourceProjectionEdges = context.graph.edges.filter((edge) =>
    edge.from === projectionNode.id
    && edge.to === sourceNode.id
    && edge.relation === "derives-from"
  );
  return relationEdges.length === 3
      && sourceEdges.length === 1
      && contractEdges.length === 1
      && projectionEdges.length === 1
      && sourceProjectionEdges.length === 1
    ? { contract: contractNode, evidence, projection: projectionNode, source: sourceNode }
    : undefined;
}

type FinalArtifactKind = "frontend-bundle" | "generated-definition" | "zip";

export const WP06_FINAL_ARTIFACT_REQUIREMENTS: Readonly<
  Record<string, readonly FinalArtifactKind[]>
> = {
  "APP-PAGINATION-001": ["frontend-bundle"],
  "APP-SAVE-001": ["frontend-bundle"],
  "HTTP-SEMANTIC-001": ["generated-definition"],
  "HTTP-SEMANTIC-002": ["generated-definition"],
  "SP-ACL-001": ["generated-definition"],
  "SP-AUTHZ-001": ["generated-definition", "zip"],
  "SP-AUTHZ-002": ["generated-definition", "zip"],
  "SP-INDEX-001": ["generated-definition", "zip"],
  "SP-INDEX-002": ["generated-definition", "zip"],
  "SP-ODATA-001": ["frontend-bundle"],
  "SP-SCHEMA-001": ["generated-definition"],
  "SP-SCHEMA-002": ["generated-definition"],
  "SP-SCHEMA-003": ["generated-definition"],
};

function hasEdge(
  context: ValidationContext,
  from: ArtifactNodeInput,
  to: ArtifactNodeInput,
  relation: string,
): boolean {
  return context.graph.edges.some((edge) =>
    edge.from === from.id && edge.to === to.id && edge.relation === relation
  );
}

function definitionShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const properties = isRecord(value.properties) ? value.properties : value;
  const definition = isRecord(properties.definition) ? properties.definition : properties;
  return isRecord(definition.triggers)
    && Object.keys(definition.triggers).length > 0
    && isRecord(definition.actions)
    && Object.keys(definition.actions).length > 0;
}

function packageContentMatches(
  context: ValidationContext,
  node: ArtifactNodeInput,
  packageId: string,
  packageFlowIds: readonly string[],
  definitionPaths: readonly string[],
): boolean {
  const projection = parseWp06PackageArtifact(node.data);
  if (projection !== undefined) {
    return projection.packageId === packageId
      && sameStringSet(projection.flowIds, packageFlowIds)
      && definitionPaths.every((path) => projection.inventory.includes(path));
  }

  const inspected = (context.adapterEvidence?.packages ?? []).filter((item) =>
    item.packageId === packageId
    && item.relativePath === node.relativePath
    && item.bytes === node.byteLength
    && item.sha256 === node.digest
    && item.inspection?.profile === "power-platform-solution-v1"
    && item.inspection.valid
  );
  const inspection = inspected[0]?.inspection;
  return inspected.length === 1
    && inspection !== undefined
    && sameStringSet(inspection.flows.map(({ id }) => id), packageFlowIds)
    && inspection.inventory.length > 0
    && sameStringSet(inspection.inventory, inspection.expectedInventory);
}

function manifestMatchesZip(
  node: ArtifactNodeInput,
  packageId: string,
  zip: ArtifactNodeInput,
): boolean {
  if (
    node.byteLength === undefined
    || node.byteLength < 1
    || !["package-manifest-v1", "artifact-manifest-v1"].includes(node.sourceProfile)
  ) return false;
  const manifest = parseWp06PackageManifest(node.data);
  return manifest !== undefined
    && (manifest.packageId === undefined || manifest.packageId === packageId)
    && manifest.artifacts.some((artifact) =>
      artifact.path === zip.relativePath
      && artifact.sha256 === zip.digest
      && artifact.bytes === zip.byteLength
    );
}

function requiredFinalArtifactsPresent(
  context: ValidationContext,
  ruleId: string,
  contractNode: ArtifactNodeInput,
  sourceNode: ArtifactNodeInput,
): boolean {
  const requirements = WP06_FINAL_ARTIFACT_REQUIREMENTS[ruleId] ?? [];
  if (requirements.length === 0) return true;

  const bundles = context.graph.nodes.filter((node) => {
    if (
      node.kind !== "frontend"
      || node.sourceProfile !== WP06_FRONTEND_BUNDLE_PROFILE
      || node.byteLength === undefined
      || node.byteLength < 1
      || !hasEdge(context, sourceNode, node, "generates")
      || !hasEdge(context, contractNode, node, "declares")
    ) return false;
    const bundle = parseWp06FrontendBundle(node.data);
    return bundle !== undefined
      && bundle.contractRevision === context.contract.project.contractRevision
      && node.relativePath.startsWith(`${context.contract.frontend.root}/`)
      && bundle.sources.some((binding) =>
        binding.path === sourceNode.relativePath
        && binding.sha256 === sourceNode.digest
        && binding.bytes === sourceNode.byteLength
      );
  });

  const declaredDefinitionPaths = new Set(context.contract.flows.map(({ definitionPath }) => definitionPath));
  const definitions = context.graph.nodes.filter((node) =>
    node.kind === "definition"
    && node.sourceProfile === "normalized-flow-v1"
    && node.byteLength !== undefined
    && node.byteLength > 0
    && declaredDefinitionPaths.has(node.relativePath)
    && definitionShape(node.data)
    && hasEdge(context, sourceNode, node, "generates")
    && hasEdge(context, contractNode, node, "declares")
  );

  const zips = context.graph.nodes.filter((node) => {
    const packageContract = context.contract.packages.find(({ path }) => path === node.relativePath);
    if (
      node.kind !== "zip"
      || node.sourceProfile !== "package-bytes-v1"
      || node.byteLength === undefined
      || node.byteLength < 1
      || packageContract === undefined
      || !hasEdge(context, contractNode, node, "declares")
    ) return false;
    const packageFlows = context.contract.flows.filter(({ id, packageId }) =>
      packageContract.flowIds.includes(id) && packageId === packageContract.id
    );
    const definitionPaths = packageFlows.map(({ definitionPath }) => definitionPath);
    if (
      !sameStringSet(packageFlows.map(({ id }) => id), packageContract.flowIds)
      || !packageContentMatches(
        context,
        node,
        packageContract.id,
        packageContract.flowIds,
        definitionPaths,
      )
    ) return false;
    const packagedDefinitions = definitions.filter((definition) =>
      hasEdge(context, definition, node, "packages")
      && context.contract.flows.some((flow) =>
        flow.definitionPath === definition.relativePath && packageContract.flowIds.includes(flow.id)
      )
    );
    const manifest = context.graph.nodes.find((candidate) =>
      candidate.kind === "manifest"
      && candidate.relativePath === packageContract.manifestPath
      && hasEdge(context, candidate, node, "hashes")
      && manifestMatchesZip(candidate, packageContract.id, node)
    );
    return packagedDefinitions.length > 0 && manifest !== undefined;
  });

  return requirements.every((requirement) =>
    requirement === "frontend-bundle"
      ? bundles.length > 0
      : requirement === "generated-definition"
      ? definitions.length > 0
      : zips.length > 0
  );
}

function finalArtifactDiagnostic(ruleId: string, artifact: ArtifactNodeInput): Diagnostic {
  return Object.freeze({
    code: ruleId,
    path: `${artifact.relativePath}#/finalArtifact`,
    message: "Required final artifact is missing or is not connected to the bound source and contract.",
  });
}

export function evidenceItems<T>(
  context: ValidationContext,
  ruleId: string,
  section: Wp06EvidenceSection,
  expectedKind: Wp06SourceArtifactKind,
): Wp06EvidenceSelection<T> {
  if (!context.contract.verification.requiredRuleIds.includes(ruleId)) {
    return { applicable: false, items: [] };
  }

  const candidates = context.graph.nodes
    .filter((node) => isRecord(node.data)
      && (
        node.sourceProfile === WP06_ARTIFACT_PROFILE
        || node.data.evidenceProfile === WP06_EVIDENCE_PROFILE
      )
      && (
        node.data[section] !== undefined
        || (isRecord(node.data.binding) && node.data.binding.section === section)
      ))
    .sort((left, right) =>
      compareText(left.relativePath, right.relativePath) || compareText(left.id, right.id)
    );
  const artifact = candidates[0];
  const validated = artifact === undefined
    ? undefined
    : validatedEvidence(context, artifact, expectedKind, section);
  if (
    candidates.length !== 1
    || artifact === undefined
    || validated === undefined
  ) {
    return {
      applicable: true,
      items: [],
      missing: bindingDiagnostic(ruleId, artifact),
    };
  }

  if (!requiredFinalArtifactsPresent(
    context,
    ruleId,
    validated.contract,
    validated.source,
  )) {
    return {
      applicable: true,
      items: [],
      missing: finalArtifactDiagnostic(ruleId, artifact),
    };
  }

  const values = validated.evidence[section];
  const items = Array.isArray(values)
    ? values.map((value) => ({ artifact, value: value as T }))
    : [];

  return items.length > 0
    ? { applicable: true, items }
    : {
      applicable: true,
      items: [],
      missing: bindingDiagnostic(ruleId, artifact),
    };
}

export function wp06Diagnostic(
  ruleId: string,
  artifact: ArtifactNodeInput,
  pointer: string,
  message: string,
): Diagnostic {
  return Object.freeze({
    code: ruleId,
    path: `${artifact.relativePath}#${pointer}`,
    message,
  });
}
