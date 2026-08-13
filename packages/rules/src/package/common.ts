import type { Diagnostic } from "@spflow/core/types/diagnostics";
import type { PackageRuleEvidence } from "@spflow/core/types/rule-input";

import type {
  ArtifactNodeInput,
  ValidationContext,
} from "../registry.ts";

export type UnknownRecord = Record<string, unknown>;

export interface ManifestArtifact {
  readonly node: ArtifactNodeInput;
  readonly data: UnknownRecord;
}

export function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function packageEvidence(context: ValidationContext): PackageRuleEvidence[] {
  const expectedIds = new Set(context.contract.packages.map(({ id }) => id));
  return [...(context.adapterEvidence?.packages ?? [])]
    .filter(({ packageId }) => expectedIds.has(packageId))
    .sort((left, right) =>
      compareText(left.relativePath, right.relativePath)
      || compareText(left.packageId, right.packageId)
    );
}

export function missingPackageEvidenceDiagnostic(
  context: ValidationContext,
  ruleId: string,
  requireInspection = true,
): Diagnostic | undefined {
  const evidence = packageEvidence(context);
  for (const expected of [...context.contract.packages].sort((left, right) =>
    compareText(left.path, right.path) || compareText(left.id, right.id)
  )) {
    const matches = evidence.filter(({ packageId, relativePath }) =>
      packageId === expected.id && relativePath === expected.path
    );
    const match = matches[0];
    if (
      matches.length !== 1
      || match === undefined
      || match.bytes === undefined
      || match.sha256 === undefined
      || (requireInspection && match.inspection === undefined)
      || (!requireInspection && match.inspection === undefined && match.failure !== "unsafe")
    ) {
      return Object.freeze({
        code: ruleId,
        path: `${expected.path}#/inspection`,
        message: "Required final package inspection evidence is missing.",
      });
    }
  }
  return undefined;
}

export function manifestArtifacts(context: ValidationContext): ManifestArtifact[] {
  return context.graph.nodes
    .flatMap((node) =>
      node.kind === "manifest" && isRecord(node.data)
        ? [{ node, data: node.data }]
        : []
    )
    .sort((left, right) =>
      compareText(left.node.relativePath, right.node.relativePath)
      || compareText(left.node.id, right.node.id)
    );
}

export function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }
  return [...value];
}

export function sortedStrings(value: unknown): string[] | undefined {
  return stringArray(value)?.sort(compareText);
}

export function packageDiagnostic(
  ruleId: string,
  relativePath: string,
  pointer: string,
  message: string,
): Diagnostic {
  return Object.freeze({
    code: ruleId,
    path: `${relativePath}#${pointer}`,
    message,
  });
}
