# Power Automate Flow Engineering Kit Implementation Plan

> **For agentic workers:** Execute only the assigned work package. Do not create or coordinate subagents. Use the mandatory RED -> GREEN -> REFACTOR cycle, emit checkpoints, and stop at the package review gate. The coordinator assigns a fresh worker to each accepted package.

**Goal:** Build a public, agent-neutral toolkit that lets an AI or engineer design, validate, package, review, and safely release connector-neutral Power Automate and Power Platform applications without repeating known failures. SharePoint Lists and Power Automate remain the current executable reference profile, not the product limit.

**Architecture:** A TypeScript/Node offline core normalizes contracts, definitions, ZIPs, manifests, documentation, and evidence into one `ArtifactGraph`. Stable rule detectors validate synthetic RED/GREEN fixtures and exact final artifacts. Skills and an optional later Codex plugin invoke the same CLI; tenant connectivity is deferred to a separately authorized read-only MCP phase.

**Tech Stack:** Node.js 22.x, npm 10.x, TypeScript strict ESM, Node `node:test`, Ajv draft 2020-12, lazy safe ZIP parsing, GitHub Actions.

## Global Constraints

- No implementation begins until `docs/reviews/architecture-review-checklist.md` records `APPROVED_FOR_IMPLEMENTATION` against an immutable revision.
- All repository content, diagnostics, examples, and generated fixtures are English and synthetic-only.
- The default protected write model is typed command queue. Direct patch is an explicit `clientEditable` exception.
- The public core and `spflow verify --offline` perform no network request and no tenant mutation.
- Every work package uses observed RED, GREEN, and REFACTOR phases with fresh command output.
- Source, generated definition, final ZIP, manifest, docs, and evidence are separate validation layers.
- Local evidence never proves import, rebind, enablement, execution, semantic effect, tenant verification, or publication.
- MCP is not part of core implementation; any future MCP is authenticated read-only and separately approved.
- A worker does not spawn workers. The coordinator alone assigns work and review.
- Slow execution or timeout is `PENDING`, not `FAIL`, until checkpoint/process/output inspection.

---

## 1. Target Repository Map

```text
sharepoint-flow-engineering-kit/
|-- README.md                         # Product entry point and claim boundaries
|-- AGENTS.md                         # Agent workflow and global constraints
|-- SECURITY.md                       # Vulnerability reporting and security boundary
|-- CONTRIBUTING.md                   # RED/GREEN/REFACTOR contribution process
|-- LICENSE                           # Selected at R0
|-- package.json                      # Workspace scripts and runtime constraints
|-- package-lock.json                 # Exact dependency authority
|-- tsconfig.json                     # Strict shared TypeScript config
|-- project.contract.json             # Synthetic reference project root contract
|-- contracts/                        # Draft 2020-12 JSON Schemas
|-- rules/catalog/                    # One machine-readable file per rule ID
|-- fixtures/rules/                   # Canonical RED/GREEN/control/mutation corpus
|-- packages/core/                    # Types, canonicalization, schemas, ArtifactGraph
|-- packages/cli/                     # spflow command shell and exit codes
|-- packages/package-adapters/        # Safe ZIP and Power Platform solution parser
|-- packages/rules/                   # Rule detectors only
|-- templates/                        # Synthetic app/flow starter contracts
|-- examples/synthetic-case-workbench/# Complete offline reference app
|-- skills/                           # Model-neutral workflows invoking spflow
|-- tests/                            # Unit, rules, artifacts, integration, adversarial
|-- evidence/                         # Synthetic examples and local release evidence
|-- artifacts/                        # Deterministically generated public artifacts
`-- .github/workflows/                # Pull request and release gates
```

## 2. Stable Interfaces

These signatures are fixed before parallel implementation:

```ts
export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ValidationContext {
  root: string;
  offline: boolean;
  contract: ProjectContract;
  graph: ArtifactGraph;
}

export interface RuleDetector {
  readonly id: string;
  validate(context: ValidationContext): Promise<Diagnostic[]>;
}

export interface PackageAdapter {
  readonly profile: string;
  inspect(path: string, limits: ArchiveLimits): Promise<PackageInspection>;
}

