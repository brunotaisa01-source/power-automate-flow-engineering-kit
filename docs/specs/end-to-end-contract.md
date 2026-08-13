# End-to-End Contract

## 1. Purpose

This contract defines the complete application protocol from browser read through SharePoint command submission, Power Automate authorization and mutation, audit, semantic readback, and browser refresh. It prevents a component from claiming success when a downstream effect is unverified.

## 2. Authorities

| Data | Authority |
|---|---|
| Authenticated actor | SharePoint/connector system identity read by the processor |
| Capability and scope | Active server-side access-control row and effective permissions |
| Protected business values | Current protected-domain SharePoint item |
| Allowed transition | `project.contract.json` state machine |
| Concurrency | Exact current ETag |
| Requested command | Validated command payload |
| Completion | Semantic readback matching declared assertions |
| Tenant release state | Current authenticated tenant evidence |

Client-provided actor, role, scope, protected state, owner, amount, or approval is never authoritative.

## 3. Read Protocol

### 3.1 Request construction

The frontend MUST:

1. Use same-origin requests with the existing authenticated session.
2. Build `$select`, `$expand`, `$filter`, `$orderby`, and `$top` from contract allowlists.
3. Escape OData string literals by doubling single quotes before URL encoding.
4. Encode query parameter values with a structured URL API.
5. Request ETag metadata for every editable or command-target record.
6. Reject caller-supplied raw OData fragments.

### 3.2 Pagination

- Complete operations such as KPI, export, deduplication, authorization lookup, and oldest-item calculation MUST follow continuation links to exhaustion.
- Each next link MUST be parsed as a URL and MUST match the initial scheme, host, and allowed site path.
- Repeated next links, loops, page-limit overflow, or cross-origin links MUST fail closed.
- Page results MUST be accumulated without changing server ordering.

## 4. Typed Command Queue Protocol

### 4.1 Browser submission

The browser MAY create one queue item containing:

```ts
interface CommandEnvelope {
  schemaVersion: "1.0";
  commandType: string;
  targetItemId: number;
  targetBusinessId?: string;
  targetEtag: string;
  idempotencyKey: string;
  correlationId: string;
  requested: Record<string, string | number | boolean>;
  traceActor?: string;
}
```

Requirements:

- `idempotencyKey`, `correlationId`, `commandType`, `targetItemId`, and `targetEtag` are required and non-empty.
- `requested` MUST contain only fields declared for that command.
- `traceActor` MAY be retained for diagnostics but MUST NOT participate in authorization.
- The browser MUST NOT update or delete queue items after creation.
- A transport timeout after create is ambiguous; the browser MUST query by idempotency key and MUST NOT resubmit blindly.

### 4.2 Processor claim

The processor MUST:

1. Read the command by SharePoint item ID.
2. Validate schema version, command type, field allowlist, sizes, and enum values.
3. Query the idempotency key and apply exact `0/1/many` handling.
4. Claim `Pending -> Processing` using exact queue-item ETag.
5. Stop if another processor has already claimed or completed the command.
6. Ensure one active processor owns the command type.

Cardinality behavior:

- `0`: proceed only when this is the initial create/execute path defined by the contract.
- `1`: return or continue the single authoritative record according to command state.
- `many`: fail as reconciliation-required; do not choose one silently.
- empty key: reject before any business mutation.

### 4.3 Server authority re-read

Before mutation, the processor MUST re-read:

- authenticated system identity;
- active access-control row;
- required capability;
- capability scope and target-scope value;
- target item by SharePoint ID;
- target business ID when declared;
- current protected business values;
- current state-machine state;
- exact target ETag.

The processor MUST compare the command's target identity and ETag with current state. A stale or mismatched target fails without mutation.

### 4.4 Transition and mutation

- Exactly one declared transition may execute.
- Mutation payload is built from server-authoritative values plus explicitly allowed request fields.
- Protected fields cannot be copied from the command payload.
- The mutation uses exact ETag and minimum fields.
- HTTP 412 produces a conflict result and no retry.
- A timeout or unknown response after write triggers GET reconciliation only.
- A retry is allowed only when readback proves the effect did not occur and the contract explicitly marks the operation replay-safe.

### 4.5 Audit

The processor appends an audit record containing only:

- correlation ID;
- command type and command item ID;
- target logical ID;
- authenticated actor identifier in the tenant audit store only;
- previous and resulting state;
- changed field names and non-sensitive normalized values where policy permits;
- processor flow ID and run ID;
- result classification;
- readback assertion results.

Raw message bodies, attachments, secrets, connector tokens, sensitive field values, and full error payloads are forbidden.

### 4.6 Semantic readback and completion

After mutation, the processor MUST GET the target and evaluate every declared readback assertion. A connector response or flow status is not evidence of effect.

- All assertions pass: append audit, update command to `Succeeded`, then re-read command state.
- Mutation rejected before effect: append redacted failure audit and update command to `Failed` using exact ETag.
- Mutation response ambiguous and readback matches: complete as `Succeeded` without replay.
- Mutation response ambiguous and readback does not match: mark reconciliation-required; do not replay blindly.
- Audit or command completion write fails after business effect: preserve reconciliation state and do not repeat business mutation.

