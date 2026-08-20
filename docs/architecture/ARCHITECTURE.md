# Architecture

## 1. Scope and Truth Boundary

SharePoint Flow Engineering Kit is a public, synthetic-data engineering and
validation toolkit for Power Automate and Power Platform applications. The
product is connector-agnostic at the contract, rule, evidence, and
self-improvement levels. SharePoint is the current executable reference
profile because the local frontend and resource rules implement SharePoint
authority checks.

Power Automate is the external orchestrator in the operational model. This
repository can validate synthetic flow definitions and package projections, but
it does not contain a tenant-connected HTTP backend, a tenant administration
service, or a public command that changes a tenant. The `spflow` CLI is
offline/read-only with respect to tenants.

Excel, Power Apps, Dataverse, Outlook, Microsoft Graph, HTTP, SQL, approvals,
and future connectors are generalized documentation and self-improvement
scopes. Their presence in contracts, rules, diagrams, or examples is not proof
that a tenant runtime has been implemented, imported, enabled, executed, or
semantically verified.

The architecture therefore separates four claims:

1. **Implemented locally:** code, schemas, rules, adapters, fixtures, and CLI
   behavior that can be inspected or executed in this repository.
2. **Documented contract:** connector-neutral interfaces, invariants, state
   machines, and evidence rules that describe how a project must behave.
3. **Design/generalization:** connector profiles and future extension points
   that are intentionally broader than the current executable SharePoint
   profile.
4. **Tenant/runtime:** live import, rebinding, enablement, execution, mutation,
   and semantic readback, each requiring separate evidence and currently
   `NOT_RUN` unless explicitly recorded elsewhere.

## 2. System Overview

The general operational flow is:

```text
AI or engineer
      |
      v
Project Contract
      |
      v
Frontend boundary
      |
      v
Typed command queue or approved direct operation
      |
      v
Power Automate trigger
      |
      v
Power Automate flow validation
      |
      v
Connector-specific adapter
      |
      +--> SharePoint
      +--> Excel
      +--> Power Apps
      +--> Dataverse
      +--> Outlook
      +--> Microsoft Graph
      +--> HTTP
      +--> SQL
      +--> Approvals
      +--> Future connectors
      |
      v
Native response/status validation
      |
      v
Semantic readback
      |
      v
Frontend reloads authoritative state
```

The current reference profile is:

```text
frontend -> SharePoint lists -> Power Automate -> SharePoint -> frontend
```

That profile is the implemented local reference, not the conceptual limit of
the product. The connector-neutral model is documented as:

```text
frontend -> connector-backed data/services -> Power Automate
          -> authoritative systems -> frontend
```

The flow diagrams describe boundaries and required evidence. They do not claim
that every connector has a live tenant adapter in this repository.

## 3. Implemented Local Architecture

The repository contains the following local components and evidence surfaces:

- `spflow` CLI commands for contract, rule, artifact, evidence, public-data,
  self-improvement, and offline verification checks;
- project contracts and JSON Schemas that define allowed resources, fields,
  operations, evidence, and package shapes;
- a deterministic rule registry with synthetic RED, GREEN, positive-control,
  and mutation fixtures;
- safe package and ZIP adapters that inspect normalized Power Automate
  definitions and final archive bytes without importing or executing them;
- a closed frontend source inventory and AST-based authority profile for the
  executable SharePoint reference;
- Power Automate definition normalization and structural flow validation;
- evidence validation that keeps local, package, runtime-synthetic, tenant, and
  publication claims separate;
- the versioned, connector-agnostic self-improvement registry and its read-only
  audit command;
- public documentation and the repository publication workflow used to place
  reviewed artifacts in GitHub.

These components implement local inspection and validation. They do not create
an HTTP backend, connect to a tenant, rebind connections, enable or execute a
flow, mutate production data, or turn a successful local check into tenant
evidence.

## 4. Backend and Orchestration Model

When an operational backend is used by a real project, the protected path is:

```text
Frontend
  |
  | allowlisted intent
  v
Command Queue
  |
  | identity/capability/scope/state/ETag re-read
  v
Power Automate Flow
  |
  | connector-specific operation
  v
Authoritative Data System
  |
  | native response + semantic readback
  v
Frontend
```

### Typed Command Queue

The default model is a typed command queue:

1. The frontend sends an allowlisted intent, not authoritative business facts.
2. The flow revalidates identity and capability.
3. The flow revalidates scope, target, current state, and the expected
   transition.
4. The flow revalidates the current ETag or equivalent concurrency token when
   the connector supports one.
5. The flow executes one allowlisted mutation through a connector-specific
   operation.
6. The flow records an audit event and performs semantic readback against the
   authoritative system.
7. The frontend reloads the authoritative state and treats the readback as the
   result, not the request body or status token alone.

### Direct Operation Exception

A direct operation is allowed only when all of the following are true:

- the operation is explicitly declared in the project contract;
- fields and payload properties are allowlisted;
- the connector binding and HTTP or native method are validated;
- ETag/`IF-MATCH` or the connector's equivalent concurrency control is used
  when applicable;
