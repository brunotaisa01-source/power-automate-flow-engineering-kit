# Evidence Model Specification

## 1. Principle

Evidence supports only the claim it directly proves. Evidence classes are not automatically cumulative or transitive. A local test, generated ZIP, synchronized folder, saved flow, import response, or successful run can never by itself establish tenant verification.

## 2. Evidence Classes

| Class | Directly supports | Does not support |
|---|---|---|
| `LOCAL_STATIC` | Parsing, schemas, static rules, documentation consistency | Runtime, ZIP, tenant state |
| `LOCAL_RUNTIME` | Synthetic local execution | Final ZIP or tenant behavior |
| `PACKAGE_ARTIFACT` | Exact generated definition/ZIP/manifest validation | Import, rebind, enable, run, effect |
| `IMPORTED` | Exact artifact accepted into named target while disabled | Correct binding, enablement, execution |
| `REBOUND` | Required connections/environment bindings read back | Enablement or semantic effect |
| `ENABLED` | Intended flow enabled state read back | Trigger execution or effect |
| `LIVE_SMOKE` | Controlled trigger and declared semantic assertions | Full tenant coverage outside scenario |
| `TENANT_VERIFIED` | Current authenticated schema, ACL, flows, and required scenarios | Future state or another target |
| `PUBLISHED` | Exact artifact authorized and visible at an exact target | Tenant behavior unless separately evidenced |

`PUBLISHED` is subject-specific. Publishing the public toolkit to a code host does not publish or verify any tenant application.

## 3. Evidence Record

Path: `evidence/<claim-class>/<evidence-id>.json`

```ts
interface EvidenceRecord {
  schemaVersion: "1.0";
  evidenceId: string;
  claimClass: EvidenceClass;
  subject: EvidenceSubject;
  contract: { projectId: string; revision: number; digest: string };
  artifacts: EvidenceArtifact[];
  execution: ExecutionEvidence;
  assertions: EvidenceAssertion[];
  dependencies: string[];
  residualGates: ResidualGateRecord[];
  review: ReviewRecord;
  result: "PASS" | "FAIL" | "BLOCKED";
}

interface EvidenceSubject {
  type: "toolkit-release" | "project-artifact" | "tenant-import" | "tenant-flow" | "tenant-application";
  id: string;
  targetBindingKey?: string;
  changeWindowId?: string;
}

interface EvidenceArtifact {
  path: string;
  sha256: string;
  bytes: number;
  role: string;
}

interface ExecutionEvidence {
  command: string;
  toolVersion: string;
  startedAt: string;
  endedAt: string;
  exitCode: number;
  normalizedOutputPath: string;
  networkMode: "offline" | "authenticated-read" | "authorized-write";
}

interface EvidenceAssertion {
  id: string;
  description: string;
  expected: unknown;
  actual: unknown;
  result: "PASS" | "FAIL" | "NOT_RUN";
}

interface ResidualGateRecord {
  id: string;
  requiredClaimClass: EvidenceClass;
  status: "OPEN" | "SATISFIED" | "NOT_APPLICABLE";
  evidenceId?: string;
}

interface ReviewRecord {
  gate: string;
  reviewerRole: string;
  decision: "APPROVED" | "REJECTED" | "PENDING";
  decidedAt?: string;
}
```

Timestamps are required for evidence records but are excluded from deterministic validator snapshots. All timestamps use RFC 3339 UTC.

## 4. Evidence Identity and Binding

- `evidenceId` is a deterministic or generated public-safe ID and contains no tenant identifier.
- Every artifact is bound by exact path, byte count, and current SHA-256.
- Contract digest binds evidence to a contract revision.
- Tenant classes require an external `targetBindingKey` reference, never the actual target value in the public repository.
- Tenant classes require one `changeWindowId`; evidence from different windows cannot be silently combined.
- An artifact change invalidates dependent evidence.
- A failed or blocked dependency cannot support a PASS claim.

## 4.1 WP-06 Derived Rule Evidence

WP-06 rule evidence is a derived local artifact, not an assertion that can prove itself. Its normalized envelope contains:

```ts
interface Wp06EvidenceBinding {
  section: Wp06EvidenceSection;
  contractArtifactPath: string;
  contractArtifactSha256: string;
  contractArtifactBytes: number;
  sourceArtifactPath: string;
  sourceArtifactSha256: string;
  sourceArtifactBytes: number;
  sourceArtifactKind: "frontend" | "builder";
}
```

The bound source is a deterministic adapter projection and is structurally
different from the evidence envelope:

```ts
interface Wp06SourceProjection {
  sourceProjectionProfile: "wp06-source-projection-v1";
  projectionRevision: 1;
  contractRevision: number;
  sourceKind: "frontend" | "builder";
  section: Wp06EvidenceSection;
  adapter: {
    id: "spflow.frontend-static-v1" | "spflow.power-automate-static-v1";
    version: 1;
  };
  facts: readonly unknown[];
}
```

The validator requires all of the following:

