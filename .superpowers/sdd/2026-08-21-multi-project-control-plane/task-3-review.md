# Task 3 review — multi-project fixture, global-memory behavior, and onboarding

## Review target and scope

Reviewed commit `17d60c509c2ab1a040678b256f4d2a9a0948c81b` against:

- `docs/superpowers/specs/2026-08-21-multi-project-control-plane-design.md`;
- Task 3 in `docs/superpowers/plans/2026-08-21-multi-project-control-plane.md`;
- `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-3-report.md`;
- the Task 2 CLI/review/fix reports; and
- `docs/specs/self-improvement.md`, including the canonical registry contract.

The review covered fixture placement and path safety, dependency-free project
checks, registry sidecar/audit behavior, compiled CLI GREEN/RED/optional
`NOT_RUN`/global-candidate fail-closed behavior, cleanup, onboarding,
privacy/license boundaries, and test quality. No production files or provider
state were changed. The existing worktree modification to the plan and the
untracked license-audit directory were preserved.

Evidence class: `LOCAL_SYNTHETIC`. Provider, hosted, and UAT gates are
`NOT_RUN`.

## Findings

### P2 — Task 3 report records an incorrect `npm test` count

Evidence: `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-3-report.md:78-82`
claims that the command `npm test` passed 414 tests. Re-running that exact
command on commit `17d60c5` passed 299 tests in 13 suites. The repository's
`npm run check` portable gate separately walks the complete test inventory and
passed 414 tests in 27 suites, so the acceptance gate is GREEN, but the worker
report attributes the 414-test result to the wrong command.

Recommendation: add a follow-up immutable evidence record correcting the
command/result pair: `npm test` passed 299 tests, while the `npm run check`
test gate passed 414. If `npm test` is intended to be the complete suite,
repair its test-file discovery separately and record that as a distinct change.

### P2 — Task 3 integration coverage does not exercise approved lesson consumption or candidate/block privacy semantics

The fixture registry is empty (`examples/multi-project-workspace/knowledge/self-improvement/registry.json:1-6`).
The integration test verifies an empty-registry PASS and relies on the current
repository-wide unresolved candidate at `tests/integration/multi-project-workspace.test.ts:158-176`.
It does not prove that an `APPROVED` lesson is auditable/readable for the
workspace, nor that `CANDIDATE` and `BLOCKED` records remain history and never
become instructions. Those are explicit design test requirements and are the
global-memory behavior assigned to Task 3. Existing Task 2/core tests cover
parts of the audit implementation, but not this compiled fixture boundary.

Recommendation: add a self-contained temporary-registry scenario with a valid
approved lesson and matching sidecar, asserting the workspace remains
sanitized and only metadata/result fields are exposed. Add candidate and
blocked-history scenarios with matching sidecars, asserting audit failure,
zero child-check invocations, visible `NOT_RUN`, and no lesson text in JSON or
text output. Avoid coupling the test's expected RED solely to the mutable
repository-wide registry.

### P2 — Onboarding gives contradictory working-directory instructions

`AGENTS.md:16` says to “run the fixture manifest from inside its workspace
directory,” while `docs/MULTI_PROJECT_CONTROL_PLANE.md:18-21`, `README.md:127-129`,
and `docs/AI_AGENT_WORKFLOW.md:84-92` give the command from the repository
root. Following the AGENTS instruction literally and copying the displayed
command fails because `packages/cli/dist/bin/spflow.js` is not under the
workspace directory. This conflicts with the clean-context onboarding
acceptance criterion.

Recommendation: change the AGENTS wording to say that the manifest is stored
inside the workspace and the shown command runs from the repository root, or
provide an explicit workspace-directory command using the correct relative
path to the compiled CLI.

## Positive checks

- `examples/multi-project-workspace/workspace.manifest.json` uses the canonical
  manifest-local `knowledge/self-improvement/registry.json` path and relative
  `projects/...` roots; the registry sidecar exactly matches the registry bytes.
- `green-a` and `green-b` have no dependencies and their direct `npm run check`
  commands exit 0. The red fixture exits 1 with deterministic synthetic output.
- The compiled integration passed 1/1 test and verified two GREEN projects,
  required RED isolation, optional missing-root `NOT_RUN`, registry-audit
  failure before child execution, and cleanup of marker/temp files.
- The compiled fixture command passed with registry revision 1, the expected
  digest, two `LOCAL_SYNTHETIC` project PASS results, and no diagnostics.
- `npm run build` passed; `npm run check` passed all 19 portable gates,
  including its complete 414-test inventory; `git diff --check 17d60c5^ 17d60c5`
  passed.
- The added documentation correctly preserves the local-only evidence boundary,
  no-tenant-mutation boundary, sanitized-candidate lifecycle, provider/hosted/UAT
  separation, and existing Personal and Internal Use License guidance. No
  private values, credentials, tenant identifiers, or generated evidence were
  added by the commit.
- After verification, `git status --short` still showed only the pre-existing
  plan modification and license-audit directory; no marker or temporary
  manifest remained.

## Reviewer status

Reviewer status: **retired**

delegated_subagents: 0
