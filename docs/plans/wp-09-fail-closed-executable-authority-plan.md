# WP-09 Fail-Closed Executable Authority Plan

## Objective

Close the independent blockers at baseline
`f3b5fde20e334c3262f550c60063a1c7bc8ffd0b` without tenant access, private
source access, network mutation, or publication.

## Sequence

1. Preserve each counterexample as a failing regression before production changes.
2. Restrict frontend network authority to explicit global calls and exact supported AST sequences.
3. Require response-dependent field FOUND/MISSING/FAILED branches and post-create readback.
4. Derive index current state from complete read assertions and executable remove/add/readback actions.
5. Emit authorization facts only for selected target fields consumed by the guard.
6. Derive required `LIVE_SMOKE NOT_RUN` gates from project and rule catalog metadata.
7. Preserve the compiled CLI all-fourteen-rule synthetic raw-artifact test.
8. Run Node 22 build, focused tests, full tests, diff check, dependency audit, and the official public-data scanner.

## Fail-Closed Boundary

The adapters recognize a narrow grammar, not arbitrary JavaScript or Power
Automate semantics. Unsupported calls, control flow, connector identities,
branches, readbacks, or index plans produce no trusted derivation.

## External Gates

Tenant discovery, Preflight, Apply, import, rebinding, enablement, execution,
mutation, live smoke, semantic readback, effective-permission readback,
publication, publication readback, and official history scanning remain
separately authorized external gates.
