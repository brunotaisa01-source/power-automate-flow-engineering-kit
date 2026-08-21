# Final correction report — multi-project control plane

## Scope

Addressed the final review P2 findings and the platform-specific CLI test
failures. Changed only:

- `packages/core/src/workspace-control.ts`
- `tests/unit/core/workspace-control.test.ts`
- `tests/cli/workspace-check.test.ts`
- this report

No production CLI code, fixtures, product documentation, license text,
provider state, or task files were changed.

## Corrections

1. Workspace and project identifiers now require a lowercase ASCII slug:
   a leading letter followed by letters, digits, and single hyphen-separated
   segments. Invalid paths, e-mail-shaped values, and whitespace/private labels
   fail manifest validation before aggregate or command reports are built.
   Diagnostics retain only stable codes and JSON pointers; they never echo the
   rejected identifier.
2. Aggregate registry data is constructed from exactly `revision`, `digest`,
   and `audit`; caller-supplied extra fields cannot enter report data.
3. The CLI tests explicitly use the Linux branch where they expect `npm`, and
   use `basename()` for project-root matching so Windows path separators do not
   affect required/failed project scenarios.

## TDD evidence

### RED

Before changing production code, added the direct core, aggregate, and CLI
regressions and ran:

```text
node --experimental-strip-types --test tests/unit/core/workspace-control.test.ts tests/cli/workspace-check.test.ts
```

Result: exit `1`; 21 passed, 3 failed. The identifier tests showed that the
manifest accepted a private path, an e-mail-shaped project ID, and a
whitespace-bearing private label. The aggregate test showed
`privateLesson` in `aggregate.registry`. The CLI regression proceeded to
project execution instead of emitting manifest validation findings.

### GREEN

After the minimal core fix and rebuilding the package export used by the CLI
test, the same focused command passed: exit `0`; 24 passed, 0 failed.

## Final local verification

```text
npm test
```

Result: exit `0`; 303 tests passed in 13 suites, 0 failed, 0 skipped.

```text
npm run build
```

Result: exit `0`.

```text
npm run check
```

Result: exit `0`.

```text
git diff --check
```

Result: exit `0`.

## Handoff

- incident_id: `FAIL-20260821-workspace-control-final-p2`
- status: `RETIRED`
- wave/task: `2026-08-21 multi-project control plane / final correction`
- red_command/result: focused core/CLI command; exit `1`, 3 intended failures
- green_command/result: focused core/CLI command after rebuild; exit `0`, 24 passed
- files: the four scoped files listed above
- review_status: correction complete; independent final review remains external
- evidence_class: `LOCAL_SYNTHETIC`
- remaining_blockers: no local blocker; provider, hosted, and UAT evidence are `NOT_RUN`
- delegated_subagents: 0

worker status: retired