## 5. Direct Patch Exception

Direct patch is disabled unless `frontend.directPatch.enabled` is true and the target list uses `writeModel: "direct-patch"`.

### 5.1 Save transaction

Each explicit Save MUST perform a self-contained sequence:

1. Lock the record UI for one transaction.
2. Compute a minimal patch from dirty fields.
3. Reject any field absent from `patchAllowlist` or not marked `clientEditable`.
4. Obtain a fresh digest from `/_api/contextinfo` for this transaction.
5. Send HTTP `POST` with `X-HTTP-Method: MERGE`.
6. Send exact `IF-MATCH` from the loaded record.
7. On 412, keep local edits, fetch authoritative state, and present a conflict decision. Never use `IF-MATCH: *`.
8. On ambiguous response, perform GET reconciliation and do not resend MERGE automatically.
9. On accepted response, GET the record and verify each patched field semantically.
10. Replace local state and ETag only with readback data, then unlock the UI.

A digest MUST NOT be shared across concurrent Save transactions.

## 6. HTTP Semantic Classification

```ts
type ReadClassification =
  | "FOUND"
  | "MISSING_OBJECT"
  | "CREATE_MISSING"
  | "GET_FAILED";
```

Rules:

- HTTP 200-299 with valid expected body: `FOUND`.
- HTTP 400: `MISSING_OBJECT` only when the structured platform error code or normalized semantic message identifies a missing column. Status alone is insufficient.
- Every other HTTP 400: `GET_FAILED`.
- HTTP 404: `CREATE_MISSING` only for an initial Preflight GET whose operation contract explicitly sets `allowCreateMissing404: true`.
- HTTP 404 during Apply, post-write readback, or any undeclared phase: `GET_FAILED`.
- Authentication, authorization, throttling, and server errors remain failures and are never interpreted as absence.

The missing-column classifier MUST have positive and negative fixtures, including unrelated 400 responses.

## 7. Provisioning and Index Remediation

Provisioning is split into `Preflight`, `Apply`, and `Readback`:

### Preflight

- Read current lists, fields, internal names, indexes, views, and effective permissions.
- Produce an ordered, bounded, deterministic plan with zero writes.
- Classify missing objects semantically.
- Bind the plan to target, contract revision, and plan digest.

### Apply

- Requires explicit human approval of the exact plan digest.
- Re-read state before each operation.
- Treat already-compatible state as `NO_OP`.
- For index policy, remove obsolete indexes serially before adding required indexes serially.
- Stop on unexpected state or any strict readback failure.

### Readback

- Re-read field `EntityPropertyName`, types, index flags, views, and effective permissions.
- Apply/readback 404 is a strict failure.
- Completion requires exact semantic agreement with the project contract.

## 8. Connector and Flow Requirements

- SharePoint MERGE uses connector method `POST` plus override header; `MERGE` as the connector method is invalid.
- SharePoint field update payloads include the required typed `SP.Field` metadata where the endpoint requires it.
- Internal field names are discovered/read back; display names are not assumed.
- `Terminate` MUST NOT be nested inside `Foreach`/`Apply_to_each` ancestry.
- Every action must be transitively reachable from the trigger through satisfiable `runAfter` edges.
- Every connection reference must be declared by the package and rebound before enablement.
- JSON and WDL values are constructed through safe expression serialization, not unescaped string interpolation.

## 9. Error State Contract

```ts
interface OperationError {
  classification:
    | "VALIDATION_FAILED"
    | "UNAUTHORIZED"
    | "SCOPE_MISMATCH"
    | "CONFLICT"
    | "RECONCILIATION_REQUIRED"
    | "GET_FAILED"
    | "READBACK_FAILED"
    | "AUDIT_FAILED"
    | "INTERNAL_FAILED";
  retryable: boolean;
  correlationId: string;
  publicMessage: string;
}
```

- `retryable` is false for authorization, scope, validation, conflict, and semantic readback failures.
- Ambiguous write is reconciliation-required, not automatically retryable.
- Error output MUST exclude secrets, private payloads, tenant URLs, and raw connector response bodies.

## 10. Test Contract

Offline tests MUST include:

- protected value and actor tampering;
- missing and mismatched capability scope;
- exact ETag and HTTP 412;
- two concurrent Save transactions with separate digests;
- ambiguous create and mutation responses with GET reconciliation;
- zero, one, many, and empty idempotency keys;
- OData quotes and reserved characters;
- multi-page and looping pagination;
- semantic 400 positive and negative cases;
- phase-sensitive 404 cases;
- run success without semantic effect;
- serial remove-before-add index plan and compatible no-op;
- same-origin continuation enforcement.

Tenant-only tests are effective permission probes, separate-user authorization, import/rebind/enable readback, special-character queries, concurrency with real ETags, controlled mutation, semantic readback, and rollback. Their absence MUST NOT be reported as an offline failure, but MUST remain an explicit residual gate.

