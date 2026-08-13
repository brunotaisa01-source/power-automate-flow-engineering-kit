import type { Diagnostic } from "@spflow/core/types/diagnostics";
import type {
  NormalizedWp06Evidence,
  Wp06EvidenceSection,
} from "@spflow/core/types/wp06-evidence";

import type { ArtifactNodeInput, ValidationContext } from "../registry.ts";

const WP06_EVIDENCE_PROFILE = "wp06-offline-v1";
const WP06_ARTIFACT_PROFILE = "wp06-evidence-v1";

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
  const leftSorted = [...new Set(left)].sort(compareText);
  const rightSorted = [...new Set(right)].sort(compareText);
  return leftSorted.length === rightSorted.length
    && leftSorted.every((item, index) => item === rightSorted[index]);
}

function isEvidence(value: unknown): value is NormalizedWp06Evidence {
  return isRecord(value)
    && value.evidenceProfile === WP06_EVIDENCE_PROFILE
    && Number.isSafeInteger(value.contractRevision);
}

export function evidenceItems<T>(
  context: ValidationContext,
  ruleId: string,
  section: Wp06EvidenceSection,
): Wp06EvidenceSelection<T> {
  if (!context.contract.verification.requiredRuleIds.includes(ruleId)) {
    return { applicable: false, items: [] };
  }

  const artifacts = context.graph.nodes
    .filter((node) =>
      node.sourceProfile === WP06_ARTIFACT_PROFILE
      && isEvidence(node.data)
      && node.data.contractRevision === context.contract.project.contractRevision
    )
    .sort((left, right) =>
      compareText(left.relativePath, right.relativePath) || compareText(left.id, right.id)
    );
  const items = artifacts.flatMap((artifact) => {
    const evidence = artifact.data as NormalizedWp06Evidence;
    const values = evidence[section];
    return Array.isArray(values)
      ? values.map((value) => ({ artifact, value: value as T }))
      : [];
  });

  return items.length > 0
    ? { applicable: true, items }
    : {
      applicable: true,
      items: [],
      missing: Object.freeze({
        code: ruleId,
        path: `<contract>#/verification/requiredRuleIds`,
        message: "Required normalized WP-06 evidence is missing or contract-stale.",
      }),
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
