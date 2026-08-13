# WP-05 Remediation Review Record

**Status:** `BLOCKED`

The first remediation connected the typed adapter boundary and improved fail-closed coverage, but an independent review found acceptance-blocking gaps.

## Blocking Findings

### R4-004: No shipped execution path

The CLI still defers `validate rules` and `validate artifact`, `verify` has no validation steps, and deferred validators exit successfully. The root build also omits the adapters and rules workspaces, while their package exports target generated files that are not present after checkout.

**Required correction:** wire the offline validator through the CLI and `verify`, compile all required workspaces from the root build, and define a non-success exit for a requested local validation that was not run. Keep tenant-only residual gates separately represented as `NOT_RUN`.

### R4-005: Condition branch can bypass semantic assertion

The current status logic treats a condition that references a successful GET as sufficient. A condition can itself succeed while taking an always-false assertion branch, allowing completion to reach `Succeeded` without semantic success.

**Required correction:** model assertion semantics and require the success branch of the condition, or equivalent explicit proof, before completion. Add an adapter-inspected always-false assertion counterexample.

### R4-006: Labels remain authority for critical safeguards

Destructive and idempotency rules still select critical actions from declared roles. Label-only Compose actions can therefore satisfy required gates without implementing the operation.

**Required correction:** derive operation semantics from normalized action type, connector, method, expressions, field/body shape, and control flow. A role annotation may document a derived fact but cannot be the sole proof.

### R4-007: Manifest integrity remains kind/order dependent

Exact inventory is inferred from node kinds and duplicate graph nodes can overwrite each other without comparing byte length. Reordering duplicate nodes changes the result.

**Required correction:** derive expected inventory from the contract/package manifest and adapter inventory, reject unsupported/mislabeled entries, detect all conflicting node attributes, and sort before comparison.

## Required Hardening

- Reject malformed WDL argument structure and trailing tokens.
- Make positive controls semantically independent rather than renamed GREEN copies.
- Sanitize diagnostic paths and messages so normalized flow/action identifiers do not appear verbatim.

## Acceptance Gate

Wave 1 remains blocked until a fresh worker implements these corrections and a new read-only reviewer reproduces the counterexamples through the shipped CLI and root build path.
