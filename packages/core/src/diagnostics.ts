import type { ArtifactNode, ProjectionKey } from "./artifact-node.js";
import type { Diagnostic } from "./types/diagnostics.js";

const CONSISTENCY_CODES: Readonly<Record<ProjectionKey, string>> = {
  "save-mode": "META-CONSISTENCY-001",
  states: "META-CONSISTENCY-002",
  indexes: "META-CONSISTENCY-003",
  fields: "META-CONSISTENCY-004",
  "connection-references": "META-CONSISTENCY-005",
  "action-budget": "META-CONSISTENCY-006",
  inventory: "META-CONSISTENCY-007",
  digests: "META-CONSISTENCY-008",
};

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function consistencyDiagnostic(
  key: ProjectionKey,
  scope: string,
  actual: ArtifactNode,
  expected: ArtifactNode,
): Diagnostic {
  return Object.freeze({
    code: CONSISTENCY_CODES[key],
    path: `${actual.relativePath}#/projections/${key}/${pointerSegment(scope)}`,
    message:
      `Projection '${key}' for scope '${scope}' from '${actual.sourceProfile}' `
      + `differs from '${expected.sourceProfile}'.`,
  });
}

export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((left, right) =>
    compareText(left.code, right.code)
    || compareText(left.path, right.path)
    || compareText(left.message, right.message)
  );
}