export interface CommandHandler {
  run(args: readonly string[]): Promise<CommandReport>;
}
```

No work package changes these interfaces without a contract revision and `R2` review.

## 3. Global Commands and Exit Contract

Root scripts:

```json
{
  "scripts": {
    "build": "tsc -b",
    "test": "tsx --test tests/**/*.test.ts",
    "verify": "npm run build && node packages/cli/dist/bin/spflow.js verify --root . --offline --format json",
    "scan:public": "node packages/cli/dist/bin/spflow.js scan public-data . --history --format json"
  }
}
```

Exit statuses are fixed:

| Code | Meaning |
|---:|---|
| `0` | Requested applicable checks passed |
| `1` | Rule or consistency violation |
| `2` | Invalid invocation/configuration |
| `3` | Unsupported contract/package profile |
| `4` | Unsafe archive |
| `5` | Public-data violation |
| `6` | Evidence claim violation |
| `7` | Internal CLI error |
| `8` | Explicitly requested external gate unavailable/unauthorized |

Offline tenant residual gates are `NOT_RUN` and do not produce exit `8`.

---

## WP-00: Governance and Architecture Approval

**Classification:** Sequential, coordinator/human gate, no implementation worker.

**Files:**

- Review: `docs/architecture/*.md`
- Review: `docs/specs/*.md`
- Review: `docs/reviews/architecture-review-checklist.md`
- Review: this plan
- Create after decision: `docs/reviews/architecture-approval.json`

**Produces:** Immutable `APPROVED_FOR_IMPLEMENTATION`, reviewer roles, open R0 items, and scope boundary.

### RED

- [ ] Validate that the current review record is absent or pending.
- [ ] Record unresolved publication license/authority as an R0 blocker, not an assumed choice.
- [ ] Run a manual requirement trace against every non-negotiable security requirement and every required rule ID.
- [ ] Expected RED: implementation is not authorized until an immutable review decision exists.

### GREEN

- [ ] Product, architecture, SharePoint, flow, security, data/IP, and test reviewers inspect the exact document set.
- [ ] Resolve technical ambiguities in the normative specs; do not defer them to workers.
- [ ] Create `architecture-approval.json` with schema version, document-set digest, decision, reviewer roles, blocking findings, residual publication gates, and UTC decision time.
- [ ] Validate the record against `docs/reviews/architecture-review-checklist.md`.
- [ ] Expected GREEN: decision is `APPROVED_FOR_IMPLEMENTATION`; public publication can remain blocked by explicit R0 license authority while work remains private.

### REFACTOR

- [ ] Consolidate duplicate wording without weakening requirements.
- [ ] Recompute document-set digest after any edit and repeat review.
- [ ] Coordinator signs the final revision and opens WP-01 only.

**Gate:** Architecture approval. No code worker before this gate.

---

## WP-01: Repository Foundation and JSON Schemas

**Classification:** Sequential.

**Files:**

- Create: `package.json`, `package-lock.json`, `tsconfig.json`
- Create: `contracts/project-contract.schema.json`
- Create: `contracts/sharepoint-schema.schema.json`
- Create: `contracts/flow-contract.schema.json`
- Create: `contracts/package-profile.schema.json`
- Create: `contracts/rule.schema.json`
- Create: `contracts/evidence.schema.json`
- Create: `packages/core/package.json`
- Create: `packages/core/src/types/*.ts`
- Create: `packages/core/src/schema-loader.ts`
- Test: `tests/unit/contracts/*.test.ts`

**Consumes:** Exact fields in all normative specs.

**Produces:** `loadSchema(name)`, `validateProjectContract(value)`, shared TypeScript types, and exact dependency lockfile.

### RED

- [ ] Add a test that each schema rejects unknown root and nested properties.
- [ ] Add cross-reference fixtures with missing list, field, state, capability, flow, package, and binding IDs.
- [ ] Add a valid full synthetic contract fixture.
- [ ] Run `npm test -- --test-name-pattern="contract schema"`.
- [ ] Expected RED: imports/functions are absent and invalid contracts are not rejected.

### GREEN

- [ ] Pin exact development/runtime dependencies in `package-lock.json`; use Ajv draft 2020-12 and strict mode.
- [ ] Implement schemas with `$defs`, `additionalProperties: false`, exact enums, identifier patterns, and required fields.
- [ ] Implement semantic cross-reference validation after structural schema validation.
- [ ] Reject an environment binding example outside the approved placeholder/synthetic allowlist.
- [ ] Run `npm test -- --test-name-pattern="contract schema"` and require PASS.
- [ ] Run `npm run build` and require exit `0`.

### REFACTOR

- [ ] Generate TypeScript literal unions from one maintained constants module; do not duplicate enums across validators.
- [ ] Sort diagnostics and schema discovery deterministically.
- [ ] Run all WP-01 tests twice and compare normalized output.

**Gate:** `R2 Contract` review. Commit only WP-01 files and evidence.

---

## WP-02: Canonicalization and ArtifactGraph

**Classification:** Sequential after WP-01.

**Files:**

- Create: `packages/core/src/canonical-json.ts`
- Create: `packages/core/src/path-policy.ts`
- Create: `packages/core/src/artifact-node.ts`
- Create: `packages/core/src/artifact-graph.ts`
- Create: `packages/core/src/graph-builders/*.ts`
- Create: `packages/core/src/diagnostics.ts`
- Test: `tests/unit/core/canonical-json.test.ts`
- Test: `tests/unit/core/artifact-graph.test.ts`
- Test: `tests/integration/cross-layer-drift.test.ts`

**Consumes:** `ProjectContract`, schema validators.

**Produces:** `canonicalize(value): string`, `buildArtifactGraph(root, contract)`, `compareProjection(key)`.

### RED

- [ ] Add fixtures where state values, index sets, internal names, save mode, package inventory, and manifest entries disagree across layers.
- [ ] Add path fixtures with absolute paths, traversal, case collisions, and nondeterministic enumeration.
- [ ] Run `npm test -- --test-name-pattern="ArtifactGraph"`.
- [ ] Expected RED: graph builder and drift diagnostics are absent.

### GREEN

- [ ] Implement UTF-8 LF canonical JSON with sorted keys and semantic array policies.
- [ ] Implement repository-relative POSIX path normalization and reject unsafe paths.
- [ ] Build immutable nodes/edges for contract, schema, frontend, flow, builder, definition, ZIP, manifest, docs, and evidence.
- [ ] Implement cross-layer keys for fields, indexes, states, save mode, connection references, action budget, inventory, and digests.
- [ ] Emit stable `META-CONSISTENCY-*` diagnostics.
- [ ] Run narrow tests and require PASS.

### REFACTOR

- [ ] Separate parsing from comparison; graph nodes remain immutable.
- [ ] Verify reordered filesystem results produce byte-identical JSON reports.
- [ ] Run `npm run build` and WP-01/WP-02 tests.

**Gate:** `R2` review of graph keys and diagnostic determinism.

---

## WP-03: CLI Shell, Reports, and Exit Statuses

**Classification:** Sequential after WP-02.

**Files:**

- Create: `packages/cli/package.json`
- Create: `packages/cli/src/bin/spflow.ts`
- Create: `packages/cli/src/parse-args.ts`
- Create: `packages/cli/src/commands/validate-contract.ts`
- Create: `packages/cli/src/commands/validate-rules.ts`
- Create: `packages/cli/src/commands/validate-artifact.ts`
- Create: `packages/cli/src/commands/validate-evidence.ts`
- Create: `packages/cli/src/commands/scan-public-data.ts`
- Create: `packages/cli/src/commands/verify.ts`
- Create: `packages/cli/src/reporters/{json,text}.ts`
- Test: `tests/unit/cli/*.test.ts`
- Test: `tests/integration/cli-exit-codes.test.ts`

**Produces:** Exact CLI surface and deterministic `CommandReport`.

### RED

- [ ] Add table-driven tests for commands, missing arguments, unsupported profile, unsafe archive, leakage, evidence violation, internal error, and external gate unavailable.
- [ ] Add a test that private binding values never occur in output.
- [ ] Add a test that `--offline` makes tenant residual gates `NOT_RUN` without exit `8`.
- [ ] Run `npm test -- --test-name-pattern="CLI exit"`.
- [ ] Expected RED: no CLI handler and wrong/no exit codes.

### GREEN

- [ ] Implement Node `parseArgs` command routing with no dynamic command loading.
- [ ] Implement JSON/text reporters from one normalized report.
- [ ] Enforce exit precedence `7,4,5,6,3,2,1,8,0`.
- [ ] Catch internal errors at process boundary and redact paths/values.
- [ ] Make `spflow verify` an orchestrator only; validators remain in core/rules/adapters.
- [ ] Run narrow tests, build, and command help snapshots.

### REFACTOR

- [ ] Remove command-specific output branching from validators.
- [ ] Verify JSON output is byte-stable across two runs.
- [ ] Run all WP-01 through WP-03 tests.

**Gate:** CLI contract and security review; no network or mutation API exists.

---

## WP-04: Safe ZIP and Power Platform Solution Adapter

**Classification:** Sequential before package rules.

**Files:**

- Create: `packages/package-adapters/package.json`
- Create: `packages/package-adapters/src/archive-reader.ts`
- Create: `packages/package-adapters/src/archive-limits.ts`
- Create: `packages/package-adapters/src/xml-safe-parser.ts`
- Create: `packages/package-adapters/src/solution-v1.ts`
- Create: `packages/package-adapters/src/flow-normalizer.ts`
- Create: `packages/package-adapters/src/action-graph.ts`
- Create: `packages/package-adapters/src/wdl-parser.ts`
- Test: `tests/artifacts/archive-safety.test.ts`
- Test: `tests/artifacts/solution-envelope.test.ts`
- Test: `tests/artifacts/action-graph.test.ts`

**Produces:** `PackageAdapter.inspect`, `PackageInspection`, `NormalizedFlow`, and no extraction side effects.

### RED

- [ ] Generate synthetic ZIPs for traversal, duplicate normalized path, case collision, encryption, too many entries, large entry, total size, high compression ratio, nested archive, and XML entity.
- [ ] Generate envelope fixtures with missing, extra, and misplaced required entries.
- [ ] Add graph fixtures with missing predecessor, cycle, unreachable authorization, bypassed readback, and `Terminate` inside loop.
- [ ] Run `npm test -- --test-name-pattern="package adapter"`.
- [ ] Expected RED: unsafe archives or malformed graphs are accepted.

### GREEN

- [ ] Implement lazy ZIP entry enumeration and enforce all limits before extraction.
- [ ] Normalize paths, reject links/devices/duplicates, and parse XML with DTD/entities disabled.
- [ ] Resolve workflow inventory from solution metadata and compare exact entries.
- [ ] Normalize action ancestry, `runAfter`, statuses, expressions, connectors, retries, and connections.
- [ ] Implement reachability and cycle algorithms with deterministic node order.
- [ ] Run narrow tests and require exact diagnostics.

### REFACTOR

- [ ] Keep archive safety independent from solution semantics.
- [ ] Fuzz bounded path/inventory inputs with a fixed deterministic seed.
- [ ] Run memory-bound tests and all earlier suites.

**Gate:** `R4` and `R5` review. Unsafe archive diagnostics must not expose matched content.

---

## WP-05: Rule Engine Wave 1 - Package and Flow Definition

**Classification:** After WP-04.

**Files:**

- Create: `packages/rules/package.json`
- Create: `packages/rules/src/registry.ts`
- Create: `packages/rules/src/package/*.ts`
- Create: `packages/rules/src/power-automate/*.ts`
- Create catalog and canonical fixtures for:
  `PKG-NATIVE-001`, `PKG-ARCHIVE-001`, `PKG-INTEGRITY-001`,
  `PA-LIMIT-001`, `PA-GRAPH-001`, `PA-GRAPH-002`, `PA-WDL-001`,
  `PA-EXPRESSION-001`, `PA-CONNECTOR-001`, `PA-CONNECTION-001`,
  `PA-SCOPE-001`, `FLOW-IDEMPOTENCY-001`, `FLOW-RETRY-001`,
  `FLOW-STATUS-001`, `FLOW-DESTRUCTIVE-001`.
- Test: `tests/rules/package-flow-rules.test.ts`

**Produces:** Static detector registry keyed by stable rule ID.

### RED

- [ ] For each rule, add catalog JSON, RED/GREEN/positive fixtures, `mutation.json`, and exact `expected.json` before detector code.
- [ ] Include generated-definition and final-ZIP fixtures for every applicable rule.
- [ ] Run `spflow validate rules --root . --format json`.
- [ ] Expected RED: every not-yet-implemented rule fails acceptance because its detector is absent.

### GREEN

- [ ] Implement one detector per module using only normalized graph inputs.
- [ ] Require RED exact diagnostic, GREEN pass, positive control pass, and mutation failure.
- [ ] Require package rules to inspect the final ZIP node.
- [ ] Require completion-path rules to prove semantic readback precedes `Succeeded`.
- [ ] Run `npm test -- --test-name-pattern="package and flow rules"`.
- [ ] Run `spflow validate rules --root . --format json` and require exit `0` for Wave 1.

### REFACTOR

- [ ] Extract shared graph predicates without combining distinct rule IDs.
- [ ] Mutation-test each detector by disabling its core predicate and require the suite to fail.
- [ ] Restore detector and rerun full Wave 1.

**Gate:** `R4` and independent `R6` review.

---

## WP-06: Rule Engine Wave 2 - SharePoint, Frontend, and Authorization

**Classification:** May begin after WP-02 interfaces, but acceptance waits for WP-05 registry.

**Files:**

- Create: `packages/rules/src/sharepoint/*.ts`
- Create: `packages/rules/src/application/*.ts`
- Create: `packages/rules/src/http/*.ts`
- Create catalog and fixtures for:
  `SP-AUTHZ-001`, `SP-AUTHZ-002`, `SP-ACL-001`, `SP-ACL-002`,
  `APP-SAVE-001`, `APP-PAGINATION-001`, `SP-ODATA-001`,
  `SP-SCHEMA-001`, `SP-SCHEMA-002`, `SP-SCHEMA-003`,
  `HTTP-SEMANTIC-001`, `HTTP-SEMANTIC-002`,
  `SP-INDEX-001`, `SP-INDEX-002`.
- Test: `tests/rules/sharepoint-application-rules.test.ts`

### RED

- [ ] Add tampered actor/business values, missing scope, browser queue update, shared digest, wildcard ETag, first-page result, raw OData, invalid binding, untyped payload, assumed name, unrelated 400, phase-leaked 404, add-before-remove, and compatible-write fixtures.
- [ ] Add independent GREEN controls that differ structurally from canonical RED.
- [ ] Run the Wave 2 test file and observe detector-absent failures.

### GREEN

- [ ] Implement server-authority path analysis from command trigger through authorization and mutation.
- [ ] Implement allowlist and ACL matrix comparison.
- [ ] Detect per-transaction digest, exact ETag, 412 branch, GET reconciliation, and readback.
- [ ] Parse URL/OData construction structurally rather than searching fixed strings.
- [ ] Implement structured semantic 400 classifier tests with negative controls.
- [ ] Track operation phase for 404 classification.
- [ ] Compare ordered index plan and prove compatible no-op.
- [ ] Run Wave 2 and combined rule validation.

### REFACTOR

- [ ] Share parsed transport/phase models while preserving rule-specific diagnostics.
- [ ] Run mutation controls and adversarial alternate naming/ordering fixtures.
- [ ] Run all WP-01 through WP-06 tests.

**Gate:** `R2`, `R3`, `R5`, and independent `R6` review.

---

## WP-07: Consistency, Evidence, and Public-Data Rules

**Classification:** After ArtifactGraph and CLI.

**Files:**

- Create: `packages/rules/src/meta/*.ts`
- Create: `packages/rules/src/release/*.ts`
- Create: `packages/rules/src/data/*.ts`
- Create: `packages/core/src/evidence-validator.ts`
- Create: `packages/core/src/public-data-scanner.ts`
- Create catalog and fixtures for:
  `META-CONSISTENCY-001`, `META-CONSISTENCY-002`, `META-CONSISTENCY-003`,
  `RELEASE-EVIDENCE-001`, `RELEASE-EVIDENCE-002`,
  `DATA-PUBLIC-001`, `DATA-PUBLIC-002`.
- Test: `tests/rules/meta-evidence-data-rules.test.ts`
- Test: `tests/adversarial/public-data-recursive.test.ts`

### RED

- [ ] Add save-mode, status-domain, and index-policy drift across different graph layers.
- [ ] Add invalid claim chains for every prohibited promotion.
- [ ] Add leakage in text, JSON key, XML, filename, generated bundle, ZIP, nested archive, diagnostic, and synthetic Git history fixture.
- [ ] Run narrow tests and observe acceptance failures.

### GREEN

- [ ] Implement cross-layer set/value comparisons.
- [ ] Implement evidence prerequisite graph with artifact/contract/target/change-window binding.
- [ ] Implement recursive scanner with private deny-list supplied externally, generic patterns, placeholder allowlist, binary policy, and redacted diagnostics.
- [ ] Ensure bindings path inside repository is rejected and values are never printed.
- [ ] Run narrow suites and rule validation.

### REFACTOR

- [ ] Separate content decoding, finding classification, and reporting.
- [ ] Test reordered history/archive traversal for deterministic output.
- [ ] Scan the scanner's own generated reports.

**Gate:** `R0`, `R5`, `R6`, and `R7` review. Publication remains blocked until license/authority is resolved.

---

## WP-08: Complete Synthetic RED/GREEN Corpus

**Classification:** After all detector waves.

**Files:**

- Complete: `rules/catalog/*.json`
- Complete: `fixtures/rules/<RULE-ID>/{red,green,controls/positive,mutation.json,expected.json}`
- Create: `tests/rules/catalog-completeness.test.ts`
- Create: `tests/rules/detector-mutation.test.ts`
- Create: `tests/artifacts/final-artifact-coverage.test.ts`
- Create: `docs/troubleshooting/<RULE-ID>.md`

**Produces:** Self-contained public failure knowledge base.

### RED

- [ ] Add completeness test requiring all 36 rule IDs listed in the review checklist.
- [ ] Require one catalog, canonical fixture set, remediation document, supported evidence class, and residual gate per ID.
- [ ] Require final-artifact tests when `finalArtifact.required` is true.
- [ ] Run catalog completeness and record missing artifacts as RED.

### GREEN

- [ ] Fill every missing synthetic fixture and expected diagnostic.
- [ ] Write troubleshooting pages as `symptom -> root cause -> RED -> correction -> GREEN -> residual gate`.
- [ ] Run each rule independently, then the full corpus.
- [ ] Require no fixture to contain environment-specific data.

### REFACTOR

- [ ] Remove accidental duplicated fixtures while preserving independent controls.
- [ ] Verify a detector cannot pass by rule ID, filename, or fixed fixture text alone.
- [ ] Rebuild final ZIP fixtures deterministically and compare manifests.

**Gate:** Full independent `R6` and `R7` review.

---

## WP-09: Project Templates and Deterministic Generators

**Classification:** After core rules.

**Files:**

- Create: `templates/command-queue-app/`
- Create: `templates/direct-edit-workbench/`
- Create: `templates/mailbox-ingestion/`
- Create: `packages/core/src/generators/project-generator.ts`
- Create: `packages/core/src/generators/flow-generator.ts`
- Create: `packages/core/src/generators/manifest-generator.ts`
- Test: `tests/integration/template-generation.test.ts`

**Template responsibilities:**

- `command-queue-app`: protected domain, command queue, access control, audit, server-authoritative flow.
- `direct-edit-workbench`: explicit Save only for `clientEditable` fields with exact ETag and readback.
- `mailbox-ingestion`: metadata-only ingestion, deterministic dedupe, guarded pagination, no message content in SharePoint fixture.

### RED

- [ ] Add golden contract tests requiring each template to fail if protected writes, actor trust, idempotency, pagination, or evidence boundary is absent.
- [ ] Add generation determinism test with fixed synthetic inputs and shuffled input order.
- [ ] Run template tests and observe missing generator failures.

### GREEN

- [ ] Implement pure generators from validated contract to public synthetic source/definition.
- [ ] Keep environment bindings unresolved in public output.
- [ ] Generate manifest only after final definition/ZIP bytes exist.
- [ ] Validate generated definitions and final ZIPs through `spflow`, not generator assumptions.
- [ ] Run each template through global offline verification.

### REFACTOR

- [ ] Share only contract-safe primitives; do not merge distinct write models.
- [ ] Regenerate from a clean directory and compare byte output.
- [ ] Run public-data scan over source and generated artifacts.

**Gate:** `R1-R7` template review.

---

## WP-10: Synthetic End-to-End Reference Application

**Classification:** After WP-09 command-queue template.

**Files:**

- Create: `examples/synthetic-case-workbench/project.contract.json`
- Create: `examples/synthetic-case-workbench/frontend/`
- Create: `examples/synthetic-case-workbench/sharepoint/`
- Create: `examples/synthetic-case-workbench/flows/`
- Create: `examples/synthetic-case-workbench/artifacts/`
- Create: `examples/synthetic-case-workbench/evidence/`
- Test: `tests/integration/synthetic-case-workbench.test.ts`
- Test: `tests/adversarial/reference-app-tampering.test.ts`

**Produces:** Offline reference for browser -> command queue -> processor model -> audit/readback, without tenant claims.

### RED

- [ ] Seed protected-value tampering, actor spoofing, stale ETag, duplicate command, ambiguous write, missing scope, partial pagination, unsafe OData, and run-without-effect variants.
- [ ] Require each seed to produce its rule diagnostic.
- [ ] Run reference integration and observe missing implementation.

### GREEN

- [ ] Build a static frontend transport with existing-session/no-secret contract and synthetic mock transport.
- [ ] Implement command schema and deterministic processor simulation for `0/1/many`, exact ETag, transition, audit, and semantic readback.
- [ ] Build final synthetic flow ZIP through the generator and validate it independently.
- [ ] Emit local evidence with all tenant gates `NOT_RUN`.
- [ ] Run integration, adversarial seeds, and global verify.

### REFACTOR

- [ ] Keep example code dependent only on published package APIs.
- [ ] Remove test-only shortcuts from production example paths.
- [ ] Run a clean build from no generated output and compare artifacts.

**Gate:** `R1-R7`; no authenticated browser or tenant claim is made.

---

## WP-11: Agent-Neutral Skills

**Classification:** After reference app passes core review.

**Files:**

- Create: `skills/architect-sharepoint-app/SKILL.md`
- Create: `skills/define-schema-and-acl/SKILL.md`
- Create: `skills/build-frontend-transport/SKILL.md`
- Create: `skills/build-power-automate-flow/SKILL.md`
- Create: `skills/validate-final-artifact/SKILL.md`
- Create: `skills/debug-with-red-green/SKILL.md`
- Create: `skills/release-with-evidence/SKILL.md`
- Create: `skills/sanitize-public-project/SKILL.md`
- Test: `tests/adversarial/skill-contract.test.ts`

### RED

- [ ] Add tests that reject a skill which duplicates a rule, skips final ZIP validation, claims tenant success, requests secrets, mutates a tenant, or omits RED/GREEN.
- [ ] Run skill-contract tests and observe absent skills.

### GREEN

- [ ] Each skill states inputs, preconditions, exact `spflow` commands, stop conditions, expected evidence class, and residual tenant gate.
- [ ] Skills refer to normative specs and rule IDs instead of copying detector logic.
- [ ] Skills require a project contract before generation and global verification before readiness language.
- [ ] Run skill tests and a clean-context dry walkthrough.

### REFACTOR

- [ ] Normalize skill frontmatter and shared terms.
- [ ] Remove vendor-specific wording from core skills.
- [ ] Re-run public-data and documentation link checks.

**Gate:** Independent AI usability review plus `R6-R7`.

---

## WP-12: Global Verification, CI, and Public Release Controls

**Classification:** After all core packages.

**Files:**

- Finalize: `packages/cli/src/commands/verify.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `scripts/verify-clean-checkout.mjs`
- Create: `scripts/verify-determinism.mjs`
- Create: `scripts/verify-history.mjs`
- Create: `README.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md`
- Create after R0: `LICENSE`
- Test: `tests/integration/global-verify.test.ts`
- Test: `tests/adversarial/release-gates.test.ts`

### RED

- [ ] Create seeded repositories for contract failure, stale manifest, unsafe ZIP, private data, unsupported evidence, nondeterministic output, dirty lockfile, and missing license.
- [ ] Require global verify/release gate to fail with exact exit category.
- [ ] Run integration tests and observe missing orchestration.

### GREEN

- [ ] Implement fixed global order: contract -> catalog -> fixtures -> mutation -> graph -> generated definitions -> final ZIP -> manifest -> docs -> public data -> evidence.
- [ ] Aggregate all safe diagnostics while honoring unsafe-archive short circuit.
- [ ] Configure CI with `npm ci`, build, tests, offline verify, and artifact upload of redacted reports.
- [ ] Configure release CI with clean checkout, deterministic rebuild, nested scan, history scan, dependency/license review, manifest, and provenance.
- [ ] Keep CI free of tenant credentials.
- [ ] Run global integration and release-gate tests.

### REFACTOR

- [ ] Ensure local `npm run verify` and CI call the same CLI command.
- [ ] Remove duplicate shell validation logic from workflows.
- [ ] Execute two clean-checkout builds and compare normalized artifacts.

**Gate:** `R0` and `R7`; public release still requires `R9` and publication readback.

---

## WP-13: Adversarial Clean-Context AI Build

**Classification:** Core release prerequisite.

**Files:**

- Create: `tests/adversarial/clean-context-ai/brief.md`
- Create: `tests/adversarial/clean-context-ai/acceptance.json`
- Create: `tests/adversarial/clean-context-ai/seeded-failures.json`
- Create: `docs/reviews/clean-context-ai-review.md`

### RED

- [ ] Give a fresh, context-free AI only the public repository and synthetic brief.
- [ ] Require it to design a project contract, generate a command-queue app, and diagnose seeded failures.
- [ ] Record omissions, wrong claims, unsafe writes, and missed diagnostics as RED without giving private history.

### GREEN

- [ ] Improve only public specs, skills, diagnostics, or examples that caused observed ambiguity.
- [ ] Repeat with a new clean-context AI, not the original worker.
- [ ] Require correct project contract, all seeded diagnostic IDs, final-artifact validation, and local-only evidence language.

### REFACTOR

- [ ] Remove teaching text that duplicates machine-readable rules.
- [ ] Verify the repository remains usable by a human without an AI runtime.
- [ ] Run global verify after documentation changes.

**Gate:** Independent usability/security review. The test proves public guidance quality, not tenant behavior.

---

## WP-14: Optional Codex Plugin

**Classification:** Optional; blocked until WP-00 through WP-13 and `R7` pass.

**Files:**

- Create: `.codex-plugin/plugin.json`
- Create only if needed: plugin-local command wrappers that invoke installed `spflow`
- Test: `tests/integration/codex-plugin.test.ts`

### RED

- [ ] Add tests rejecting missing core version, duplicated rules, tenant credentials, network dependency, diagnostic suppression, or mutation capability.
- [ ] Run plugin tests before manifest exists.

### GREEN

- [ ] Declare plugin metadata, core version compatibility, and skill paths.
- [ ] Invoke the same CLI binary and preserve exit codes/output.
- [ ] Provide no tenant credential storage and no MCP dependency.
- [ ] Run plugin installation in an isolated local profile and invoke offline verify.

### REFACTOR

- [ ] Remove wrappers that add no compatibility value.
- [ ] Verify uninstall leaves the core repository unchanged.
- [ ] Repeat clean-context skill discovery.

**Gate:** Core `R7`, plugin security review, then `R9` for plugin publication.

---

## WP-15: Separately Authorized Tenant Pilot and Read-Only MCP Decision

**Classification:** Deferred external program; not part of public core release.

**Files:**

- Create only after authorization: `docs/plans/tenant-pilot-template.md` with placeholders only
- Store real bindings/evidence: approved private location outside repository
- Create after successful pilot decision: a new MCP ADR/spec in a separate reviewed work package

### RED

- [ ] Confirm no current core artifact claims import, rebind, enablement, smoke, or tenant verification.
- [ ] Run read-only Preflight against an explicitly authorized synthetic target only after target/identity approval.
- [ ] Treat blocked authorization or missing binding as `BLOCKED/NOT_RUN`, not product failure.

### GREEN

- [ ] Import exact package disabled, read back inventory and disabled state.
- [ ] Rebind declared references and read them back.
- [ ] Enable consumer-before-producer under separate approval and read back state.
- [ ] Execute bounded canary smoke, semantic readback, audit assertion, and rollback rehearsal.
- [ ] Record private tenant evidence by exact change window and artifact digest.

### REFACTOR

- [ ] Generalize only synthetic lessons into public rules after sanitization and review.
- [ ] Do not copy tenant evidence or exported packages into the public repository.
- [ ] Decide whether read-only MCP adds value beyond existing authenticated runbooks.

### MCP decision criteria

- operation allowlist is discovery/readback only;
- minimum authenticated scopes are documented;
- outputs are redacted and bounded;
- rate limits, audit, and threat model exist;
- no create/update/delete/import/enable/disable/trigger/permission tools;
- `R0`, `R5`, `R8`, and `R9` approvals are required.

**Gate:** Separate human authorization. Write-capable MCP remains out of scope.

---

## 4. Global Verification Acceptance

The core release candidate must pass, in one clean checkout:

```text
npm ci
npm run build
npm test
npm run verify
npm run scan:public
```

`npm run verify` validates:

1. all JSON Schemas and project contracts;
2. exact rule catalog inventory;
3. RED, GREEN, positive control, and mutation behavior;
4. ArtifactGraph cross-layer consistency;
5. generated definitions;
6. final ZIP envelope, safety, graph, WDL, connectors, connections, limits, retries, idempotency, ACL, pagination, and destructive gates;
7. exact artifact manifests;
8. documentation links and rule references;
9. recursive public-data policy, generated output, archives, and reports;
10. evidence claim support and residual tenant gates.

No local command changes a tenant claim from `NOT_RUN` to PASS.

## 5. CI Gates

### Pull request

- lockfile-only dependency installation with `npm ci`;
- supported Node/npm version check;
- TypeScript strict build;
- complete local tests;
- global offline verification;
- recursive working-tree/generated-artifact scan;
- changed-rule requirement for catalog, RED, GREEN, controls, mutation, and expected result;
- redacted report upload.

### Release

- all pull-request gates;
- clean checkout and deterministic rebuild comparison;
- exact final ZIP reopen and manifest recomputation;
- full Git history and nested archive scan;
- dependency license and vulnerability review;
- R0/R7/R9 approval records;
- provenance and exact release digest;
- publication readback.

## 6. Local-Only Versus Tenant-Only Matrix

| Activity | Offline core | Authorized tenant only |
|---|---:|---:|
| JSON schema/contract validation | Yes | No |
| Rule RED/GREEN/mutation tests | Yes | No |
| Generated definition/final ZIP validation | Yes | No |
| Manifest/public-data/evidence validation | Yes | No |
| Synthetic processor/browser simulation | Yes | No |
| Schema/effective permission discovery | No | Yes, read-only Preflight |
| Flow import | No | Yes, disabled and separately authorized |
| Connection rebind | No | Yes |
| Enable/trigger/mutate | No | Yes, separate Apply approval |
| Semantic effect/readback | Synthetic only | Yes for tenant claim |
| Tenant verification | Never | Yes with current authenticated evidence |
| Public code-host publication | Local candidate only | External publication plus readback |

## 7. Worker Checkpoint and Retirement Protocol

The coordinator applies this protocol to every implementation work package:

1. Assign one fresh worker a bounded package, exact paths, allowed commands, prohibited operations, acceptance tests, and review gate.
2. State that the worker cannot create or coordinate subagents and cannot work outside assigned paths.
3. Require an initial checkpoint before edits: `STARTED`, intended files, current phase, ambiguities.
4. Require checkpoints approximately every 10 minutes on a slow machine, before a long-running command, after RED, after GREEN, and before final response.
5. Checkpoint shape:

```text
State: STARTED | WRITING | TESTING | BLOCKED | READY
Work package:
Files changed:
Last completed command and exit code:
Current RED/GREEN/REFACTOR phase:
Next action:
Unresolved blocker:
```

6. A command timeout, delayed response, or slow machine is not a RED. The coordinator checks process state/output and requests a checkpoint before classifying failure or terminating work.
7. The worker stops at `READY` and provides changed-file inventory, exact commands/output summary, failed/not-run tests, evidence class, residual gates, and a sanitized findings report.
8. The coordinator independently inspects diff and reruns acceptance commands before accepting the package.
9. The coordinator records the sanitized closeout in the authorized private second-brain log. Private second-brain content, identities, paths, and environment values never enter the public repository.
10. After acceptance or rejection is recorded, retire that worker. Do not reuse it for the next package or its independent review.
11. Assign a new worker for remediation, next implementation package, and independent review as applicable.

## 8. Commit and Review Protocol

- One accepted work package per commit series.
- Commit messages identify the package and phase, for example `test(wp05): add package rule RED fixtures`, `feat(wp05): implement package detectors`, `refactor(wp05): normalize graph predicates`.
- RED evidence is retained; it is not overwritten by GREEN evidence.
- Reviewers inspect exact commit and artifacts.
- Authors cannot be sole final reviewer for R6-R9.
- No push, pull request, release, or tenant operation is implied by completing this plan.

## 9. Unresolved Governance Decisions

The following require human decisions and are not delegated to implementation workers:

1. Public publication authority and repository owner.
2. Public license and dependency-license policy.
3. Whether and where a tenant pilot is authorized.
4. Whether a read-only MCP is justified after the pilot.

These items do not weaken technical contracts. They remain blocking at their stated gates.