- the envelope contains exactly one populated section and `binding.section` names it;
- the evidence path differs from `sourceArtifactPath` to prevent circular self-binding;
- exactly one `project-contract-v1` graph node matches contract path, SHA-256, and byte length;
- exactly one `wp06-source-projection-v1` node matches source path, SHA-256, byte length, and kind;
- the evidence node has exactly one `derives-from` edge to that source node and exactly one
  `verifies-contract` edge to that contract node;
- both the evidence node and bound source kind match the rule catalog's `frontend` or `builder` applicability;
- the adapter ID matches the source kind and its projection contains exactly one section;
- canonical projected facts equal the selected normalized evidence section;
- stale revisions, duplicate section artifacts, undeclared values, duplicate semantic items, unknown envelope keys, unknown binding keys, unknown section keys, and unknown nested keys fail closed.

The validator verifies the deterministic adapter output and its exact graph
binding. It does not infer code semantics from a profile label, and a
hand-authored evidence envelope cannot independently authorize PASS. Production
adapters must parse the actual frontend, Power Automate builder or definition,
generated package, or another declared source into this projection. Adapter
trust, final artifact inspection, mutation controls, and external tenant gates
remain separate requirements.

## 5. Claim Support Matrix

An evidence record MAY depend only on the following minimum prerequisites:

| Claim | Required prerequisites |
|---|---|
| `LOCAL_STATIC` | Exact contract/artifact binding and static command output |
| `LOCAL_RUNTIME` | `LOCAL_STATIC` plus synthetic runtime output |
| `PACKAGE_ARTIFACT` | Static package rules, final artifact parse, manifest recomputation, public-data scan |
| `IMPORTED` | Approved `PACKAGE_ARTIFACT`, authorized target, import while disabled, import readback |
| `REBOUND` | `IMPORTED`, expected connection references, authenticated binding readback |
| `ENABLED` | `REBOUND`, explicit enable approval, enabled-state readback |
| `LIVE_SMOKE` | `ENABLED`, controlled trigger, semantic effect readback, audit assertion |
| `TENANT_VERIFIED` | Required schema/ACL/flow scenarios and current authenticated readback in one change window |
| `PUBLISHED` | R0 authorization, exact artifact/target, publication readback; tenant behavior needs separate tenant evidence |

The validator rejects a claim that lacks any minimum prerequisite or uses a dependency with a different artifact digest, contract revision, target, or change window.

## 6. Prohibited Promotions

The following are always invalid:

- `LOCAL_STATIC` or `LOCAL_RUNTIME` -> `TENANT_VERIFIED`;
- builder/source GREEN -> `PACKAGE_ARTIFACT` without final ZIP inspection;
- local folder copy/synchronization -> `PUBLISHED`;
- saved flow -> `REBOUND` or `ENABLED`;
- import API response -> `IMPORTED` without authenticated readback and disabled-state assertion;
- run status `Succeeded` -> `LIVE_SMOKE` without semantic effect and audit readback;
- old tenant evidence -> current claim after artifact, contract, binding, permission, or target change;
- one user's permission result -> all user scopes;
- one smoke scenario -> full `TENANT_VERIFIED` unless the contract defines it as the complete required set.

These failures use `RELEASE-EVIDENCE-001` or `RELEASE-EVIDENCE-002`.

## 7. Local Evidence Output

The global offline command emits a normalized report that MAY be wrapped as `LOCAL_STATIC`, `LOCAL_RUNTIME`, and `PACKAGE_ARTIFACT` evidence where supported. It MUST:

- identify exact checked artifacts;
- retain failed and `NOT_RUN` assertions;
- list every tenant residual gate as open;
- avoid machine name, absolute path, user identity, or environment value;
- avoid claiming tests that were not executed in that command.

## 8. Tenant Evidence Handling

Tenant evidence is not committed to the public repository. A project using the kit stores it in an approved private evidence store. Public examples use schema-valid synthetic records with placeholders and `NOT_RUN` tenant assertions.

Authenticated operations MUST redact:

- tenant URL and IDs;
- principal identity;
- connection identifiers and tokens;
- mailbox/message data;
- item content not required for a boolean assertion;
- raw platform error payloads.

Normalized evidence records SHOULD store assertion booleans, expected/actual schema shapes, operation counts, and public-safe logical IDs.

## 9. Evidence Validation

```text
spflow evidence validate evidence/<class>/<id>.json --format json
```

Exit statuses:

- `0`: record is internally valid and its claim is supported;
- `1`: assertion, artifact, or dependency mismatch;
- `2`: unreadable or invalid invocation;
- `3`: unsupported schema/claim class;
- `5`: public-data violation;
- `6`: unsupported claim promotion;
- `7`: internal error;
- `8`: explicitly requested external evidence is unavailable or unauthorized.

No evidence validator performs tenant mutation.

## 10. Review Rules

- The author cannot be the sole final reviewer for artifact, tenant, or publication gates.
- Review decisions are evidence, not a substitute for technical assertions.
- A reviewer must inspect the exact artifact digest and normalized output.
- A timeout, slow response, or absent checkpoint is `PENDING` until proven otherwise; it is not automatically `FAIL`.
- Superseded evidence remains immutable and is linked by a new record rather than edited into a stronger claim.
