# WP-05 Wave 1 Review Record

**Status:** `BLOCKED`

**Review scope:** package and Power Automate rule detectors, catalog entries, RED/GREEN fixtures, mutation controls, and their integration with the WP-04 normalized package and flow model.

**Review boundary:** read-only review of synthetic repository content. No tenant access, import, connection rebind, enablement, flow run, mutation, tenant readback, or publication occurred.

## Blocking Findings

### R4-001: Detector input contract is not connected to the adapter output

The WP-05 detectors expect fixture-shaped arrays and optional labels, while WP-04 exposes typed normalized maps, sets, expressions, and package inspection objects. The ArtifactGraph currently treats a ZIP as bytes or parsed JSON and does not invoke the package adapter. The rule tests inject handcrafted graph projections, so a real normalized flow or final ZIP can pass without being inspected.

**Required correction:** define and test a typed adapter boundary from `PackageInspection` and `NormalizedFlow` into rule context. Build rules from real adapter output and final ZIP inventory, not fixture-only projections. Missing required artifacts must be a deterministic failure, never an implicit pass.

### R4-002: Semantic success and destructive postconditions are bypassable

The status detector does not verify that semantic readback completed successfully before a completion action can mark success. The destructive detector checks selected pre-mutation roles but does not require post-mutation readback, audit, or an explicitly documented compensation path.

**Required correction:** model status-bearing `runAfter` edges and require successful readback before `Succeeded`. For destructive transitions, require authorization, mutation, audit, semantic readback, and the declared failure or compensation path in the same action graph.

### R4-003: Rules fail open when optional labels are absent or disconnected

Several detectors trust builder-supplied role or kind fields instead of deriving behavior from normalized actions and connector metadata. Action limits use fixture-provided budgets instead of the project contract. Package rules pass when the required ZIP node is missing.

**Required correction:** derive security-relevant facts from normalized definitions and the project contract. Treat missing package evidence, missing action inventory, missing connector metadata, and incomplete projections as explicit diagnostics. Never turn an absent required node into a pass.

## Non-blocking but Required Before Acceptance

### R6-001: Graph and expression validation need structural coverage

Same-container ancestry is not enforced for `runAfter` edges, and expression parsing accepts malformed argument lists. Add structural parser tests and scope-aware graph validation.

### R6-002: Package integrity must be exact

Integrity validation must reject stale, extra, missing, duplicate, and mismatched manifest inventory, not only validate entries that happen to have a corresponding ZIP node.

### R6-003: Independent controls are insufficient

Positive controls must be semantically distinct from GREEN fixtures, and mutation tests must prove the detector predicate rather than only replaying the canonical RED mutation. Catalog remediation text must describe a corrective action rather than repeat the violation.

### R6-004: Deferred local commands need an explicit exit contract

`NOT_RUN` is correctly visible in reports, but deferred local validators currently exit successfully. The CLI contract must distinguish a successful validation from a deferred validator while preserving the separate tenant-only residual gate policy.

## Acceptance Gate

WP-05 remains blocked until a fresh worker implements the adapter boundary and the counterexamples above, then a new read-only reviewer confirms that real normalized flows and final package artifacts are exercised. The existing happy-path suite is evidence of fixture coverage only; it is not evidence that production-shaped artifacts are safe.
