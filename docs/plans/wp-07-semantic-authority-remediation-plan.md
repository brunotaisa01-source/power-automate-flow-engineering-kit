# WP-07 Semantic Authority Remediation Plan

## Objective

Close the independent release-review blockers at baseline
`bf42ebaa9215f8b6bf8dadf2ce566debbca5c293` without adding any tenant access,
private data, or publication capability.

## Work Sequence

1. Preserve the independent counterexamples as failing regression tests.
2. Replace frontend token inventory with conservative reachable AST and data-flow checks.
3. Derive builder sections from normalized connector URIs, methods, parameters, payloads, guards, and dominance.
4. Expose only a raw-artifact inspection pipeline that constructs trusted graph lineage internally.
5. Add executable `permissionProbes` and `indexPlans` derivations.
6. Replace the hydrated all-rule integration claim with a compiled CLI context built from raw synthetic files and a real ZIP.
7. Emit the rule-specific `HTTP-SEMANTIC-001` `LIVE_SMOKE NOT_RUN` gate.
8. Run focused tests, build, complete suite, diff checks, dependency audit, and public-data gates under Node 22.

## Fail-Closed Boundary

The supported source shapes are intentionally narrow. Unsupported frontend
syntax, ambiguous files, incomplete connector sequences, missing guards,
unbound readbacks, wildcard ETags, inert URIs, duplicate roles, or incomplete
index operations produce no trusted derivation. The adapter does not infer
equivalence from labels or contract vocabulary.

## Out Of Scope

Tenant discovery, Preflight, Apply, import, rebinding, enablement, execution,
mutation, runtime HTTP observation, semantic readback, effective-permission
readback, publication, and publication readback remain separately authorized
external gates.
