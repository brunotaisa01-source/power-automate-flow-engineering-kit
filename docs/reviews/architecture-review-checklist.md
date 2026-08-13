# Architecture Review Checklist

## 1. Review Decision

No implementation worker may start until this document set receives an explicit coordinator decision:

```text
Decision: APPROVED_FOR_IMPLEMENTATION | CHANGES_REQUIRED | REJECTED
Reviewed document revision: <Git commit or immutable document-set digest>
Reviewer roles: Product, Architecture, Security, Data/IP
Open publication gates: <gate IDs only>
```

`APPROVED_FOR_IMPLEMENTATION` authorizes work packages only. It does not authorize public publication, tenant access, import, rebind, enablement, trigger, mutation, or MCP development.

## 2. Document-Set Completeness

- [ ] `ADR-0001-product-boundary.md` fixes the core/plugin/MCP boundary.
- [ ] `system-architecture.md` defines components, ArtifactGraph, CLI, diagnostics, and exit statuses.
- [ ] `threat-model.md` covers browser, flow, package, evidence, tenant, and public-data boundaries.
- [ ] `project-contract.md` defines exact root and nested JSON fields.
- [ ] `end-to-end-contract.md` defines read, command, direct-patch, mutation, audit, and readback protocols.
- [ ] `sharepoint-schema-acl.md` defines field, index, view, permission, Preflight, Apply, and Readback rules.
- [ ] `flow-definition-package.md` defines native ZIP, graph, WDL, connector, connection, retry, and final-artifact checks.
- [ ] `rule-model.md` contains every required public rule ID and fixture acceptance contract.
- [ ] `evidence-model.md` prevents unsupported claim promotion.
- [ ] `release-lifecycle.md` separates every local and tenant stage.
- [ ] `sanitization-policy.md` defines synthetic-only release and external binding handling.
- [ ] The implementation plan maps every normative requirement to a work package and test.
- [ ] No document contains unfinished-work markers or an unresolved technical placeholder presented as an implementation requirement.

## 3. Pre-Implementation Architecture Gate

The following are blocking before the first implementation worker:

- [ ] Product is an agent-neutral core with optional plugin after core validation.
- [ ] MCP is deferred, read-only, authenticated, separately reviewed, and contains no write tools.
- [ ] Typed command queue is the default protected write model.
- [ ] Direct patch is limited to contract-declared `clientEditable` fields.
- [ ] Server authority re-reads identity, capability, scope, target state, business values, and exact ETag.
- [ ] Digest per transaction, exact `IF-MATCH`, HTTP 412 handling, GET reconciliation, and semantic readback are mandatory.
- [ ] Package validation covers the exact final ZIP, not only source/build output.
- [ ] Local and tenant claim classes are unambiguous.
- [ ] Public data is synthetic-only and environment values stay outside the repository.
- [ ] License selection/publication authority is assigned to `R0`; it may remain open only while the repository is private and unpublished.
- [ ] Global verification command and exit-status contract are fixed.
- [ ] Reviewer records `APPROVED_FOR_IMPLEMENTATION` against an immutable revision.

## 4. Review Gates

### R0: Legal, Data, and Publication Authority

Reviewer: authorized data/IP owner independent from implementation.

- [ ] Public ownership and publication authority are confirmed.
- [ ] A public license is selected and compatible with dependencies and contributions.
- [ ] Only reconstructed synthetic content is included.
- [ ] Private source, package, evidence, identity, and environment data are excluded.
- [ ] Private deny-term configuration remains outside the repository.
- [ ] Human privacy/IP review is recorded.

Blocking: uncertain ownership, no license at publication time, any prohibited data, or unreviewed copied code.

### R1: Product and State Model

Reviewer: product/domain reviewer.

- [ ] Actors, lists, states, commands, capabilities, and scopes are explicit.
- [ ] Every transition has one command, capability, guard set, and semantic readback.
- [ ] Protected and client-editable fields are unambiguous.
- [ ] Status values match contract, schema, frontend, flow, fixtures, and docs.
- [ ] Pagination semantics cover complete-set operations.

Blocking: ambiguous authority, state, write model, or completion condition.

### R2: Contract and SharePoint Schema

Reviewer: SharePoint contract reviewer.

- [ ] JSON Schemas reject unknown fields and invalid cross-references.
- [ ] Internal names are discovered/read back, not assumed.
- [ ] Field types, DateTime modes, choices, lookups, indexes, and views match all projections.
- [ ] Default index budget and profile exception are explicit.
- [ ] Index remediation is serial remove-before-add and compatible state is no-op.
- [ ] Permission matrix and effective-permission probes are defined.
- [ ] Semantic 400 and phase-sensitive 404 rules are exact.

Blocking: schema drift, permissive missing-object classification, unsafe provisioning, or missing permission contract.

### R3: Frontend Transport and Concurrency

Reviewer: frontend/application security reviewer.

- [ ] No secret or application credential exists in frontend artifacts.
- [ ] Reads and writes use field allowlists.
- [ ] OData is escaped and encoded structurally.
- [ ] Continuation links are exhausted with same-origin/loop guards.
- [ ] Browser cannot mutate protected state directly.
- [ ] Direct patch uses explicit Save, transaction digest, minimal patch, `POST` plus override, exact ETag, 412 conflict, reconciliation GET, and semantic readback.
- [ ] Concurrent Save tests prove separate digests.

Blocking: protected client write, client actor authority, wildcard ETag, shared digest, blind retry, or partial pagination.

### R4: Power Automate Definition and Package

Reviewer: Power Automate/package specialist.

