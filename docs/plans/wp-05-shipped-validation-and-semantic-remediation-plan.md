# WP-05 Shipped Validation and Semantic Remediation Plan

**Status:** required before Wave 1 acceptance

## RED

Add tests that invoke the built `spflow` CLI and root build path with:

- a valid synthetic contract and adapter-inspected package;
- an always-false semantic assertion followed by completion;
- label-only no-op destructive and idempotency actions;
- mislabeled and conflicting duplicate manifest entries;
- malformed WDL arguments and trailing tokens;
- a seeded private-looking flow/action identifier in every diagnostic surface.

The tests must fail before implementation.

## GREEN

- Wire `validate rules`, `validate artifact`, and `verify` to real offline validation.
- Compile core, adapters, rules, and CLI from the root build with exact workspace dependencies.
- Give deferred requested local checks a non-success exit; keep tenant-only residual gates as explicit `NOT_RUN` evidence.
- Require semantic assertion success, not merely Condition success, before `Succeeded`.
- Derive destructive/idempotency facts from normalized operations and control flow; annotations cannot be sole proof.
- Compare exact manifest inventory from contract and adapter data, detecting all duplicate conflicts independent of order.
- Strengthen WDL argument grammar and trailing-token rejection.
- Replace copied positive controls with independent topologies and sanitize diagnostic paths/messages.

## REFACTOR

Run the shipped CLI from a clean build on Node 22, repeat outputs for determinism, run all mutation and counterexample tests, and prove no network, tenant, mutation, or publication operation exists.

## Acceptance

A new read-only reviewer must reproduce all counterexamples through the shipped CLI and root build. Wave 1 remains blocked until that review recommends approval.
