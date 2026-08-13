import type { Diagnostic } from "@spflow/core/types/diagnostics";
import type { ProjectContract } from "@spflow/core/types/project-contract";
import type { RuleAdapterEvidence } from "@spflow/core/types/rule-input";

import { appPagination001 } from "./application/pagination.ts";
import { appSave001 } from "./application/save.ts";
import { httpSemantic001, httpSemantic002 } from "./http/semantic.ts";
import { pkgArchive001 } from "./package/archive-safety.ts";
import { pkgIntegrity001 } from "./package/integrity.ts";
import { pkgNative001 } from "./package/native-envelope.ts";
import { paLimit001 } from "./power-automate/action-limit.ts";
import { paConnection001 } from "./power-automate/connection-reference.ts";
import { paConnector001 } from "./power-automate/connector-shape.ts";
import { flowDestructive001 } from "./power-automate/destructive.ts";
import { paExpression001 } from "./power-automate/expression-safety.ts";
import { paGraph002 } from "./power-automate/graph-cycle.ts";
import { paGraph001 } from "./power-automate/graph-reachability.ts";
import { flowIdempotency001 } from "./power-automate/idempotency.ts";
import { flowRetry001 } from "./power-automate/retry.ts";
import { paScope001 } from "./power-automate/scope.ts";
import { flowStatus001 } from "./power-automate/status.ts";
import { paWdl001 } from "./power-automate/wdl.ts";
import { spAcl001, spAcl002 } from "./sharepoint/acl.ts";
import { spAuthz001, spAuthz002 } from "./sharepoint/authorization.ts";
import { spIndex001, spIndex002 } from "./sharepoint/indexes.ts";
import { spOdata001 } from "./sharepoint/odata.ts";
import { spSchema001, spSchema002, spSchema003 } from "./sharepoint/schema.ts";

export interface ArtifactNodeInput {
  readonly id: string;
  readonly kind: string;
  readonly relativePath: string;
  readonly digest: string;
  readonly byteLength?: number;
  readonly sourceProfile: string;
  readonly data: unknown;
  readonly projections: Readonly<Record<string, unknown>>;
}

export interface ArtifactEdgeInput {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
}

export interface ArtifactGraphInput {
  readonly nodes: readonly ArtifactNodeInput[];
  readonly edges: readonly ArtifactEdgeInput[];
}

export interface ValidationContext {
  readonly root: string;
  readonly offline: boolean;
  readonly contract: ProjectContract;
  readonly graph: ArtifactGraphInput;
  readonly adapterEvidence: RuleAdapterEvidence;
}

export interface RuleDetector {
  readonly id: string;
  validate(context: ValidationContext): Promise<Diagnostic[]>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return compareText(left.code, right.code)
    || compareText(left.path, right.path)
    || compareText(left.message, right.message);
}

const detectors: readonly RuleDetector[] = [
  appPagination001,
  appSave001,
  flowDestructive001,
  flowIdempotency001,
  flowRetry001,
  flowStatus001,
  httpSemantic001,
  httpSemantic002,
  paConnection001,
  paConnector001,
  paExpression001,
  paGraph001,
  paGraph002,
  paLimit001,
  paScope001,
  paWdl001,
  pkgArchive001,
  pkgIntegrity001,
  pkgNative001,
  spAcl001,
  spAcl002,
  spAuthz001,
  spAuthz002,
  spIndex001,
  spIndex002,
  spOdata001,
  spSchema001,
  spSchema002,
  spSchema003,
].sort((left, right) => compareText(left.id, right.id));

export const ruleRegistry: ReadonlyMap<string, RuleDetector> = new Map(
  detectors.map((detector) => [detector.id, detector]),
);

export function getRuleDetector(ruleId: string): RuleDetector | undefined {
  return ruleRegistry.get(ruleId);
}

export async function validateRules(
  context: ValidationContext,
  ruleIds: readonly string[] = [...ruleRegistry.keys()],
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  for (const ruleId of [...new Set(ruleIds)].sort(compareText)) {
    const detector = ruleRegistry.get(ruleId);
    if (detector !== undefined) {
      diagnostics.push(...await detector.validate(context));
    }
  }
  return diagnostics.sort(compareDiagnostics);
}
