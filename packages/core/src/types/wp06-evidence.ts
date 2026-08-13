export const WP06_EVIDENCE_PROFILE = "wp06-offline-v1" as const;
export const WP06_ARTIFACT_PROFILE = "wp06-evidence-v1" as const;

export type Wp06SourceArtifactKind = "builder" | "frontend";

export interface NormalizedAuthoritySequence {
  readonly identityRead: number;
  readonly capabilityRead: number;
  readonly targetRead: number;
  readonly mutation: number;
}

export interface NormalizedAuthoritySources {
  readonly actor: string;
  readonly role: string;
  readonly scope: string;
  readonly protectedState: string;
  readonly owner: string;
  readonly amount: string;
  readonly approval: string;
}

export interface NormalizedCapabilityEvidence {
  readonly id: string;
  readonly accessListId: string;
  readonly activeField: string;
  readonly principalField: string;
  readonly capabilityField: string;
  readonly source: string;
  readonly activeOnly: boolean;
  readonly matchCardinality: string;
  readonly commandDeclared: boolean;
  readonly stateTransitionDeclared: boolean;
}

export interface NormalizedScopeEvidence {
  readonly mode: string;
  readonly targetField?: string;
  readonly accessField?: string;
  readonly lookupListId?: string;
  readonly targetValueSource: string;
  readonly capabilityValueSource: string;
  readonly evaluation: string;
  readonly checkedBeforeMutation: boolean;
}

export interface NormalizedAuthorityCheck {
  readonly commandType: string;
  readonly targetListId: string;
  readonly sequence: NormalizedAuthoritySequence;
  readonly authoritySources: NormalizedAuthoritySources;
  readonly capability: NormalizedCapabilityEvidence;
  readonly scope: NormalizedScopeEvidence;
  readonly effectiveOperation: {
    readonly operation: string;
    readonly allowed: boolean;
  };
}

export interface NormalizedPermissionGrant {
  readonly principalKind: string;
  readonly principalBinding: string;
  readonly role: string;
  readonly allowedOperations: readonly string[];
}

export interface NormalizedPermissionModel {
  readonly listId: string;
  readonly inheritance: string;
  readonly directUserGrants: string;
  readonly browserOperations: readonly string[];
  readonly grants: readonly NormalizedPermissionGrant[];
}

export interface NormalizedPermissionProbe {
  readonly listId: string;
  readonly principalBinding: string;
  readonly operations: Readonly<Record<string, boolean>>;
}

export interface NormalizedSaveTransaction {
  readonly listId: string;
  readonly trigger: string;
  readonly patchedFields: readonly string[];
  readonly request: {
    readonly method: string;
    readonly methodOverride: string;
    readonly serialization: string;
    readonly digest: string;
    readonly ifMatch: string;
  };
  readonly conflict: {
    readonly status: number;
    readonly action: string;
  };
  readonly ambiguousFailure: {
    readonly action: string;
    readonly writeRetry: boolean;
  };
  readonly readback: {
    readonly method: string;
    readonly semantic: boolean;
    readonly beforeSuccess: boolean;
  };
}

export interface NormalizedPaginationTraversal {
  readonly completeness: string;
  readonly mode: string;
  readonly continuation: {
    readonly urlParsing: string;
    readonly sameOrigin: boolean;
    readonly sitePath: boolean;
    readonly visitedLinks: boolean;
    readonly pageLimit: number;
    readonly onLoop: string;
    readonly onCrossOrigin: string;
    readonly onSitePathEscape: string;
    readonly onPageLimit: string;
  };
  readonly accumulation: string;
  readonly termination: string;
}

export interface NormalizedODataRequest {
  readonly listId: string;
  readonly fieldNames: readonly string[];
  readonly fieldSource: string;
  readonly queryConstruction: string;
  readonly pathConstruction: string;
  readonly stringLiteralEscaping: string;
  readonly rawFragmentsAccepted: boolean;
  readonly parameterEncoding: string;
}

