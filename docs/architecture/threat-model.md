# Threat Model

## 1. Scope

This threat model covers the public toolkit, generated browser applications, SharePoint Lists, Power Automate flows, exported flow ZIPs, evidence records, optional skills/plugin packaging, and a future read-only MCP. It excludes the security of the Microsoft 365 platform itself and any write-capable MCP, which is prohibited by the product boundary.

## 2. Security Objectives

1. Prevent an untrusted browser from granting authority or mutating protected state.
2. Prevent stale, duplicate, replayed, or ambiguous writes from silently changing state.
3. Prevent malformed or substituted flow packages from reaching import review.
4. Prevent local evidence from being promoted into tenant claims.
5. Prevent private data, credentials, tenant metadata, and proprietary artifacts from entering the public repository or releases.
6. Preserve least privilege, traceability, deterministic validation, and explicit human authorization for tenant changes.

## 3. Assets

- SharePoint business records and protected fields
- Authenticated user identity, capability, and scope
- Exact item ETags and state-machine transitions
- Command and audit integrity
- Power Automate definitions, connection references, and package inventory
- Release manifests and evidence claims
- Tenant URLs, identifiers, messages, attachments, and credentials
- Public repository integrity and consumer trust

## 4. Actors

| Actor | Trust level | Allowed authority |
|---|---|---|
| Browser user | Authenticated but input is untrusted | Read allowlisted data; append typed commands; patch explicitly client-editable fields |
| Power Automate processor | Privileged service path | Claim command, authorize, mutate allowlisted state, audit, read back |
| Release operator | Human-authorized | Import disabled, rebind, enable, smoke, rollback within approved plan |
| Toolkit CLI | Local read-only | Parse and validate files; never access tenant by default |
| Reviewer | Independent control | Approve or reject evidence at assigned gate |
| Future read-only MCP | Authenticated read adapter | Discovery and readback from an operation allowlist only |
| Adversary | Untrusted | May tamper with browser requests, artifacts, ZIPs, evidence, or repository content |

## 5. Trust Boundaries and Data Flows

### TB-1: Browser to SharePoint

Threats: actor spoofing, business-value tampering, OData injection, direct protected writes, stale ETag overwrite, unsafe retry, cross-origin continuation.

Controls:

- server system identity is re-read and client actor fields are trace-only;
- typed command schemas reject undeclared fields;
- protected fields cannot be patched from the browser;
- OData literals and parameters are encoded;
- Save, OData, and pagination use separate exact contract-bound endpoint grammars;
- continuation URLs must be same-origin, exact-list, and site-path constrained;
- `/fields`, `/items`, extra descendants, traversal, encoded separators, and resource substitutions fail before fetch;
- digest is acquired per transaction;
- exact `IF-MATCH` is mandatory;
- HTTP 412 is surfaced as conflict;
- ambiguous writes use GET reconciliation only.

### TB-2: Command list to flow processor

Threats: duplicate triggers, two processors, unauthorized command, stale target, status spoofing, poisoned payload, partial execution.

Controls:

- deterministic idempotency key and `0/1/many` cardinality handling;
- atomic command claim and single active processor contract;
- server re-read of identity, capability, scope, target state, business values, and ETag;
- strict command type and payload allowlists;
- one allowed transition per command;
- append-only audit and semantic post-mutation readback;
- command becomes `Succeeded` only after verified effect.

### TB-3: Builder to final ZIP

Threats: stale generated definition, envelope mismatch, action graph drift, substituted file, path traversal, ZIP bomb, nested private artifact, stale manifest.

Controls:

- validate builder source, generated definition, and final ZIP independently;
- reopen final ZIP and compare normalized inventory with package profile;
- verify transitive `runAfter` reachability, cycles, scope ancestry, WDL, connectors, and connection references;
- reject unsafe archive paths, links, duplicates, excessive entries, sizes, nesting, or compression ratios;
- recursively scan nested archives for private data;
- recompute manifest digests from exact release files.

### TB-4: Local evidence to tenant release

Threats: claiming tenant readiness from local tests, saved flow, import response, run status, synchronized folder, or old evidence.

Controls:

- evidence classes have a non-transitive claim matrix;
- exact artifact digests and subject IDs bind evidence to artifacts;
- imported, rebound, enabled, live-smoke, tenant-verified, and published claims require separate records;
- successful run status requires semantic readback;
- evidence expiration and environment binding prevent reuse across change windows.

### TB-5: Private environment to public repository

Threats: real email, URL, tenant metadata, personal identity, message content, attachment, hash, spreadsheet, ZIP, screenshot, source path, secret, or copied private code enters Git history.

Controls:

- public allowlist uses placeholders and reserved synthetic domains;
- environment values live outside the repository and are explicitly supplied at runtime;
- working tree, staged files, history, generated output, release archives, and nested archives are scanned;
- binary types are denied unless explicitly generated and proven synthetic;
- release requires independent privacy and intellectual-property review.

### TB-6: New finding to global self-improvement registry

Threats: private runtime leakage, token-only lessons, candidate promotion without
review, connector-specific lessons being hidden by a SharePoint-only scope, or an
MCP gaining write authority.

Controls:

- sanitize every candidate and retain only repository-relative synthetic data;
- bind RED, GREEN, and structurally independent positive-control tests to real files;
- run `spflow learn audit` automatically in offline verification;
- require independent review and privacy/history gates before `APPROVED`;
- make the registry append/versioned and keep candidates blocked;
- expose only registry read operations through a future plugin/read-only MCP.

