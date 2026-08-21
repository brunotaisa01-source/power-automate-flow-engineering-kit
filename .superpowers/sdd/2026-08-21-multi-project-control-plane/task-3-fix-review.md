# Task 3 fix review — scoped re-review

## Review target and scope

Reviewed commit `6851f3640f93b7c553136df5467604f931d0b1ae` against the three
findings in `task-3-review.md`. This re-review is limited to the immutable fix
commit and local synthetic evidence. No production files were edited and no
coordination or delegated work was used.

Evidence class: `LOCAL_SYNTHETIC`. Provider, hosted, and UAT evidence remain
`NOT_RUN` and are outside this correction.

## Dispositions

### Finding 1 — incorrect `npm test` count

Disposition: **CLOSED**.

The command/result attribution is corrected in `task-3-fix-report.md` and was
freshly reproduced from commit `6851f36`:

- `npm test`: exit `0`, `302` tests passed, `13` suites, `0` failed, `0`
  skipped, `0` todo.
- `npm run check`: exit `0`, `417` tests passed, `27` suites, `0` failed, `0`
  skipped, `0` todo, and `19` portable gates completed.

The `302` count belongs to `npm test`; the `417` inventory count belongs to
`npm run check`.

Residual: the original Task 3 report remains an unchanged historical record;
the corrected command/result pair is recorded by the immutable fix report.

### Finding 2 — compiled registry semantics and privacy/child-check coverage

Disposition: **CLOSED**.

Fresh execution of
`node --experimental-strip-types --test tests/integration/multi-project-workspace.test.ts`
passed `4/4` tests. The compiled scenarios now establish:

- `APPROVED`: a copied valid registry and sidecar audit `PASS`; the report
  exposes only `audit`, `digest`, and `revision` registry metadata, with no
  lesson ID or invariant text in JSON or text output.
- `CANDIDATE`: audit `FAIL`, non-zero CLI exit, both projects visible as
  `NOT_RUN` with exit `8`, no lesson invariant in JSON or text output, and no
  child marker created.
- `BLOCKED`: the same fail-closed behavior is independently exercised for a
  blocked history record, including no child marker and no lesson text.

The scenarios use temporary copied workspaces and clean them up. The marker
assertion provides the zero-child-check evidence for both unresolved-history
cases.

Residual: this is compiled local fixture coverage only; it does not establish
provider, hosted, or UAT behavior.

### Finding 3 — onboarding working-directory contradiction

Disposition: **CLOSED**.

`AGENTS.md` now explicitly distinguishes the manifest location from command
execution: the manifest is inside the fixture workspace, while the displayed
compiled CLI command runs from the repository root. This matches
`docs/MULTI_PROJECT_CONTROL_PLANE.md`, `README.md`, and
`docs/AI_AGENT_WORKFLOW.md`, which all show the same repository-root command.

Residual: none identified for the scoped cwd-consistency finding.

## Verification record

- Node `v22.23.2`; npm `10.9.8`.
- `npm run build`: exit `0`.
- Focused compiled integration: `4/4` passed.
- `npm test`: `302/302` passed.
- `npm run check`: `417/417` passed; `19` gates.
- `git diff 6851f36^ 6851f36 --check`: exit `0`.

## Reviewer status

Reviewer status: **retired**

delegated_subagents: 0
