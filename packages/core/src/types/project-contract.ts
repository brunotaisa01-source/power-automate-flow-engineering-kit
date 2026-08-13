import type {
  BindingKind,
  BindingPhase,
  EvidenceClass,
} from "./constants.js";
import type { FlowContract, PackageContract } from "./flow.js";
import type { SharePointContract } from "./sharepoint.js";

export interface ProjectContract {
  schemaVersion: "1.0";
  project: ProjectIdentity;
  runtime: RuntimeContract;
  environmentBindings: EnvironmentBinding[];
  sharePoint: SharePointContract;
  stateMachines: StateMachine[];
  capabilities: Capability[];
  commands: CommandContract[];
  flows: FlowContract[];
  packages: PackageContract[];
  frontend: FrontendContract;
  security: SecurityContract;
  verification: VerificationContract;
  evidencePolicy: EvidencePolicy;
}

export interface ProjectIdentity {
  id: string;
  displayName: string;
  description: string;
  contractRevision: number;
  dataClassification: "synthetic-public";
}

export interface RuntimeContract {
  node: ">=22.0.0 <23.0.0";
  npm: ">=10.0.0 <11.0.0";
  moduleFormat: "esm";
  locale: "en";
  timeZone: "UTC";
  networkDuringOfflineVerify: "forbidden";
}

export interface EnvironmentBinding {
  key: string;
  kind: BindingKind;
  requiredFor: BindingPhase[];
  sensitive: boolean;
  example: string;
}

export interface StateMachine {
  id: string;
  listId: string;
  field: string;
  initial: string;
  terminal: string[];
  states: string[];
  transitions: Transition[];
}

export interface Transition {
  id: string;
  from: string[];
  to: string;
  commandType: string;
  requiredCapability: string;
  serverGuards: string[];
}

export interface Capability {
  id: string;
  accessListId: string;
  activeField: string;
  principalField: string;
  capabilityField: string;
  scope: ScopeContract;
  allowedCommands: string[];
}

export interface ScopeContract {
  mode: "global" | "field-match" | "lookup-membership";
  targetField?: string;
  accessField?: string;
  lookupListId?: string;
}

export interface CommandContract {
  type: string;
  queueListId: string;
  targetListId: string;
  targetIdField: string;
  requestedFields: CommandField[];
  serverReadFields: string[];
  requiredCapability: string;
  transitionId: string;
  idempotency: IdempotencyContract;
  claim: ClaimContract;
  readback: ReadbackContract;
}

export interface CommandField {
  name: string;
  type: "string" | "number" | "boolean" | "date-time" | "guid";
  required: boolean;
  maxLength?: number;
  enum?: string[];
  authority: "request" | "trace-only";
}

export interface IdempotencyContract {
  keyFields: string[];
  emptyKey: "reject";
  zeroMatches: "create-or-execute";
  oneMatch: "return-existing-or-continue";
  manyMatches: "fail-reconciliation";
  ambiguousWrite: "get-reconcile-no-blind-retry";
}

export interface ClaimContract {
  pendingState: "Pending";
  processingState: "Processing";
  succeededState: "Succeeded";
  failedState: "Failed";
  exactEtagRequired: true;
}

export interface ReadbackContract {
  required: true;
  fields: string[];
  assertions: ReadbackAssertion[];
}

export interface ReadbackAssertion {
  field: string;
  operator: "equals" | "not-equals" | "exists";
  expected: unknown;
}

export interface FrontendContract {
  root: string;
  authModel: "existing-m365-session";
  secrets: "forbidden";
  protectedWriteModel: "typed-command-queue";
  directPatch: DirectPatchContract;
  pagination: PaginationContract;
}

export interface DirectPatchContract {
  enabled: boolean;
  listIds: string[];
  explicitSave: true;
  digestPerTransaction: true;
  method: "POST";
  methodOverride: "MERGE";
  exactIfMatch: true;
  conflictStatus: 412;
  ambiguousWrite: "get-reconcile-no-blind-retry";
  semanticReadback: true;
}

export interface PaginationContract {
  mode: "exhaust-continuation";
  sameOriginOnly: true;
}

export interface SecurityContract {
  minimumPrivilege: true;
  clientActorAuthority: "forbidden";
  protectedClientWrites: "forbidden";
  allowlistedFieldsOnly: true;
  destructiveOperations: DestructiveOperationsContract;
  httpClassification: HttpClassificationContract;
}

export interface DestructiveOperationsContract {
  dryRun: true;
  planDigest: true;
  humanApproval: true;
  itemLimit: number;
  writeLimit: number;
  stopOnUnexpected: true;
  semanticReadback: true;
}

export interface HttpClassificationContract {
  missingColumn400: "semantic-signature-only";
  other400: "GET_FAILED";
  initialPreflight404: "explicit-create-missing-only";
  applyOrReadback404: "strict-failure";
}

export interface VerificationContract {
  globalCommand: "spflow verify --root . --offline --format json";
  requiredRuleIds: string[];
  finalZipInspection: true;
  recursivePublicDataScan: true;
  mutationControls: true;
}

export interface EvidencePolicy {
  permittedClaimClasses: EvidenceClass[];
  localPromotionToTenant: "forbidden";
  exactArtifactBinding: true;
  synchronizedFolderIsPublication: false;
  successfulRunIsSemanticEffect: false;
}
