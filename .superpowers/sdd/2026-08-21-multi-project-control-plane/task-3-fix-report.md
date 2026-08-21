# Task 3 fix report — registry coverage, onboarding, and corrected counts

## Objective and scope

This immutable follow-up addresses the three P2 findings in
`task-3-review.md`. It does not modify the original Task 3 report, the global
registry, production/core/CLI code, fixture production files, license text, or
provider state.

## Files changed

- `tests/integration/multi-project-workspace.test.ts`
- `AGENTS.md`
- `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-3-fix-report.md`

## TDD evidence

### RED — fail-closed registry scenarios

The focused compiled integration test creates temporary workspaces only. Its
`CANDIDATE` and `BLOCKED` history scenarios each invoke the compiled CLI with
an audit-invalid registry and observe the intended RED result: non-zero CLI
exit, registry audit `FAIL`, both projects visible as `NOT_RUN` with exit `8`,
and no marker written by the child check. The test also asserts that the lesson
invariant is absent from both JSON and text output.

### GREEN

Command:

```text
node --experimental-strip-types --test tests/integration/multi-project-workspace.test.ts
```

Result: exit `0`; 4 tests passed, 0 failed. The self-contained APPROVED
scenario copies the canonical registry, SHA-256 sidecar, bound test files,
provenance record, and independent review record into its temporary workspace.
It passes its audit and exposes only `revision`, `digest`, and `audit` registry
metadata. The CANDIDATE and BLOCKED scenarios copy existing sanitized test and
record fixtures into separate temporary workspaces; neither starts a child
check or exposes lesson text.

## Onboarding correction

`AGENTS.md` now says that the fixture manifest is stored inside its workspace,
while the displayed CLI command runs from the repository root.

## Final local verification

```text
npm test
```

Result: exit `0`; **302 tests** passed in **13 suites**, with 0 failures and 0
skips. This is the exact result of `npm test`; it is not the portable-check
inventory count.

```text
npm run build
```

Result: exit `0`.

```text
npm run check
```

Result: exit `0`; the portable gate ran **417 tests** in **27 suites** and
completed **19 gates**. This count belongs to `npm run check`, not `npm test`.

```text
git diff --check
```

Result: exit `0`.

## Evidence boundary and next action

Evidence class: `LOCAL_SYNTHETIC`. `PROVIDER_TENANT`, `HOSTED`, and `UAT` are
`NOT_RUN`; no provider authentication, tenant mutation, hosted execution, or
user acceptance occurred.

The next safe action is an independent review of this bounded correction.

worker status: retired

delegated_subagents: 0