- response status is validated before the response body is consumed;
- semantic readback is mandatory;
- retry and idempotency behavior is bounded; and
- no tenant claim is derived from local evidence alone.

Direct operation is an exception to the queue model, not a bypass around
identity, capability, scope, target, concurrency, audit, or readback controls.

## 5. Connector Boundary

| Connector | Current local executable profile | Generalized documentation scope | Tenant runtime evidence |
|---|---|---|---|
| SharePoint | Yes: frontend/resource/ETag/schema/index/permission rules | Yes | `NOT_RUN` |
| Excel | No tenant runtime | Yes: connector-neutral rules | `NOT_RUN` |
| Power Apps | No tenant runtime | Yes: connector-neutral rules | `NOT_RUN` |
| Dataverse | No tenant runtime | Yes: connector-neutral rules | `NOT_RUN` |
| Outlook | No tenant runtime | Yes: connector-neutral rules | `NOT_RUN` |
| Graph | No tenant runtime | Yes: connector-neutral rules | `NOT_RUN` |
| HTTP | Method/status/readback rule model | Yes | `NOT_RUN` |
| SQL | No tenant runtime | Yes: connector-neutral rules | `NOT_RUN` |
| Approvals | Flow/evidence scope | Yes | `NOT_RUN` |
| Future connectors | Contract-driven extension point | Yes | `NOT_RUN` |

The HTTP profile is a rule model for classifying methods, endpoints, status
responses, and readback requirements. It is not a claim that this repository
hosts or operates a tenant HTTP service.

## 6. State Machines

### Command lifecycle

```text
PENDING
  -> CLAIMED
  -> REVALIDATING
  -> EXECUTING
  -> READBACK
  -> SUCCEEDED

PENDING -> FAILED
CLAIMED -> CONFLICT
EXECUTING -> AMBIGUOUS
READBACK -> FAILED
```

`CLAIMED` means one processor owns the command for bounded processing; it does
not mean authorization has succeeded. `REVALIDATING` must reread identity,
capability, scope, target state, and concurrency data. `EXECUTING` is not
success until the mutation response and required audit path are valid.
`AMBIGUOUS` requires reconciliation and must not be blindly replayed.
`SUCCEEDED` requires semantic readback of the expected authoritative state.

### Schema lifecycle

```text
FOUND
MISSING
FAILED
```

`FOUND` cannot create a duplicate object. Only a classified `MISSING` state may
enter a create path. `FAILED` is an error state and never becomes success merely
because a response body looks structurally valid.

### Index lifecycle

```text
READ_CURRENT
  -> NO_OP
  -> REMOVE
  -> ADD
  -> READBACK
```

The desired state is read first. An already-compatible state is a zero-write
`NO_OP`. A change is serialized as remove-before-add, with exact concurrency
controls and readback after each mutation.

### Self-improvement lifecycle

```text
FINDING
  -> CANDIDATE
  -> BLOCKED
  -> CANDIDATE
  -> APPROVED
  -> RETIRED
```

Candidates are sanitized, bound to executable RED/GREEN/positive-control tests,
reviewed independently, and kept blocked until all required gates pass. A
lesson is not a global instruction because a finding or a model-generated text
snippet exists.

## 7. Security and Trust Boundaries

The core trust controls are:

- contract-derived authority for resources, fields, methods, transitions, and
  evidence claims;
- exact origin, site, list, and resource authority for URL-bearing operations;
- connector, method, payload, and mutation authority derived from normalized
  operation structure;
- status-before-body handling so failed responses cannot become authoritative
  data;
- exact ETag/`IF-MATCH` handling and bounded conflict/retry behavior;
- semantic readback after writes and permission-assignment readback for access
  changes;
- index `NO_OP` behavior and serialized remove-before-add changes;
- mutation closure, request digest, and audit requirements;
- closed source inventories, AST checks, package integrity, and ZIP manifests;
- privacy and public-data boundaries across the worktree, history, archives, and
  generated output; and
- a strict separation between local evidence and tenant evidence.

The product boundary explicitly provides:

- no write-capable MCP for tenant or connector operations;
- no public CLI command for tenant mutation;
- no plugin write operation for tenant, flow, permission, or production
  mutation; and
- no local-to-tenant evidence promotion.

Repository-only GitHub publication is a separate, explicitly authorized
release action. It does not provide tenant authority and is not runtime proof
for any connector.

## 8. Evidence Classes

Evidence classes are non-transitive. Each class proves only the observation it
names and cannot silently promote itself to another class.

