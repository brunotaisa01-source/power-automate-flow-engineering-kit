import type { Diagnostic } from "@spflow/core/types/diagnostics";
import {
  WP06_ARTIFACT_PROFILE,
  WP06_EVIDENCE_PROFILE,
  WP06_SOURCE_PROJECTION_PROFILE,
  parseNormalizedWp06Evidence,
  parseNormalizedWp06SourceProjection,
  wp06ProjectionMatchesEvidence,
  type NormalizedWp06Evidence,
  type Wp06SourceArtifactKind,
  type Wp06EvidenceSection,
} from "@spflow/core/types/wp06-evidence";

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
): NormalizedWp06Evidence | undefined {
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
    && node.sourceProfile === WP06_SOURCE_PROJECTION_PROFILE
  );
  const contractNode = contractNodes[0];
  const sourceNode = sourceNodes[0];
  if (
    contractNodes.length !== 1
    || contractNode?.digest !== binding.contractArtifactSha256
    || contractNode.byteLength !== binding.contractArtifactBytes
    || sourceNodes.length !== 1
    || sourceNode === undefined
    || sourceNode.id === evidenceArtifact.id
    || sourceNode.digest !== binding.sourceArtifactSha256
    || sourceNode.byteLength !== binding.sourceArtifactBytes
  ) return undefined;

  const projection = parseNormalizedWp06SourceProjection(sourceNode.data);
  if (projection === undefined || !wp06ProjectionMatchesEvidence(projection, evidence)) {
    return undefined;
  }

  const relationEdges = context.graph.edges.filter((edge) =>
    edge.from === evidenceArtifact.id
    && (edge.relation === "derives-from" || edge.relation === "verifies-contract")
  );
  const sourceEdges = relationEdges.filter((edge) =>
    edge.to === sourceNode.id && edge.relation === "derives-from"
  );
  const contractEdges = relationEdges.filter((edge) =>
    edge.to === contractNode.id && edge.relation === "verifies-contract"
  );
  return relationEdges.length === 2 && sourceEdges.length === 1 && contractEdges.length === 1
    ? evidence
    : undefined;
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
  const evidence = artifact === undefined
    ? undefined
    : validatedEvidence(context, artifact, expectedKind, section);
  if (
    candidates.length !== 1
    || artifact === undefined
    || evidence === undefined
  ) {
    return {
      applicable: true,
      items: [],
      missing: bindingDiagnostic(ruleId, artifact),
    };
  }

  const values = evidence[section];
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