export interface NormalizedFieldIdentity {
  readonly source: string;
  readonly internalName: string;
  readonly entityPropertyName: string;
}

export interface NormalizedFieldUse {
  readonly operation: string;
  readonly fieldName: string;
  readonly source: string;
}

export interface NormalizedFieldPayload {
  readonly serialization: string;
  readonly metadataType: string;
  readonly fieldTypeKind?: number;
}

export interface NormalizedFieldCompatibility {
  readonly response: string;
  readonly comparedProperties: readonly string[];
  readonly actual?: Readonly<Record<string, unknown>>;
  readonly outcome: string;
  readonly writeAction: string;
}

export interface NormalizedFieldOperation {
  readonly listId: string;
  readonly logicalName: string;
  readonly identity?: NormalizedFieldIdentity;
  readonly uses?: readonly NormalizedFieldUse[];
  readonly createPayload?: NormalizedFieldPayload;
  readonly indexPayload?: NormalizedFieldPayload;
  readonly compatibility?: NormalizedFieldCompatibility;
}

export interface NormalizedHttpClassification {
  readonly status: number;
  readonly phase: string;
  readonly requestKind: string;
  readonly allowCreateMissing404: boolean;
  readonly error: {
    readonly platformCode?: string;
    readonly messageCategory?: string;
  };
  readonly classification: string;
}

export interface NormalizedIndexOperation {
  readonly sequence: number;
  readonly kind: string;
  readonly field: string;
  readonly payloadMetadataType?: string;
  readonly readback: boolean | {
    readonly performed: boolean;
    readonly observedFields: readonly string[];
  };
}

export interface NormalizedIndexPlan {
  readonly listId: string;
  readonly currentFields: readonly string[];
  readonly requiredFields: readonly string[];
  readonly execution: string;
  readonly digest: {
    readonly fresh: boolean;
    readonly bindsCurrent: boolean;
    readonly bindsRequired: boolean;
  };
  readonly result: string;
  readonly maximumWrites: number;
  readonly writeCount: number;
  readonly operations: readonly NormalizedIndexOperation[];
  readonly finalReadback: readonly string[];
}

export interface NormalizedWp06Evidence {
  readonly evidenceProfile: typeof WP06_EVIDENCE_PROFILE;
  readonly contractRevision: number;
  readonly binding: NormalizedWp06EvidenceBinding;
  readonly authorityChecks?: readonly NormalizedAuthorityCheck[];
  readonly permissionModels?: readonly NormalizedPermissionModel[];
  readonly permissionProbes?: readonly NormalizedPermissionProbe[];
  readonly saveTransactions?: readonly NormalizedSaveTransaction[];
  readonly paginationTraversals?: readonly NormalizedPaginationTraversal[];
  readonly odataRequests?: readonly NormalizedODataRequest[];
  readonly fieldOperations?: readonly NormalizedFieldOperation[];
  readonly httpClassifications?: readonly NormalizedHttpClassification[];
  readonly indexPlans?: readonly NormalizedIndexPlan[];
}

export const WP06_EVIDENCE_SECTIONS = [
  "authorityChecks",
  "permissionModels",
  "permissionProbes",
  "saveTransactions",
  "paginationTraversals",
  "odataRequests",
  "fieldOperations",
  "httpClassifications",
  "indexPlans",
] as const;

export type Wp06EvidenceSection = (typeof WP06_EVIDENCE_SECTIONS)[number];

export interface NormalizedWp06EvidenceBinding {
  readonly section: Wp06EvidenceSection;
  readonly contractArtifactPath: string;
  readonly contractArtifactSha256: string;
  readonly sourceArtifactPath: string;
  readonly sourceArtifactSha256: string;
  readonly sourceArtifactBytes: number;
  readonly sourceArtifactKind: Wp06SourceArtifactKind;
}
