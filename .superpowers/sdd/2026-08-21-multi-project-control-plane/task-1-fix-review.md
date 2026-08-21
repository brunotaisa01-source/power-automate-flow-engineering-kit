# Task 1 fix re-review — aggregate contract findings

## Review target and scope

Re-reviewed commit `3cb8681089451d8d6e870340d211a9cae7a18b02` against the two
P2 findings in `task-1-review.md`. Review was limited to the commit diff,
`packages/core/src/workspace-control.ts`,
`tests/unit/core/workspace-control.test.ts`, and the committed fix report.
No production files were edited and no provider state was accessed or changed.

## Findings

### P2 — Aggregate copies uncontracted runtime fields into report data

Status: **RESOLVED — retired**

`cloneProjectResult` now creates a fresh frozen object containing exactly the
five contracted project-result fields: `id`, manifest-derived `required`,
`result`, `exitCode`, and `evidenceClass`. It no longer spreads the supplied
runtime result. The new regression test supplies an enumerable
`privatePath` field and compares the complete emitted project array against the
exact allowlisted shape. A fresh runtime probe also confirmed that both
`privatePath` and `childOutput` are absent and that the emitted key set is
exactly the five-field allowlist.

Residual observation, not opened as a new finding in this scoped re-review:
the aggregate still spreads `registryAudit` into `aggregate.registry`. The
original P2 evidence and remediation were specifically about uncontracted
project-result fields; this review does not broaden that finding to the
registry boundary.

### P2 — Required GREEN and registry-failure aggregate cases are not tested

Status: **RESOLVED — retired**

The added GREEN test uses the valid two-project manifest with both projects
required and `PASS`/exit code `0`, then asserts aggregate `PASS` and the exact
`{ total: 2, passed: 2, failed: 0, notRun: 0, blocked: 0 }` summary. The registry
failure test keeps both projects passing, sets the registry audit to `FAIL`,
asserts that audit remains `FAIL`, asserts aggregate `FAIL`, and confirms the
project summary still reports both projects as passed. These are meaningful
positive and negative controls for both gates.

## Scope and TDD review

The commit changes only the requested SDD fix report, core aggregate logic, and
the focused unit test. It adds no CLI, fixture, provider, or unrelated product
behavior. The parent-to-commit diff is limited to those files, and
`git diff --check` passes.

The committed TDD report is materially accurate: the parent implementation
spreads caller fields, which explains the reported 7-pass/1-fail RED result for
the new extra-field assertion; the two gate tests were already green; and the
fresh GREEN/full verification results match the report. Fresh verification:

- focused test: 8 passed, 0 failed;
- full `npm test`: 285 passed, 0 failed, 0 skipped;
- `npm run build`: exit 0;
- `npm run check`: exit 0;
- `git diff --check`: exit 0.

Minor wording caveat: “no documentation files” is accurate only when referring
to product documentation—the commit necessarily adds the SDD fix report
itself.

Evidence class: `LOCAL_SYNTHETIC`.

Reviewer status: **retired**

delegated_subagents: 0