| Class | Proves | Does not prove |
|---|---|---|
| `LOCAL_STATIC` | Static source, schema, rule, or documentation checks | Runtime behavior, tenant state, or publication |
| `LOCAL_PACKAGE` | Normalized package/ZIP structure, inventory, and integrity | Import, rebind, enablement, or execution |
| `COMPILED_CLI` | Behavior of the compiled local CLI against supplied artifacts | Tenant connectivity or semantic effect |
| `RUNTIME_SYNTHETIC` | Bounded execution against synthetic local inputs | Tenant execution, tenant data, or production readiness |
| `TENANT_READONLY` | An authorized live read at a specific time and target | Mutation, enablement, or future state |
| `TENANT_PREFLIGHT` | A live target discovery/plan/read-only preflight result | Import, rebind, enablement, execution, or mutation |
| `TENANT_IMPORTED` | A recorded import and its required import readback | Rebinding, enablement, execution, or semantic effect |
| `TENANT_REBOUND` | A recorded connection rebinding and its readback | Enablement, execution, or semantic effect |
| `TENANT_ENABLED` | A recorded enabled state and its readback | Successful execution or semantic effect |
| `TENANT_EXECUTED` | A recorded live run/status observation | The intended business effect without semantic readback |
| `TENANT_READBACK` | Native semantic confirmation of the expected authoritative effect | Rollback, production readiness, or unrelated operations |
| `TENANT_MUTATED` | An explicitly authorized tenant mutation with bounded evidence | Production readiness, rollback success, or universal connector support |
| `PUBLISHED` | A repository ref, commit, or PR was written remotely | Merge, tenant execution, or production readiness |
| `PUBLISHED_READBACK` | Remote repository, branch, commit, and PR metadata were reread | Merge, tenant execution, or production readiness |

## 9. Failure and `NOT_RUN` Semantics

`NOT_RUN` is never `PASS`. When an external scanner or tenant gate is
unavailable, the result remains explicitly unavailable; the official scanner
unavailable state is represented by exit `8` and `NOT_RUN` where that gate is
requested. It must never be renamed to a successful result.

The following distinctions are mandatory:

- local GREEN is not tenant GREEN;
- package validation is not import proof;
- import is not execution proof;
- execution is not semantic-effect proof;
- publication is not tenant-readiness proof; and
- a valid-looking response body cannot override a failed response status.

Residual tenant, scanner, rollback, and production gates remain `NOT_RUN` until
their own authorized evidence exists. Historical evidence is not silently
reused as current evidence after the artifact, contract, branch, target, or
environment changes.

## 10. Validation and Publication Flow

The controlled release flow is:

```text
Local implementation
      |
      v
RED/GREEN/positive-control tests
      |
      v
Build and full suite
      |
      v
Privacy/history scanner
      |
      v
Independent review
      |
      v
Commit
      |
      v
GitHub repository readback
      |
      v
Draft PR
      |
      v
Human merge approval
      |
      v
Optional separately authorized tenant test
```

The GitHub publication step proves repository delivery only. A draft PR is not
a merge and a merge is not a tenant test. The current publication status is:

- repository: public;
- PR #1: open and draft;
- merge: not performed;
- tenant test: not run;
- official history-aware scanner: `NOT_RUN`.

## 11. Architecture Status Table

| Area | Status |
|---|---|
| CLI/local validation | `IMPLEMENTED LOCALLY` |
| SharePoint frontend executable profile | `IMPLEMENTED LOCALLY` |
| Generic Power Automate contract model | `IMPLEMENTED/DOCUMENTED` |
| Synthetic connector profiles and trace validator | `IMPLEMENTED LOCALLY` |
| Excel connector runtime | `NOT_RUN` |
| Power Apps connector runtime | `NOT_RUN` |
| Dataverse connector runtime | `NOT_RUN` |
| Outlook/Graph/HTTP/SQL runtime | `NOT_RUN` |
| Tenant import/rebind/enablement | `NOT_RUN` |
| Tenant semantic readback | `NOT_RUN` |
| GitHub publication | `PUBLISHED_READBACK / DRAFT PR` |
| Production readiness | `NOT_RUN` |

The status table is intentionally conservative. It describes the current
evidence boundary and does not claim that all documented connectors already
work in a tenant.

## 12. Connector Profile Runtime Semantics (WP19)

The local kit now validates synthetic connector profiles without opening a network
connection. Each profile in
`examples/minimal-public-app/connectors/` binds a connector, synthetic target,
operation kind, transport method/action, request allowlist, response status
classes, semantic readback fields, concurrency mode, retry policy, idempotency,
and mutation closure. The registered adapter also binds connection kind, native
operation catalog, permission/readback role, pagination mode, and payload policy.

```text
profile JSON
    |
    v
AJV schema validation
    |
    v
semantic operation validation
    |
    +--> request allowlist/forbidden fields
    +--> method versus read/mutation class
    +--> success/failure status separation
    +--> concurrency token requirements
    +--> bounded retry and ambiguous mutation handling
    +--> idempotency keys
    +--> plan/status/audit/readback mutation closure
    |
    v
synthetic response trace
    |
    v
status-before-body, semantic readback field equality, and result
```

The command is:

```powershell
node packages/cli/dist/bin/spflow.js validate connector <profile> --format text
```

The WP19 profiles cover SharePoint, Excel, Power Apps, Dataverse, Outlook,
Graph, HTTP, SQL, and approvals. The synthetic payload, permission, pagination,
and response harnesses prove only local static/compiled CLI and synthetic trace
behavior. They do not prove connector installation, connection
ownership, tenant permissions, flow import, execution, mutation, or tenant
semantic effect.
