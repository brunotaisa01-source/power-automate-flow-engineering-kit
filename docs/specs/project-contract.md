# Project Contract Specification

## 1. Status and Normative Language

This document defines `project.contract.json`, the root machine-readable contract for a toolkit project. `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, and `MAY` are normative.

The JSON Schema authority will be `contracts/project-contract.schema.json`. This document governs semantics that JSON Schema alone cannot express.

## 2. File Location and Encoding

- Path: `<project-root>/project.contract.json`
- Encoding: UTF-8 without BOM
- Line endings: LF
- JSON: strict JSON; comments and trailing commas are forbidden
- Schema version: `1.0`
- Unknown properties: rejected at every object boundary
- Repository paths: relative POSIX paths with no `.` or `..` segments
- Identifiers: `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`
- Rule IDs: `^[A-Z]+(?:-[A-Z]+)*-[0-9]{3}$`

## 3. Root Object

```ts
interface ProjectContract {
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
```

All arrays whose order is not semantically significant MUST be sorted by their primary ID in canonical output.

## 4. Project Identity

```ts
interface ProjectIdentity {
  id: string;
  displayName: string;
  description: string;
  contractRevision: number;
  dataClassification: "synthetic-public";
}
```

- `contractRevision` MUST be an integer greater than zero and MUST increase for a breaking contract change.
- Public contracts MUST use `dataClassification: "synthetic-public"`.
- `displayName` and `description` MUST pass the public-data scanner.

## 5. Runtime Contract

```ts
interface RuntimeContract {
  node: ">=22.0.0 <23.0.0";
  npm: ">=10.0.0 <11.0.0";
  moduleFormat: "esm";
  locale: "en";
  timeZone: "UTC";
  networkDuringOfflineVerify: "forbidden";
}
```

## 6. Environment Bindings

The public repository stores binding declarations, never environment values.

```ts
interface EnvironmentBinding {
  key: string;
  kind:
    | "site-url"
    | "list-title"
    | "mailbox-upn"
    | "connection-reference"
    | "environment-id"
    | "solution-id";
  requiredFor: Array<"generate" | "tenant-preflight" | "tenant-apply" | "tenant-readback">;
  sensitive: boolean;
  example: string;
}
```

Requirements:

- `key` MUST match `^[A-Z][A-Z0-9_]*$`.
- `example` MUST be a placeholder such as `{SITE_URL}` or a reserved synthetic value such as `user@example.test`.
- Actual values MUST be supplied through `--bindings <absolute-path-outside-repository>` or named `SPFLOW_BINDING_<KEY>` environment variables.
- The CLI MUST reject a bindings file located inside the repository root.
- Binding values MUST be redacted from diagnostics, evidence, generated documentation, and logs.
- A binding marked `sensitive: true` MUST NOT be accepted from a command-line value because process arguments can be exposed.

## 7. SharePoint Contract

```ts
interface SharePointContract {
  siteUrlBinding: string;
  lists: ListContract[];
}

interface ListContract {
  id: string;
  titleBinding: string;
  role: "protected-domain" | "command-queue" | "audit" | "access-control" | "reference" | "outbox";
  writeModel: "server-only" | "append-command" | "append-only" | "direct-patch" | "read-only";
  readAllowlist: string[];
  createAllowlist: string[];
  patchAllowlist: string[];
  fields: FieldContract[];
  indexes: IndexContract[];
  permissions: PermissionContract;
  views: ViewContract[];
}

interface FieldContract {
  logicalName: string;
  internalName: string;
  type: "Text" | "Note" | "Number" | "Currency" | "Boolean" | "DateTime" | "Choice" | "User" | "Lookup" | "Guid";
  required: boolean;
  indexed: boolean;
  unique: boolean;
  clientEditable: boolean;
  serverAuthoritative: boolean;
  immutableAfterCreate: boolean;
  sensitive: boolean;
  maxLength?: number;
  dateTimeMode?: "DateOnly" | "DateTime";
  choices?: string[];
  lookupListId?: string;
  lookupField?: string;
}

interface IndexContract {
  field: string;
  order: number;
  required: boolean;
}

interface ViewContract {
  id: string;
  fields: string[];
  rowLimit: number;
  paged: true;
  filterContract?: string;
}

interface PermissionContract {
  inheritance: "inherit" | "break-copy" | "break-clear";
  minimumRoles: PermissionRole[];
  directUserGrants: "forbidden";
  effectivePermissionReadback: "required";
}

interface PermissionRole {
  principalBinding: string;
  role: "read" | "contribute-limited" | "processor" | "audit-read" | "owner";
  allowedOperations: string[];
}
```

Cross-field invariants:

- A `protected-domain` list MUST use `server-only` unless each patched field is explicitly `clientEditable` and the list uses `direct-patch`.
- `patchAllowlist` MUST equal the set of direct-patch fields with `clientEditable: true`.
- A field MUST NOT be both `clientEditable` and `serverAuthoritative`.
- `ID`, `Modified`, `Editor`, and ETag metadata MUST be read for concurrency even when not displayed.
- Every index field MUST exist, have `indexed: true`, and appear once.
- Index count MUST not exceed the declared package/profile limit. The default supported limit is 20 unless an explicit compatible profile states otherwise.
- View fields MUST resolve to confirmed `internalName` values.
- Fields marked `sensitive` MUST be excluded from audit payloads and default frontend reads.
- A command queue MUST allow browser create only and MUST deny browser update/delete.

## 8. State Machines

```ts
interface StateMachine {
  id: string;
  listId: string;
  field: string;
  initial: string;
  terminal: string[];
  states: string[];
  transitions: Transition[];
}

interface Transition {
  id: string;
  from: string[];
  to: string;
  commandType: string;
  requiredCapability: string;
  serverGuards: string[];
}
```

- Every state used by code, schema, test, flow, or documentation MUST occur exactly once in `states`.
- Every transition MUST reference an existing command and capability.
- Terminal states MUST have no outgoing transition unless an explicit reopen transition is declared.
- The initial state MUST not be terminal.

## 9. Capabilities

```ts
interface Capability {
  id: string;
  accessListId: string;
  activeField: string;
  principalField: string;
  capabilityField: string;
  scope: ScopeContract;
  allowedCommands: string[];
}

interface ScopeContract {
  mode: "global" | "field-match" | "lookup-membership";
  targetField?: string;
  accessField?: string;
  lookupListId?: string;
}
```

The processor MUST re-read authenticated system identity, active access row, capability, and scope. Client-provided actor, role, or scope values are trace-only and cannot satisfy authorization.

## 10. Commands

```ts
interface CommandContract {
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

interface CommandField {
  name: string;
  type: "string" | "number" | "boolean" | "date-time" | "guid";
  required: boolean;
  maxLength?: number;
  enum?: string[];
  authority: "request" | "trace-only";
}

interface IdempotencyContract {
  keyFields: string[];
  emptyKey: "reject";
  zeroMatches: "create-or-execute";
  oneMatch: "return-existing-or-continue";
  manyMatches: "fail-reconciliation";
  ambiguousWrite: "get-reconcile-no-blind-retry";
}

interface ClaimContract {
  pendingState: "Pending";
  processingState: "Processing";
  succeededState: "Succeeded";
  failedState: "Failed";
  exactEtagRequired: true;
}

interface ReadbackContract {
  required: true;
  fields: string[];
  assertions: Array<{ field: string; operator: "equals" | "not-equals" | "exists"; expected: unknown }>;
}
```

Requested command fields MUST NOT duplicate server-authoritative business values. A correlation ID MAY be supplied as trace evidence but MUST NOT be used as actor authority.

## 11. Flow and Package Contracts

```ts
interface FlowContract {
  id: string;
  definitionPath: string;
  trigger: "sharepoint-created" | "sharepoint-modified" | "recurrence" | "manual";
  processorForCommandTypes: string[];
  connectionReferences: string[];
  actionBudget: number;
  concurrency: { enabled: boolean; degree: number };
  packageId: string;
}

interface PackageContract {
  id: string;
  path: string;
  profile: "power-platform-solution-v1";
  manifestPath: string;
  flowIds: string[];
  importMode: "disabled";
  nestedArchives: "forbidden";
}
```

- `actionBudget` MUST be a positive integer and MUST not exceed the selected compatibility profile.
- Each command type MUST have exactly one active processor in a deployment plan.
- Every connection reference used transitively by an action MUST be declared.
- Package validation MUST inspect the exact final ZIP at `path`.

## 12. Frontend Contract

```ts
interface FrontendContract {
  root: string;
  authModel: "existing-m365-session";
  secrets: "forbidden";
  protectedWriteModel: "typed-command-queue";
  directPatch: {
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
  };
  pagination: {
    mode: "exhaust-continuation";
    sameOriginOnly: true;
  };
}
```

## 13. Security Contract

```ts
interface SecurityContract {
  minimumPrivilege: true;
  clientActorAuthority: "forbidden";
  protectedClientWrites: "forbidden";
  allowlistedFieldsOnly: true;
  destructiveOperations: {
    dryRun: true;
    planDigest: true;
    humanApproval: true;
    itemLimit: number;
    writeLimit: number;
    stopOnUnexpected: true;
    semanticReadback: true;
  };
  httpClassification: {
    missingColumn400: "semantic-signature-only";
    other400: "GET_FAILED";
    initialPreflight404: "explicit-create-missing-only";
    applyOrReadback404: "strict-failure";
  };
}
```

## 14. Verification and Evidence Policy

```ts
interface VerificationContract {
  globalCommand: "spflow verify --root . --offline --format json";
  requiredRuleIds: string[];
  finalZipInspection: true;
  recursivePublicDataScan: true;
  mutationControls: true;
}

interface EvidencePolicy {
  permittedClaimClasses: Array<
    | "LOCAL_STATIC"
    | "LOCAL_RUNTIME"
    | "PACKAGE_ARTIFACT"
    | "IMPORTED"
    | "REBOUND"
    | "ENABLED"
    | "LIVE_SMOKE"
    | "TENANT_VERIFIED"
    | "PUBLISHED"
  >;
  localPromotionToTenant: "forbidden";
  exactArtifactBinding: true;
  synchronizedFolderIsPublication: false;
  successfulRunIsSemanticEffect: false;
}
```

## 15. Minimal Synthetic Example

The full reference contract is maintained under `examples/synthetic-case-workbench/project.contract.json`. Environment declarations use placeholders only:

```json
{
  "schemaVersion": "1.0",
  "project": {
    "id": "synthetic-case-workbench",
    "displayName": "Synthetic Case Workbench",
    "description": "A synthetic command-queue reference application.",
    "contractRevision": 1,
    "dataClassification": "synthetic-public"
  },
  "runtime": {
    "node": ">=22.0.0 <23.0.0",
    "npm": ">=10.0.0 <11.0.0",
    "moduleFormat": "esm",
    "locale": "en",
    "timeZone": "UTC",
    "networkDuringOfflineVerify": "forbidden"
  },
  "environmentBindings": [
    {
      "key": "SITE_URL",
      "kind": "site-url",
      "requiredFor": ["tenant-preflight", "tenant-apply", "tenant-readback"],
      "sensitive": false,
      "example": "{SITE_URL}"
    }
  ]
}
```

The abbreviated example demonstrates encoding and binding policy only; it is not schema-valid until all required root sections are present.

## 16. Validation

```text
spflow validate contract project.contract.json --format json
```

Expected outcomes:

- exit `0`: schema and semantic invariants pass;
- exit `1`: one or more contract rules fail;
- exit `2`: file missing, unreadable, or command invalid;
- exit `3`: unsupported `schemaVersion` or profile;
- exit `5`: public-data violation in the contract;
- exit `7`: internal validator error.

