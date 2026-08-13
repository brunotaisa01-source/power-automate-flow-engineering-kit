# WP-05 Wave 1 Remediation Plan

**Status:** required before Wave 1 acceptance

This plan addresses the blocking R4/R6 review recorded in `docs/reviews/wp-05-wave1-review-record.md`.

## Scope

The remediation must connect the rule engine to the real WP-04 normalized package and flow model. It must not add tenant connectivity, imports, rebinding, enablement, flow execution, mutation, or publication.

## RED

Add counterexamples before implementation:

- a real `NormalizedFlow` with a `ReadonlyMap` action collection, a `ReadonlySet` connection collection, expressions, connector metadata, retry policy, and status-bearing `runAfter` edges;
- a final-package fixture inspected through the safe adapter, including missing required evidence and extra manifest inventory;
- failed semantic readback followed by a `Succeeded` completion;
- destructive mutation without post-mutation audit/readback or compensation;
- disconnected or absent role labels;
- action count above the contract budget;
- cross-container predecessor and malformed expression arguments;
- independent positive controls that are not renamed copies of GREEN.

The focused suite must fail before the remediation code exists.

## GREEN

Implement a typed rule input boundary that accepts adapter output and package inspection. Derive security-relevant facts from normalized actions, connectors, expressions, contract values, and package inventory. Missing required evidence must produce deterministic diagnostics. Enforce successful semantic readback before `Succeeded` and require post-mutation audit/readback or the declared compensation path for destructive flows. Enforce same-container graph ancestry, stronger WDL structure, exact manifest inventory, and contract-derived action budgets.

## REFACTOR

Keep archive safety, package semantics, flow normalization, rule predicates, and reporting separate. Require every rule to have a structurally independent positive control and a mutation that disables the detector predicate rather than replaying the canonical RED. Verify stable diagnostics under input reordering and run the complete suite on Node 22.

## Acceptance

The worker must report exact RED/GREEN/REFACTOR commands and output. A new read-only reviewer must reproduce the counterexamples against the real adapter boundary. Wave 1 remains blocked until that review is complete.
