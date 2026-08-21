# Final fix re-review — multi-project control plane

## Review status

Reviewer status: **retired**

Clean status: **YES — no open findings remain in the reviewed scope.**

Review target: `5d1b290c7191c25df83690969c035591a585b73b` (`HEAD`), compared
with the prior final-review target `e19c9af438ee2d1915b4a06a91b20ee9a6b2f30f`
and the findings recorded in
`.superpowers/sdd/2026-08-21-multi-project-control-plane/final-review.md`.

The fix commit is bounded to the core workspace contract, its unit and CLI
regressions, and this immutable correction report. The earlier custom license
change is treated as explicitly user-authorized scope for this review. No
production files were edited during this re-review and no coordination or
provider operation was performed.

Evidence class: `LOCAL_SYNTHETIC`.

## Prior findings and disposition

### P1 — Custom Personal and Internal Use License

Status: **RESOLVED — authorized scope; not an open finding.**

The prior finding identified `a0bf866` as a branch-wide license change. The
current review treats that change as expressly authorized by the user, so it is
not a release-scope objection here. The boundary is documented and tested:

- `LICENSE:1-23` grants personal/internal use and restricts unlicensed sale,
  redistribution, publication, hosted/SaaS use, commercialization, and paid
  repackaging.
- `package.json` declares `"license": "SEE LICENSE IN LICENSE"`.
- `AGENTS.md:10-16`, `docs/AI_AGENT_WORKFLOW.md:28-31`, and
  `README.md:91-98` describe the same personal/internal-use boundary.
- `tests/ai-agent-operability.test.ts:156-169` asserts that the license is
  present, does not silently restore MIT resale rights, and contains the
  required permission, restriction, trademark, and disclaimer language.
- The license test passed in both `npm test` and the full portable check.

This disposition is an authorization ruling, not legal advice or a claim that
third-party dependencies inherit the repository license.

### P2 — Private workspace/project identifiers could leak into reports

Status: **RESOLVED — retired.**

`packages/core/src/workspace-control.ts:62-76` defines and applies a strict
lowercase ASCII public synthetic slug grammar: a leading letter followed by
letters/digits and single hyphen-separated segments. Validation now rejects
private paths, e-mail-shaped IDs, whitespace labels, uppercase labels, and
other non-public forms before `workspaceCheckCommand` builds a report
(`packages/core/src/workspace-control.ts:153-155,177-179`;
`packages/cli/src/commands/workspace.ts:196-200`). Manifest findings use a
stable message and JSON pointer rather than echoing the rejected value
(`packages/cli/src/commands/workspace.ts:117-127`).

The direct core regression and the direct-plus-formatted CLI regression assert
that `/private/workspace-secret`, `alice@example.com`, and `Private Project`
are absent from serialized diagnostics and reports
(`tests/unit/core/workspace-control.test.ts:60-82`;
`tests/cli/workspace-check.test.ts:262-287`). Existing path, symlink, and
child-output redaction tests remain green as well. This closes the prior
user-facing command leak within the validated manifest boundary.

### P2 — Aggregate registry output was not closed to its contract

Status: **RESOLVED — retired.**

`aggregateWorkspaceResults` now constructs `registry` from exactly
`revision`, `digest`, and `audit` (`packages/core/src/workspace-control.ts:257-263`).
The unit regression injects `privateLesson` and verifies that it cannot enter
the aggregate (`tests/unit/core/workspace-control.test.ts:113-126`). The
compiled integration scenario also asserts that an approved registry exposes
only those three metadata keys and never exposes lesson ID or invariant text
in JSON or text output (`tests/integration/multi-project-workspace.test.ts:219-242`).

### Acceptance closure — Windows portability and fixture/integration coverage

Status: **RESOLVED — verified; no new finding.**

- The CLI runner has an explicit Windows branch for `npm.cmd`, `shell: true`,
  and `SystemRoot` allowlisting (`packages/cli/src/commands/workspace.ts:91-100,254-257`),
  covered by the simulated Windows test at
  `tests/cli/workspace-check.test.ts:354-377`.
- Linux expectations are pinned with `platform: "linux"`, and path assertions
  use `basename()` rather than POSIX-only suffix checks
  (`tests/cli/workspace-check.test.ts:78-104,129-152,335-352`). The portable
  command builder and its Windows test cover `npm.cmd` shell behavior in
  `scripts/portable-check.mjs:27-30` and `tests/unit/portable-check.test.mjs:22-29`.
- The compiled fixture/integration suite covers two required GREEN projects,
  required RED isolation, optional `NOT_RUN`, approved-registry metadata
  privacy, and CANDIDATE/BLOCKED fail-closed history with zero child runs:
  `tests/integration/multi-project-workspace.test.ts:152-283`.

## Scope and regression review

The exact fix delta from `e19c9af` contains only:

- `.superpowers/sdd/2026-08-21-multi-project-control-plane/final-fix-report.md`
- `packages/core/src/workspace-control.ts`
- `tests/cli/workspace-check.test.ts`
- `tests/unit/core/workspace-control.test.ts`

No new fixture, provider, hosted, tenant, license, or unrelated product scope
was introduced by `5d1b290`. The post-build worktree retained only the
pre-existing untracked review/license-audit artifacts plus the requested
review output; no generated marker or temporary fixture remained.

## Fresh verification

All commands were run from the current `5d1b290` checkout:

- `npm run build`: exit `0`.
- `node --experimental-strip-types --test tests/unit/core/workspace-control.test.ts tests/cli/workspace-check.test.ts`: exit `0`; `24` passed, `0` failed.
- `node --experimental-strip-types --test tests/integration/multi-project-workspace.test.ts`: exit `0`; `4` passed, `0` failed.
- Fixture command `node packages/cli/dist/bin/spflow.js workspace check --manifest examples/multi-project-workspace/workspace.manifest.json --format json`: exit `0`; registry audit `PASS`, revision `1`, digest `22251cd799afe4979cf166caf87ae9fec377016ce9d4b8981a5f776b9cca727c`, and both required projects `PASS` with `LOCAL_SYNTHETIC` evidence.
- `npm test`: exit `0`; `303` passed in `13` suites, `0` failed, `0` skipped.
- `npm run check`: exit `0`; `420` passed in `27` suites, `0` failed, `0` skipped, `19` gates completed, and `npm audit` found `0` vulnerabilities.
- `git diff --check` and `git diff --check e19c9af^ 5d1b290`: exit `0`.

## Open findings

None for the requested post-`5d1b290` scope.

## Residual observations and evidence boundaries

These are retained boundaries, not newly opened findings:

- Child-output redaction remains heuristic. The current tests cover common
  path, e-mail, UUID, password/token, delimiter, underscore, and camel-case
  credential forms; it is not a universal secret classifier.
- The design text describes project-scoped consumption of `APPROVED` lessons,
  while this command intentionally exposes only registry audit metadata and
  does not expose lesson application as a report channel. The integration
  tests verify the safe metadata-only behavior. Any requirement that lesson
  application itself be observable needs separate specification clarification.
- `PROVIDER_TENANT`, `HOSTED`, and `UAT` evidence are `NOT_RUN`. No provider
  authentication, tenant mutation, hosted deployment/readback, connector or
  flow run, email/approval action, or user-acceptance scenario was performed.
  Local GREEN results do not upgrade those evidence classes.
- GitHub Actions status was not inspected; the repository contains a static
  Ubuntu/macOS/Windows matrix, while this review's Windows evidence is
  deterministic simulated-branch coverage on the local host.

Final reviewer status: **retired**
