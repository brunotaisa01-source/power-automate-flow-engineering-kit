# WP-06 Raw Artifact Authority Remediation Plan

> **For agentic workers:** Execute this plan inline. Do not spawn or coordinate other agents. Every production change requires a previously observed failing test.

**Goal:** Make WP-06 PASS authority depend on adapters that inspect real frontend files, exported flow definitions, and real solution ZIP bytes, while keeping repository-authored evidence and source IR non-authoritative.

**Architecture:** `@spflow/package-adapters` owns filesystem and archive inspection. It reads exact repository bytes, normalizes declared flow definitions, safely inspects solution ZIPs, verifies frontend bundle inventory, and emits immutable adapter evidence with exact path, SHA-256, and byte length. The CLI attaches adapter-derived projection and evidence nodes only after a trusted inspection succeeds; core repository discovery never creates trust lineage from `sourceIrProfile`, evidence bindings, or a `.zip` filename. Rules require this adapter-created lineage and fail closed when actual structure cannot establish semantics.

**Tech Stack:** TypeScript 5.9, Node.js 22, Node test runner, existing ArtifactGraph, flow normalizer, and safe Power Platform solution adapter.

## Global Constraints

- Do not access or modify private source projects.
- Keep all documentation, fixtures, identifiers, URLs, and examples synthetic and in English.
- Do not include personal, company, tenant, mailbox, production site, or private identifiers.
- Treat scanner unavailability and external tenant gates as `NOT_RUN`, never as PASS.
- Preserve Wave-1 behavior outside the minimum shared adapter-evidence and graph plumbing.
- Repository-authored WP-06 evidence, source IR, and source projection JSON are test inputs only and cannot authorize production PASS.
- A static parser that cannot prove a semantic claim must fail closed and retain the documented residual runtime or tenant gate.

---

### Task 1: Reproduce the release-review false GREEN cases

**Files:**
- Create: `tests/rules/wp-06-raw-artifact-authority.test.ts`
- Create: `fixtures/adversarial/wp06-raw-artifact-authority/red-cases.json`
- Create: `docs/reviews/wp-06-raw-artifact-authority-red-record.md`

**Interfaces:**
- Consumes: production `buildArtifactGraph`, offline validation context, and current package inspector.
- Produces: focused regressions for copied source IR, missing frontend files, unrelated definitions, JSON named `.zip`, and invented HTTP bodies.

- [x] Add a copied-IR test that uses a compliant evidence/projection pair with unrelated raw source and expects rule failure.
- [x] Add frontend bundle tests for an absent entrypoint, absent inventory member, mismatched file bytes, and incomplete inventory.
- [x] Add a generated-definition test where a declared but unrelated minimal flow cannot satisfy a WP-06 builder rule.
- [x] Add a package test where JSON bytes under a `.zip` path cannot satisfy a required ZIP gate, including when adapter inspection reports invalid.
- [x] Add an HTTP test where a manually supplied 200 body has no definition or authenticated runtime provenance and cannot authorize `FOUND`.
- [x] Run only the focused test against `d366545ef3c0438ed24b1f45a27dc726d98c8b7e` and record the exact RED assertions and exit status.

### Task 2: Inspect real definitions, frontend inventory, and ZIP bytes

**Files:**
- Modify: `packages/core/src/types/rule-input.ts`
- Modify: `packages/package-adapters/src/rule-evidence.ts`
- Create: `packages/package-adapters/src/frontend-inventory.ts`
- Create: `packages/package-adapters/src/wp06-derivation.ts`
- Modify: `packages/package-adapters/src/solution-v1.ts`
- Test: `tests/rules/wp-06-raw-artifact-authority.test.ts`

**Interfaces:**
- Consumes: repository root, `ProjectContract`, exact frontend files, exact declared definition files, and real package bytes.
- Produces: `RuleAdapterEvidence` records whose identity is selected by executable code and whose bindings use actual path, SHA-256, and byte length.

- [x] Read each declared definition path from inside the repository boundary and call `normalizeFlow` on its actual JSON bytes.
- [x] Compare direct definitions with matching normalized flows obtained from inspected ZIP bytes where a ZIP is required.
- [x] Enumerate the frontend root, verify a single strict bundle manifest, require the entrypoint and every listed file to exist, and require exact file path, SHA-256, and byte length coverage.
- [x] Reject missing, extra, duplicated, path-escaping, case-colliding, or digest-mismatched frontend inventory entries.
- [x] Keep source IR and source projection JSON visible as ordinary artifacts but exclude them from trusted adapter derivation.
- [x] Return explicit missing, invalid, or unsupported adapter states rather than fabricating semantic facts.

