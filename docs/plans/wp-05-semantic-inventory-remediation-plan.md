# WP-05 Semantic and Inventory Remediation Plan

**Status:** required before Wave 1 acceptance

## Scope

This plan addresses the four high-severity fail-open cases found by the independent read-only review after the shipped-validation remediation:

1. A completion condition can reference a successful read without matching the contract assertion field, operator, and expected value.
2. A declared definition can disappear together with its manifest entry without failing exact inventory validation.
3. An extra packaged workflow can be filtered out instead of failing against the declared workflow set.
4. Destructive and idempotency checks can accept textual or empty control branches that are not proven to gate the relevant operation.

## RED

Add built-CLI counterexamples that fail before implementation:

- A readback comparison with the wrong field or expected value before `Succeeded` completion.
- A package missing a required declared definition, including the case where its manifest entry is also absent.
- A package containing an undeclared workflow.
- Empty or disconnected idempotency cardinality branches.
- Destructive authorization and failure-control actions that exist but do not gate the destructive mutation.

Each RED must use synthetic identifiers and must assert the exact diagnostic rule. Diagnostics must not expose raw flow or action identifiers.

## GREEN

- Bind semantic readback validation to every command assertion in the project contract. Require matching readback action, field, operator, expected value, successful condition branch, and completion ancestry.
- Preserve the complete adapter-discovered package inventory, including all definitions and all workflows, before filtering or contract projection.
- Compare exact declared and discovered package inventory. Missing required files and extra workflow identities must fail closed.
- Require idempotency branches to be reachable, non-empty, and connected to the lookup result and the next operation; metadata labels are never sufficient.
- Require destructive control outcomes to gate the mutation and its failure/compensation path; presence and text matches alone are insufficient.
- Keep tenant-only checks explicit `NOT_RUN` offline and preserve local non-success behavior for unavailable requested validators.

## REFACTOR

Run:

- Node 22 root build.
- Focused counterexamples through the built CLI.
- Full test and mutation suites.
- Determinism checks for reports and diagnostics.
- Bounded public-data scan over intended source content, excluding generated dependencies.

## Acceptance

Wave 1 remains `BLOCKED` until a fresh read-only reviewer reproduces the new counterexamples through the shipped CLI and recommends `APPROVED` or `APPROVED_WITH_RESIDUAL_RISK`.

Local evidence does not prove tenant import, rebinding, enablement, execution, semantic readback, mutation, or publication readback.
