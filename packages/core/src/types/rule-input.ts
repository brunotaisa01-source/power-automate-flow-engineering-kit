import type { Diagnostic } from "./diagnostics.js";
import type { FlowContract, PackageContract } from "./flow.js";

export interface NormalizedReadbackAssertion {
  readonly actionId: string;
  readonly field: string;
  readonly operator: "equals" | "not-equals" | "exists";
  readonly expected: unknown;
}

export type NormalizedExpressionNode =
  | { readonly kind: "literal"; readonly value: string | number | boolean | null }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly arguments: readonly NormalizedExpressionNode[];
    }
  | {
      readonly kind: "access";
      readonly target: NormalizedExpressionNode;
      readonly key: string | number;
    };

export interface NormalizedExpression {
  readonly pointer: string;
  readonly source: string;
  readonly valid: boolean;
  readonly functions: readonly string[];
  readonly actionReferences: readonly string[];
  readonly readbackAssertions: readonly NormalizedReadbackAssertion[];
  readonly root?: NormalizedExpressionNode;
}

export interface NormalizedTrigger {
  readonly id: string;
  readonly type: string;
  readonly expressionPointers: readonly string[];
  readonly expressions: readonly NormalizedExpression[];
}

export interface NormalizedRunAfter {
  readonly actionId: string;
  readonly statuses: readonly string[];
}

export interface NormalizedDataReference {
  readonly source: "trigger" | "action";
  readonly actionId?: string;
  readonly path: readonly (string | number)[];
}

export interface NormalizedConnector {
  readonly reference: string;
  readonly operationId: string;
  readonly resource?: string;
  readonly identifier?: string;
  readonly identifierDataflow?: NormalizedDataReference;
  readonly method?: string;
  readonly uriClass?: "absolute" | "dynamic" | "relative";
  readonly overrideMethod?: string;
  readonly ifMatch?: string;
}

export interface NormalizedRetryPolicy {
  readonly type: string;
  readonly count?: number;
  readonly interval?: string;
}

export type NormalizedControlBranch =
  | "condition-true"
  | "condition-false"
  | "case"
  | "default"
  | "container";

export interface NormalizedAction {
  readonly id: string;
  readonly type: string;
  readonly containerId: string;
  readonly containerIndex: number;
  readonly parentId?: string;
  readonly parentType?: string;
  readonly controlBranch?: NormalizedControlBranch;
  readonly runAfter: readonly NormalizedRunAfter[];
  readonly expressionPointers: readonly string[];
  readonly expressions: readonly NormalizedExpression[];
  readonly connector?: NormalizedConnector;
  readonly retryPolicy?: NormalizedRetryPolicy;
  readonly inputs?: unknown;
  readonly terminationStatus?: string;
  readonly declaredRole?: string;
  /** @deprecated Rules use declaredRole plus normalized structural evidence. */
  readonly role?: string;
}

export interface NormalizedFlow {
  readonly id: string;
  readonly trigger: NormalizedTrigger;
  readonly actions: ReadonlyMap<string, NormalizedAction>;
  readonly connectionReferences: ReadonlySet<string>;
  readonly actionCount: number;
  readonly declaredDestructive: boolean;
}

export interface PackageInspection {
  readonly profile: "power-platform-solution-v1";
  readonly valid: boolean;
  readonly inventory: readonly string[];
  readonly expectedInventory: readonly string[];
  readonly flows: readonly NormalizedFlow[];
  readonly diagnostics: readonly Diagnostic[];
}

export type PackageInspectionFailure = "invalid" | "missing" | "unsafe";

export type PackageArchiveReason =
  | "MALFORMED_ARCHIVE"
  | "UNSAFE_PATH"
  | "DUPLICATE_PATH"
  | "CASE_COLLISION"
  | "ENCRYPTED_ENTRY"
  | "UNSUPPORTED_ENTRY_TYPE"
  | "UNSUPPORTED_COMPRESSION"
  | "DEVICE_NAME"
  | "ENTRY_COUNT_LIMIT"
  | "ENTRY_SIZE_LIMIT"
  | "TOTAL_SIZE_LIMIT"
  | "COMPRESSION_RATIO_LIMIT"
  | "NESTED_ARCHIVE"
  | "UNSAFE_XML";

export interface PackageRuleEvidence {
  readonly packageId: string;
  readonly relativePath: string;
  readonly contract: PackageContract;
  readonly bytes?: number;
  readonly sha256?: string;
  readonly inspection?: PackageInspection;
  readonly failure?: PackageInspectionFailure;
  readonly archiveReason?: PackageArchiveReason;
}

export interface FlowRuleEvidence {
  readonly packageId: string;
  readonly packagePath: string;
  readonly contract: FlowContract;
  readonly flow: NormalizedFlow;
}

export interface RuleAdapterEvidence {
  readonly packages: readonly PackageRuleEvidence[];
  readonly flows: readonly FlowRuleEvidence[];
}
