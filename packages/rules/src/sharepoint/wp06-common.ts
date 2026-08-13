import type { Diagnostic } from "@spflow/core/types/diagnostics";
import {
  WP06_ARTIFACT_PROFILE,
  WP06_EVIDENCE_PROFILE,
  WP06_EVIDENCE_SECTIONS,
  type NormalizedWp06Evidence,
  type NormalizedWp06EvidenceBinding,
  type Wp06SourceArtifactKind,
  type Wp06EvidenceSection,
} from "@spflow/core/types/wp06-evidence";

import type { ArtifactNodeInput, ValidationContext } from "../registry.ts";

const SHA256 = /^[0-9a-f]{64}$/;
const BINDING_KEYS = new Set([
  "section",
  "contractArtifactPath",
  "contractArtifactSha256",
  "sourceArtifactPath",
  "sourceArtifactSha256",
  "sourceArtifactBytes",
  "sourceArtifactKind",
]);
const EVIDENCE_KEYS = new Set([
  "evidenceProfile",
  "contractRevision",
  "binding",
  ...WP06_EVIDENCE_SECTIONS,
]);

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

function isBinding(value: unknown): value is NormalizedWp06EvidenceBinding {
  return isRecord(value)
    && Object.keys(value).length === BINDING_KEYS.size
    && Object.keys(value).every((key) => BINDING_KEYS.has(key))
    && typeof value.section === "string"
    && (WP06_EVIDENCE_SECTIONS as readonly string[]).includes(value.section)
    && typeof value.contractArtifactPath === "string"
    && value.contractArtifactPath.length > 0
    && typeof value.contractArtifactSha256 === "string"
    && SHA256.test(value.contractArtifactSha256)
    && typeof value.sourceArtifactPath === "string"
    && value.sourceArtifactPath.length > 0
    && typeof value.sourceArtifactSha256 === "string"
    && SHA256.test(value.sourceArtifactSha256)
    && Number.isSafeInteger(value.sourceArtifactBytes)
    && (value.sourceArtifactBytes as number) > 0
    && (value.sourceArtifactKind === "builder" || value.sourceArtifactKind === "frontend");
}

function isEvidence(value: unknown): value is NormalizedWp06Evidence {
  if (
    !isRecord(value)
    || value.evidenceProfile !== WP06_EVIDENCE_PROFILE
    || !Number.isSafeInteger(value.contractRevision)
    || !isBinding(value.binding)
    || Object.keys(value).some((key) => !EVIDENCE_KEYS.has(key))
  ) {
    return false;
  }
  const sections = WP06_EVIDENCE_SECTIONS.filter((section) => value[section] !== undefined);
  return sections.length === 1
    && sections[0] === value.binding.section
    && Array.isArray(value[sections[0]])
    && (value[sections[0]] as readonly unknown[]).length > 0;
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

function validatesBinding(
  context: ValidationContext,
  evidenceArtifact: ArtifactNodeInput,
  expectedKind: Wp06SourceArtifactKind,
  section: Wp06EvidenceSection,
): evidenceArtifact is ArtifactNodeInput & { readonly data: NormalizedWp06Evidence } {
  if (
    evidenceArtifact.sourceProfile !== WP06_ARTIFACT_PROFILE
    || evidenceArtifact.kind !== expectedKind
    || !isEvidence(evidenceArtifact.data)
    || evidenceArtifact.data.contractRevision !== context.contract.project.contractRevision
    || evidenceArtifact.data.binding.section !== section
    || evidenceArtifact.data.binding.sourceArtifactKind !== expectedKind
    || evidenceArtifact.data.binding.sourceArtifactPath === evidenceArtifact.relativePath
  ) {
    return false;
  }

  const binding = evidenceArtifact.data.binding;
  const contractNodes = context.graph.nodes.filter((node) =>
    node.kind === "contract"
    && node.sourceProfile === "project-contract-v1"
    && node.relativePath === binding.contractArtifactPath
  );
  const sourceNodes = context.graph.nodes.filter((node) =>
    node.relativePath === binding.sourceArtifactPath
  );
  const contractNode = contractNodes[0];
  const sourceNode = sourceNodes[0];
  return contractNodes.length === 1
    && contractNode?.digest === binding.contractArtifactSha256
    && sourceNodes.length === 1
    && sourceNode !== undefined
    && sourceNode.id !== evidenceArtifact.id
    && sourceNode.kind === expectedKind
    && sourceNode.sourceProfile !== WP06_ARTIFACT_PROFILE
    && sourceNode.digest === binding.sourceArtifactSha256
    && sourceNode.byteLength === binding.sourceArtifactBytes;
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
  if (
    candidates.length !== 1
    || artifact === undefined
    || !validatesBinding(context, artifact, expectedKind, section)
  ) {
    return {
      applicable: true,
      items: [],
      missing: bindingDiagnostic(ruleId, artifact),
    };
  }

  const values = artifact.data[section];
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