- [ ] Native solution envelope and exact inventory are validated.
- [ ] Archive safety limits are enforced before extraction.
- [ ] Action graph has valid transitive `runAfter` reachability and no cycle.
- [ ] Authorization and readback cannot be bypassed.
- [ ] WDL parses and JSON interpolation is safe.
- [ ] Connector methods, typed payloads, URI construction, and connection references are valid.
- [ ] `Terminate` has no loop ancestry.
- [ ] Action budget, concurrency, idempotency, retry, and destructive gates are validated.
- [ ] Final ZIP definition is inspected independently.

Blocking: invalid package, unreachable security branch, unsafe expression, missing connection, unsafe retry, or source-only GREEN.

### R5: Security and Threat Model

Reviewer: independent security reviewer.

- [ ] Threat model covers tampering, spoofing, replay, stale writes, package substitution, evidence promotion, and data leakage.
- [ ] Least privilege is encoded in list, flow, operator, plugin, and MCP boundaries.
- [ ] Authenticated server identity, capability, and scope are required.
- [ ] Command claim and one-processor invariants are enforced.
- [ ] Destructive operations require dry run, plan digest, bounds, approval, and readback.
- [ ] Error and evidence output is redacted.
- [ ] MCP roadmap is read-only and separately gated.

Blocking: client trust, excessive privilege, secret exposure, unbounded mutation, or write-capable MCP.

### R6: Rule and RED/GREEN Quality

Reviewer: test/rule reviewer who did not write the detector.

- [ ] Rule has catalog JSON and canonical fixture layout.
- [ ] RED fails with the exact diagnostic and pointer.
- [ ] GREEN and positive control pass.
- [ ] Mutation of GREEN reintroduces the diagnostic.
- [ ] Detector does not merely match fixture filename or fixed text.
- [ ] Generated definition and final artifact are tested where required.
- [ ] Remediation and residual tenant gate are accurate.
- [ ] REFACTOR rerun preserves behavior and deterministic output.

Blocking: no observed RED, overfit detector, missing final-artifact test, or unsupported claim.

### R7: Artifact and Offline Release

Reviewer: independent release reviewer.

- [ ] Clean checkout uses lockfile and supported runtime.
- [ ] Build, tests, and global offline verification are run fresh.
- [ ] Exact final ZIPs are reopened and parsed.
- [ ] Manifest is recomputed from exact bytes.
- [ ] Working tree, generated output, nested archives, and history pass public-data scan.
- [ ] Deterministic rebuild comparison passes.
- [ ] Evidence records bind exact contract and artifact digests.
- [ ] No tenant claim is inferred.

Blocking: stale manifest, dirty/unreproducible build, leakage, or missing independent review.

### R8: Tenant Verification

Reviewer: authorized tenant reviewer independent from Apply operator where possible.

- [ ] Preflight was read-only and produced a bounded plan.
- [ ] Apply was separately authorized for the exact plan digest.
- [ ] Import remained disabled until rebind readback.
- [ ] Connection references and environment bindings were read back.
- [ ] Consumer-before-producer enable order and exclusivity were verified.
- [ ] Schema, ACL, effective permissions, flows, concurrency, and states were read back.
- [ ] Controlled smoke includes semantic effect and audit readback.
- [ ] Failure/rollback or compensation was verified where required.

Blocking: missing authorization, wrong target, no semantic readback, or mixed change-window evidence.

### R9: Independent Publication Review

Reviewer: final reviewer who is not the sole author or Apply operator.

- [ ] `R0-R7` pass for public toolkit release; `R8` passes only when a tenant claim is part of release scope.
- [ ] Exact release artifact and target are identified.
- [ ] License, notices, contribution, security, and data policies are present.
- [ ] Public-data and history scans are fresh.
- [ ] Release evidence contains no private values.
- [ ] Publication readback confirms the intended artifact is visible.
- [ ] Release notes state local-only and tenant-only limits accurately.

Blocking: author-only approval, stale evidence, private data, or publication claim without readback.

## 5. Rule Coverage Audit

Reviewer MUST find each ID in the catalog, plan, tests, and global verification inventory:

```text
PKG-NATIVE-001 PA-LIMIT-001 SP-AUTHZ-001 SP-ACL-001
RELEASE-EVIDENCE-001 PA-EXPRESSION-001 APP-SAVE-001
PA-CONNECTOR-001 SP-SCHEMA-001 SP-SCHEMA-002 PA-SCOPE-001
SP-ODATA-001 SP-SCHEMA-003 PKG-INTEGRITY-001
META-CONSISTENCY-001 META-CONSISTENCY-002 HTTP-SEMANTIC-001
HTTP-SEMANTIC-002 SP-INDEX-001 SP-INDEX-002
META-CONSISTENCY-003 RELEASE-EVIDENCE-002 FLOW-RETRY-001
FLOW-STATUS-001 APP-PAGINATION-001 FLOW-DESTRUCTIVE-001
SP-AUTHZ-002 DATA-PUBLIC-001 PKG-ARCHIVE-001 PA-GRAPH-001
PA-GRAPH-002 PA-WDL-001 PA-CONNECTION-001
FLOW-IDEMPOTENCY-001 SP-ACL-002 DATA-PUBLIC-002
```

## 6. Decision Record

```text
Gate:
Decision: APPROVED | REJECTED | PENDING
Reviewed revision/digest:
Reviewer role:
Evidence IDs:
Blocking findings:
Residual gates:
Decision time (UTC):
```

A slow command or worker timeout remains `PENDING`; reviewers request a checkpoint and inspect process/output before classifying failure.
