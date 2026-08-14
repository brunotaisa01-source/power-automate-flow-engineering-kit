# WP-10 Narrow Artifact Grammar Plan

## Objective

Close the independent blockers at baseline
`47c544262f4fab45b9c18cc610908c8ae606ab0a` without private source access,
tenant access, external mutation, or publication. The implementation must
prefer a small accepted grammar and suppress evidence for unsupported or
ambiguous artifacts.

## Sequence

1. Preserve frontend shadowing, early-exit, malformed-source, loop, and textual-decoy counterexamples as RED regressions.
2. Reject parser diagnostics and require a closed frontend module inventory with exact AST call, object, and control-flow shapes.
3. Require exact contract-complete field create payloads plus response-dependent FOUND/MISSING/FAILED branches and post-write readback.
4. Require complete current index state, serial remove-before-add operations, per-step/final full-state readbacks, approved digest assertion, and digest-bound APPLY/NO_OP results.
5. Derive permission inheritance from the executable break settings and reject contract mismatches.
6. Retain exact target GET and reachable guard requirements for Owner and Amount authority.
7. Retain catalog-derived rule-specific `LIVE_SMOKE NOT_RUN` gates and the compiled all-fourteen-rule synthetic CLI path.
8. Run Node 22 build, focused tests, full tests, diff check, dependency audit, official public-data scanner attempt, and supplemental public-safety checks.

## Claim Boundary

WP-10 can establish only local static and package-artifact evidence. It cannot
establish tenant discovery, Preflight, Apply, import, rebinding, enablement,
execution, mutation, live smoke, semantic readback, effective permissions,
publication, or publication readback.
