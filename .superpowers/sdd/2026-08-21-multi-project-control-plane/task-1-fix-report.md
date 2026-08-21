# Task 1 fix report — aggregate contract review findings

## Scope

Addressed exactly both P2 findings from `task-1-review.md`:

1. `aggregateWorkspaceResults` now constructs emitted project results from only
   `id`, manifest-derived `required`, `result`, `exitCode`, and
   `evidenceClass`. It no longer spreads caller-supplied result objects.
2. Added focused tests for all-required GREEN aggregation and registry-audit
   FAIL aggregation, plus the private-looking extra-field regression.

No CLI, documentation, fixture, or provider files were changed.

## TDD evidence

RED command:

```text
node --experimental-strip-types --test tests/unit/core/workspace-control.test.ts
```

Result: exit 1; 8 tests total, 7 passed, 1 failed. The private-looking
`privatePath` regression failed because the pre-fix aggregate included the
extra enumerable field. The two focused aggregate-gate tests were already
GREEN, confirming their previously untested existing behavior.

GREEN command:

```text
node --experimental-strip-types --test tests/unit/core/workspace-control.test.ts
```

Result: exit 0; 8 tests total, 8 passed, 0 failed.

## Full verification

```text
npm test
```

Result: exit 0; 285 tests passed, 0 failed, 0 skipped.

```text
npm run build
```

Result: exit 0; root TypeScript build and the `@spflow/package-adapters`,
`@spflow/rules`, and `@spflow/cli` workspace builds completed successfully.

```text
git diff --check
```

Result: exit 0.

Evidence class: `LOCAL_SYNTHETIC`. Provider, hosted, and UAT verification were
not run because this fix is limited to the core aggregate contract and tests.

worker status: retired
