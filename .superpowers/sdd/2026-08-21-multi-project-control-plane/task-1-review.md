# Task 1 review — core workspace manifest and aggregate contracts

Review target: commit `06aa6ea` against
`docs/superpowers/specs/2026-08-21-multi-project-control-plane-design.md` and
Task 1 of `docs/superpowers/plans/2026-08-21-multi-project-control-plane.md`.

Reviewed only:

- `packages/core/src/workspace-control.ts`
- `packages/core/package.json`
- `tests/unit/core/workspace-control.test.ts`
- `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-1-report.md`

The focused test passes: 5/5 tests. The worker report's stated build and
retirement evidence is consistent with the reviewed change. `git diff --check`
also passes for the reviewed commit. No provider state was accessed or changed.

## Findings

### P2 — Aggregate copies uncontracted runtime fields into report data

Evidence: `packages/core/src/workspace-control.ts:204-225` uses object spread in
`cloneProjectResult` and when adapting a supplied result. TypeScript interfaces
do not remove extra enumerable properties at runtime. For example, a result
object with the typed fields plus `privatePath: "/secret/project"` is emitted
with that extra property in `aggregate.projects`; this was reproduced with the
focused module. The aggregate can therefore carry fields outside the declared
report contract, including a private path or unsanitized child-output field.

Recommendation: construct each emitted project result from the five allowlisted
fields (`id`, manifest-derived `required`, `result`, `exitCode`, and
`evidenceClass`) instead of spreading caller objects. Add a regression test that
passes an object with an extra private-looking field and asserts the aggregate
does not contain it. Task 2 still owns child-output sanitization, but this core
boundary should not widen the report shape.

### P2 — Required GREEN and registry-failure aggregate cases are not tested

Evidence: `tests/unit/core/workspace-control.test.ts:60-76` tests a required RED
case, while `:78-96` tests one required PASS plus an optional `NOT_RUN` case.
There is no assertion that a valid two-project manifest with both projects
`PASS`/exit code `0` produces the required GREEN aggregate and `passed: 2`, even
though that is explicit in the design test contract. There is also no core
assertion that a registry audit of `FAIL` makes an otherwise all-GREEN aggregate
fail, despite `workspace-control.ts:237-242` making registry audit part of the
aggregate gate. The current tests could therefore pass while a regression
changed either success path.

Recommendation: add a both-required-projects GREEN test and a registry-audit
failure test. Also consider asserting the exact summary and result in the
GREEN case, not only project ordering.

## Review checks with no finding

- Manifest validation is strict about object/array/string/boolean fields,
  rejects unknown keys, duplicate IDs, duplicate normalized roots, traversal or
  absolute paths through the shared path-policy helper, and unsupported checks.
- Required missing results are represented as `NOT_RUN` and fail the aggregate;
  optional `NOT_RUN` remains visible without failing the required set.
- Required project success requires both `PASS` and exit code `0`; registry
  failure is also non-successful. Project ordering is deterministic by ID.
- The package export for `workspace-control` is present, and adding the
  `path-policy` export is within the Task 1 package-file scope and supports the
  planned core dependency.
- The reviewed change does not add CLI execution, filesystem access, provider
  operations, registry promotion, or other Task 2/3 behavior. The
  `createRequire` source/dist selection is compatible with the repository's
  Node 22 source-test/build evidence; no portability defect was found within
  the stated runtime constraints.

Reviewer status: retired