## 6. Threat Register

| ID | Threat | Impact | Required control and validator |
|---|---|---|---|
| `T-001` | Client-provided actor grants authority | Unauthorized mutation | `SP-AUTHZ-002`; server identity only |
| `T-002` | Client controls amount, owner, or status | Business tampering | `SP-AUTHZ-001`; server-authoritative reread |
| `T-003` | Missing capability scope | Over-broad access | `SP-ACL-001`; capability plus scope |
| `T-004` | Stale ETag overwrite | Lost update | exact `IF-MATCH`, `APP-SAVE-001`, HTTP 412 path |
| `T-005` | Blind retry after ambiguous write | Duplicate mutation | `FLOW-RETRY-001`; GET reconciliation |
| `T-006` | Duplicate trigger or empty idempotency key | Duplicate record/effect | `FLOW-IDEMPOTENCY-001`; `0/1/many` handling |
| `T-007` | Flow says succeeded without effect | False completion | `FLOW-STATUS-001`; semantic readback |
| `T-008` | Unsafe JSON interpolation | Definition corruption/injection | `PA-EXPRESSION-001`; expression-safe serialization |
| `T-009` | Unreachable or cyclic action graph | Skipped security branch | `PA-GRAPH-001` and `PA-GRAPH-002` |
| `T-010` | Terminate inside loop | Invalid or partial flow behavior | `PA-SCOPE-001` |
| `T-011` | Wrong connector method shape | Import/runtime failure | `PA-CONNECTOR-001` |
| `T-012` | Missing connection reference | Wrong or broken binding | `PA-CONNECTION-001` |
| `T-013` | Malicious archive | Local compromise/resource exhaustion | `PKG-ARCHIVE-001` |
| `T-014` | Package or manifest substitution | Unreviewed artifact import | `PKG-NATIVE-001`, `PKG-INTEGRITY-001` |
| `T-015` | Partial pagination | Incorrect KPI/export/authorization decision | `APP-PAGINATION-001` |
| `T-016` | Unbounded destructive operation | Large-scale data loss | `FLOW-DESTRUCTIVE-001` |
| `T-017` | Local claim promoted to tenant verified | Unsafe release | `RELEASE-EVIDENCE-001`, `RELEASE-EVIDENCE-002` |
| `T-018` | Private data in repository or archive | Confidentiality/IP breach | `DATA-PUBLIC-001`, `DATA-PUBLIC-002` |
| `T-019` | Generic list-prefix accepts wrong operation resource | Unauthorized read/write or false authority | Operation-specific endpoint grammars, pre-normalization traversal rejection, no-fetch adversarial tests |
| `T-020` | Unreviewed or private self-learning lesson reaches future AI | Cross-project false authority or data leakage | Connector-agnostic registry schema, executable bindings, candidate gate, privacy scrub, independent review, read-only integration |

## 7. Destructive Operation Controls

Any tenant mutation classified as destructive requires all of the following before execution:

- read-only dry run producing an ordered plan;
- explicit target and operation allowlist;
- exact plan digest approved by a human;
- maximum item and write limits;
- recent ETags or equivalent concurrency controls;
- serial execution unless a reviewed contract states otherwise;
- stop-on-first-unexpected-result;
- semantic readback after each bounded unit;
- rollback or compensation procedure;
- separate authorization for Apply after Preflight.

Index remediation has an additional invariant: remove obsolete indexes serially before adding new indexes, and perform no write when current state is already compatible.

## 8. HTTP Classification Security Rules

- HTTP 400 is `MISSING_OBJECT` only when the structured platform error identifies the missing-column signature. All other HTTP 400 responses are `GET_FAILED`.
- HTTP 404 may be `CREATE_MISSING` only for an explicitly declared initial Preflight GET. Apply and readback 404 responses are strict failures.
- Classifiers inspect structured code and normalized semantic message. Status code alone is never sufficient.
- Error logs redact tenant URLs, identifiers, payloads, and connector tokens.

## 9. Minimum Privilege

- Frontend: no secrets, no application credential, no broad write capability.
- Processor: only required lists, fields, mailboxes, actions, and environments.
- Connection references: declared and read back; no implicit personal connection.
- Release operator: temporary and task-specific privileges where supported.
- MCP: read-only scopes and operation allowlist; no mutation tools.
- Audit readers: separate from mutation authority where practicable.

## 10. Security Verification

The global offline gate must include:

```text
spflow verify --root . --offline --format json
```

Required adversarial cases include actor spoofing, protected-value tampering, stale ETag, duplicate commands, ambiguous writes, malformed WDL, unreachable authorization actions, unsafe ZIP paths, nested archives, stale manifests, first-page-only results, unsupported evidence promotion, and seeded private identifiers.

Tenant-only tests require separate authorization: effective permission probes, separate-user capability tests, import-disabled readback, connection rebind readback, enablement readback, controlled mutation, fault-injected retry, semantic effect verification, and rollback rehearsal.

## 11. Residual Risks

- Platform behavior can change after local package validation.
- Effective permissions and connector ownership are tenant-specific.
- Static analysis cannot prove every runtime branch or external service behavior.
- A read-only MCP still handles sensitive metadata and requires its own security review.
- Human reviewers can approve the wrong target; exact target binding and readback reduce but do not eliminate this risk.

No residual risk permits promotion of a local claim to a tenant claim.