### Task 3: Attach lineage only for successful adapter derivations

**Files:**
- Modify: `packages/core/src/artifact-node.ts`
- Modify: `packages/core/src/artifact-graph.ts`
- Modify: `packages/core/src/types/wp06-evidence.ts`
- Modify: `packages/package-adapters/src/rule-evidence.ts`
- Modify: `packages/cli/src/commands/offline-validation.ts`
- Test: `tests/unit/core/artifact-graph.test.ts`
- Test: `tests/rules/wp-06-raw-artifact-authority.test.ts`

**Interfaces:**
- Consumes: the ordinary repository graph plus successful trusted adapter evidence.
- Produces: an augmented immutable graph with exact raw-source to derived-projection to derived-evidence lineage.

- [x] Stop `buildArtifactGraph` from generating WP-06 projection or evidence trust edges from repository metadata.
- [x] Add an adapter-evidence attachment function outside core's dependency cycle.
- [x] Create projection and evidence nodes from canonical adapter output, never from caller-selected adapter IDs.
- [x] Add lineage edges only after raw path, digest, byte length, parsed structure, contract binding, and artifact requirements agree.
- [x] Require rules to select only the new adapter-derived profile; repository-authored evidence remains non-authoritative.

### Task 4: Enforce real final artifacts

**Files:**
- Modify: `packages/rules/src/sharepoint/wp06-common.ts`
- Modify: `packages/package-adapters/src/wp06-derivation.ts`
- Test: `tests/rules/wp-06-raw-artifact-authority.test.ts`
- Test: `tests/integration/wp-06-built-cli.test.ts`

**Interfaces:**
- Consumes: verified frontend inventory, normalized declared definitions, safe ZIP inspections, manifests, and graph lineage.
- Produces: independent fail-closed gates for `frontend-bundle`, `generated-definition`, and `zip` catalog requirements.

- [x] Require frontend rules to bind to the real entrypoint and complete exact inventory.
- [x] Require builder rules to bind to the contract flow and its normalized direct definition.
- [x] Require ZIP rules to bind to valid `inspectSolutionBytes` output whose normalized flow matches the declared definition and package contract.
- [x] Remove the JSON-data fallback from ZIP content validation and stop JSON parsing for `.zip` graph data.
- [x] Require manifests to hash the real ZIP node bytes and exact package path.

### Task 5: Make HTTP `FOUND` provenance explicit

**Files:**
- Modify: `packages/core/src/types/rule-input.ts`
- Modify: `packages/package-adapters/src/wp06-derivation.ts`
- Modify: `packages/rules/src/http/semantic.ts`
- Modify: WP-06 rule catalogs where the residual gate description changes
- Test: `tests/rules/wp-06-raw-artifact-authority.test.ts`

**Interfaces:**
- Consumes: parsed definition/package response-handling structure or a separately authenticated runtime-response record bound to an actual response artifact and contract schema.
- Produces: `FOUND` only when body shape and schema identity have trusted provenance; otherwise `GET_FAILED` plus the residual runtime gate.

- [x] Reject response bodies present only in source IR, projection JSON, or evidence JSON.
- [x] Derive static response-handling facts from normalized actions only when actual structure supports them.
- [x] Fail closed for response values that static flow structure cannot prove; no runtime-response adapter is accepted in this release.
- [x] Keep 400, 404, authorization, throttling, and server-error classification fail closed.
- [x] Add positive and mutation controls for every accepted static route; no runtime `FOUND` route is accepted in this release.

### Task 6: Verify, document, and commit

**Files:**
- Modify: WP-06 fixtures and tests only as required by the trusted adapter boundary.
- Modify: `docs/specs/evidence-model.md`
- Modify: `docs/specs/wp06-source-ir.md`
- Modify: `docs/specs/end-to-end-contract.md`
- Create: `docs/reviews/wp-06-raw-artifact-authority-remediation-record.md`

**Interfaces:**
- Consumes: all remediation tasks.
- Produces: review-ready, sanitized RED-to-GREEN evidence at one exact commit.

- [x] Run focused adversarial tests and positive controls.
- [x] Run mutation controls that remove one required source, edge, digest, definition action, bundle file, ZIP inspection, or HTTP provenance record.
- [x] Run TypeScript/workspace build, the complete test suite, and `git diff --check`.
- [x] Run the official public-data scanner when available; otherwise record its exact `NOT_RUN` reason and run the existing supplemental tracked-file check.
- [x] Record tenant discovery, preflight, apply, import, rebind, enablement, execution, mutation, semantic readback, effective permissions, and publication as `NOT_RUN`.
- [x] Commit only the focused remediation with a concise message and report the exact commit and evidence.
