# WP-05 Connector, Dataflow, and Provenance Plan

**Status:** required before Wave 1 acceptance

## Scope

This plan addresses the latest independent review:

1. Semantic readback proof is not bound to the exact connector and operation.
2. Identifier validation accepts lexical decoys instead of parsed dataflow.
3. Source-definition discovery can omit valid definitions in alternate roots.
4. Review approval cannot yet be bound to an immutable local revision.

## RED

Add built-CLI counterexamples that fail before implementation:

- A readback through a different connector reference or operation.
- A target identifier expression that mentions the expected field but returns a different value or source.
- A valid definition under an alternate source root that is not declared by the contract.
- A provenance check that fails when the reviewed repository has no immutable revision.

## GREEN

- Carry connector reference, operation, resource, and target identity through the normalized adapter evidence.
- Validate semantic readback against exact command mutation identity and parsed identifier dataflow. Textual field-name matches are insufficient.
- Discover all relevant source definitions under an explicit exhaustive policy. Reject undeclared definitions, duplicate identities, alternate roots, and path collisions.
- Add a sanitized local Git commit containing only intended source, contracts, fixtures, tests, and documentation. Exclude dependencies and generated outputs. Record the reviewed commit in the review evidence without exposing private data.
- Keep tenant-only gates explicit `NOT_RUN`; no local commit or test result implies tenant or publication evidence.

## REFACTOR

Run Node 22 build, focused RED/GREEN cases, the full suite, deterministic reports, source-only network capability scan, public-data scan, and a clean-tree/provenance check at the immutable revision.

## Acceptance

Wave 1 remains `BLOCKED` until a fresh read-only reviewer reproduces these cases against the immutable revision and recommends `APPROVED` or `APPROVED_WITH_RESIDUAL_RISK`.
