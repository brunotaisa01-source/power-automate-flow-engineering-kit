# WP-06 Evidence Binding Remediation Plan

## Status

- Scope: public, synthetic, offline validation only.
- Baseline commit: `da654e4b319c8d9fe4440d3d08f92d40eb4e1c75`.
- Acceptance state at plan creation: blocked by independent review.
- Source projects: out of scope and not accessed.

## Objective

Make every WP-06 rule fail closed unless its normalized evidence is a derived artifact that is bound to an exact, separate source artifact and to the exact project contract artifact present in the same artifact graph.

## Required Invariants

1. Evidence cannot bind to itself.
2. A binding identifies one section and the envelope contains exactly that populated section.
3. The contract path and SHA-256 match the `project-contract-v1` graph node.
4. The source path, SHA-256, byte length, and kind match a distinct graph node.
5. The evidence node kind and bound source kind match the rule catalog distinction: `frontend` or `builder`.
6. Duplicate and undeclared lists, fields, operations, commands, requests, traversals, and index plans are rejected.
7. HTTP classifications are valid for every status: only approved 400 and 404 cases can authorize absence; all other failures classify as `GET_FAILED`.
8. Local evidence remains local. Import, rebind, enablement, tenant execution, semantic mutation, effective permissions, live readback, and publication remain external gates.

## TDD Sequence

1. Add focused adversarial tests for binding, kind, ownership, cardinality, and HTTP status semantics.
2. Run the focused suite against the baseline and record the expected RED.
3. Add the binding type and fail-closed normalizer.
4. Enforce graph binding and expected kind in the shared WP-06 selector.
5. Enforce exact ownership and cardinality in each detector without changing Wave-1 behavior.
6. Split canonical and built-CLI evidence by section and bind it to separate source artifacts.
7. Run focused tests, canonical RED/GREEN/positive/mutation fixtures, build, full tests, and the public-data scanner.

## Acceptance Gates

- Focused adversarial suite: PASS.
- Canonical WP-06 fixture suite: PASS with independent positive controls and mutations.
- TypeScript build: PASS.
- Full local test suite: PASS.
- Recursive public-data scan: PASS or explicitly `NOT_RUN` with no promotion.
- External tenant gates: explicitly `NOT_RUN`.
