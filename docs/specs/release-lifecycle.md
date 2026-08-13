# Release Lifecycle Specification

## 1. Purpose

This specification defines the only allowed progression from local engineering to public toolkit release or tenant application release. Each stage has separate evidence and authorization. Skipping a stage or inferring it from another stage is forbidden.

## 2. Lifecycle States

```text
DRAFT
  -> LOCAL_STATIC
  -> LOCAL_RUNTIME
  -> PACKAGE_ARTIFACT
  -> READY_FOR_DISABLED_IMPORT_REVIEW
  -> IMPORTED
  -> REBOUND
  -> ENABLED
  -> LIVE_SMOKE
  -> TENANT_VERIFIED
  -> PUBLISHED
```

The public toolkit normally stops at a code-host `PUBLISHED` claim backed by local/package/repository evidence. Tenant states apply only to a separately authorized application target.

## 3. Stage Gates

### 3.1 `DRAFT`

Required:

- approved project contract proposal;
- synthetic-only design;
- selected supported package profile;
- explicit data classification;
- identified reviewer roles.

No readiness claim is allowed.

### 3.2 `LOCAL_STATIC`

Required:

- JSON Schemas valid;
- project contract valid;
- rule catalog and fixture structure valid;
- cross-layer ArtifactGraph consistency;
- documentation consistency;
- public-data scan of source tree.

### 3.3 `LOCAL_RUNTIME`

Required:

- unit, integration, rule, mutation, and adversarial local tests executed;
- each work package has observed RED, GREEN, and REFACTOR evidence;
- deterministic rerun produces equivalent normalized output;
- no network used by offline tests.

### 3.4 `PACKAGE_ARTIFACT`

Required:

- generated definition inspected;
- final ZIP reopened and parsed;
- native envelope, action graph, WDL, connectors, connection references, limits, retries, idempotency, pagination, ACL contract, and destructive gates validated;
- manifest recomputed from exact final files;
- release archive and nested content pass public-data scan.

This stage supports only `READY_FOR_DISABLED_IMPORT_REVIEW`.

### 3.5 `READY_FOR_DISABLED_IMPORT_REVIEW`

Required:

- gates `R0` through `R7` approved;
- exact artifact digest selected;
- target binding exists outside the public repository;
- import, rollback, and smoke plans approved;
- imports configured to remain disabled;
- no tenant operation has started.

### 3.6 `IMPORTED`

Required tenant-only evidence:

- explicit change authorization;
- exact artifact imported into exact target;
- import result and solution/flow inventory read back;
- every imported flow confirmed disabled;
- artifact identity matches approved digest or platform-derived identity mapping.

An import response without readback is insufficient.

### 3.7 `REBOUND`

Required tenant-only evidence:

- each declared connection reference mapped to the approved target connection;
- environment/list/mailbox bindings resolved;
- authenticated readback confirms mappings;
- minimum privilege reviewed;
- no implicit personal connection remains.

### 3.8 `ENABLED`

Required tenant-only evidence:

- downstream consumers enabled before upstream producers;
- mutually exclusive processors checked;
- exact enabled state read back;
- trigger concurrency and recurrence settings read back;
- rollback trigger is ready.

The default enable order is consumer-before-producer. A project contract MUST define the exact order.

### 3.9 `LIVE_SMOKE`

Required tenant-only evidence:

- synthetic or approved canary input;
- controlled trigger;
- expected command claim, authorization, transition, audit, and semantic readback;
- no duplicate effect;
- failure-path or rollback assertion where required;
- exact run and effect linked in one change window.

Run `Succeeded` without semantic effect is a failure.

### 3.10 `TENANT_VERIFIED`

Required:

- schema, internal names, indexes, views, effective permissions, flow state, bindings, command processing, direct-patch exceptions, pagination, idempotency, concurrency, and all contract-required scenarios read back;
- independent gate `R8` approval;
- no unresolved blocking diagnostic.

### 3.11 `PUBLISHED`

Required:

- explicit publication authority and license;
- exact target and artifact;
- current evidence chain;
- public-data and Git-history scan;
- independent `R9` approval;
- publication readback.

A synchronized folder or local copy is not publication.

## 4. Preflight, Apply, Readback Separation

Every tenant change uses three separately recorded actions:

1. **Preflight:** authenticated read-only discovery, deterministic plan, zero writes.
2. **Apply:** separately authorized execution of the exact plan digest within limits.
3. **Readback:** authenticated semantic verification of resulting state.

Preflight authorization does not authorize Apply. Apply output does not replace Readback. Apply/readback 404 is strict failure.

## 5. Import Safety

- Import is always disabled.
- Rebind occurs before enablement.
- Readback occurs after each stage.
- A producer is not enabled before its consumer.
- Two processors for the same command type cannot be active.
- Frontend publication occurs after backend readback and smoke.
- A failed stage stops progression and triggers the approved rollback or containment plan.

## 6. Destructive Change Window

Before a destructive Apply:

- plan is dry-run generated and canonicalized;
- exact plan digest is approved;
- target, operation, item, and write bounds are fixed;
- ETags/state are recent and re-read;
- execution is serial where ordering matters;
- readback occurs per bounded unit;
- stop-on-unexpected is active;
- rollback/compensation and owner are identified;
- evidence store is ready.

Index remediation additionally requires remove-before-add and compatible-state no-op.

## 7. Rollback and Containment

Rollback is stage-specific:

| Stage | Required containment |
|---|---|
| Import | Keep disabled; remove only under separate approval |
| Rebind | Restore approved bindings or keep disabled |
| Enable | Disable upstream producer first, then consumers as planned |
| Smoke | Stop triggers, preserve evidence, reconcile ambiguous effects |
| Frontend publish | Restore previous exact artifact and read back |
| Data mutation | Execute approved compensation; never blind replay |

Rollback success requires readback and its own evidence record.

## 8. CI Gates for Public Toolkit

Pull requests MUST run:

```text
npm ci
npm run build
npm test
npm run verify
```

`npm run verify` MUST resolve to:

```text
spflow verify --root . --offline --format json
```

Release CI additionally performs:

- clean checkout verification;
- deterministic rebuild comparison;
- final ZIP reopen and manifest recomputation;
- recursive public-data scan;
- Git-history scan;
- dependency/license review;
- provenance/attestation generation;
- independent release checklist approval.

CI has no tenant credentials for core validation.

## 9. Optional Plugin and MCP Gates

### Codex plugin

May begin only after core `LOCAL_STATIC`, `LOCAL_RUNTIME`, `PACKAGE_ARTIFACT`, clean-context adversarial build, and independent `R7` review pass. Plugin verification calls the same `spflow` binary and cannot suppress diagnostics.

### Read-only MCP

May be specified only after a separately authorized tenant pilot. It requires its own threat model, minimum-scope identity, operation allowlist, redaction tests, audit, rate limits, and `R5-R9` reviews. It has no mutation/import/enable/trigger tools.

## 10. Failure Semantics

- Timeout or slow execution is not automatically a RED. The operation remains `PENDING` until its process state, checkpoint, or output is inspected.
- A worker without a final response is not assumed failed; the coordinator requests a checkpoint before deciding.
- Validation failure is recorded with exact command, artifact, diagnostic, and evidence class.
- A partial pass cannot be promoted to the next lifecycle stage.

