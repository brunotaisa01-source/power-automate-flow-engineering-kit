# Final review — multi-project control plane

## Review status

Final reviewer status: **retired**

Clean status: **NO — findings remain below.**

Review target: `codex/worker-evidence-expected-actual-boundary` at
`e19c9af438ee2d1915b4a06a91b20ee9a6b2f30f`, compared with `main` at
`37afca05be4b49c1a4b9ad3a8b45022569360d5a` using `git diff main...HEAD`.
The branch contains 34 commits, 66 changed files, and 6,798 added lines.

Evidence class: `LOCAL_SYNTHETIC`. No provider, tenant, hosted, UAT, GitHub
CI-status, login, connector, flow, email, approval, or registry-promotion
operation was performed.

## Findings by severity

### P1 — The branch changes the repository license outside the approved control-plane scope

Evidence:

- `a0bf866` changes `LICENSE` from the MIT grant on `main` to a custom Personal
  and Internal Use License. The branch now prohibits selling, redistribution,
  publishing, commercialization, hosted/SaaS use, and paid repackaging
  (`LICENSE:1-23`), while `main` expressly granted broad copy, distribution,
  sublicensing, and sale rights.
- The approved multi-project plan enumerates Task 1–3 implementation files at
  `docs/superpowers/plans/2026-08-21-multi-project-control-plane.md:26-31`,
  `:65-77`, and `:113-129`; it does not authorize a license replacement.
- The Task 3 worker report explicitly says no license was changed
  (`.superpowers/sdd/2026-08-21-multi-project-control-plane/task-3-report.md:11-16`),
  confirming this is a separate branch-wide policy change rather than a
  control-plane implementation file.

Impact: merging this branch changes downstream users’ legal rights and makes
the public repository’s GitHub MIT classification stale. The custom license is
internally explicit and the onboarding/license test passes, but that does not
make the change approved for this feature branch.

Disposition: split the license policy into a separately approved change, or
obtain explicit approval to include it before treating this branch as the
multi-project control-plane release.

### P2 — Direct workspace reports can expose private workspace and project identifiers

Evidence:

- Core validation accepts any non-empty control-character-free `workspaceId`
  (`packages/core/src/workspace-control.ts:67-71,148-150`) and any such project
  `id` (`:172-180`); it does not enforce a synthetic-public identifier grammar.
- The aggregate emits the manifest `workspaceId`
  (`packages/core/src/workspace-control.ts:252-255`), and project failures embed
  the raw project ID in the message
  (`packages/cli/src/commands/workspace.ts:154-166`).
- A fresh direct `workspaceCheckCommand` probe with
  `workspaceId: "/private/workspace-secret"` and project ID
  `alice@example.com` returned both values in the report data and diagnostic:
  `workspaceId:"/private/workspace-secret"` and
  `message:"Project 'alice@example.com' exited non-zero."`.

The outer `executeCli` redactor masks common path/email patterns, but the
direct command contract still leaks them and arbitrary private labels are not
guaranteed to match the heuristic. This conflicts with the design requirement
that private values are not echoed into reports (`docs/superpowers/specs/2026-08-21-multi-project-control-plane-design.md:65-70`)
and with the plan’s sanitized-report constraint (`.../2026-08-21-multi-project-control-plane.md:13-22`).

Disposition: restrict workspace/project IDs to synthetic public identifiers, or
sanitize them before constructing both direct and formatted reports. Add direct
and CLI-boundary regression tests.

### P2 — Core aggregate registry output is not closed to the declared contract

Evidence:

- Project results are allowlisted by `cloneProjectResult`, but the registry is
  still copied with an unrestricted object spread
  (`packages/core/src/workspace-control.ts:217-255`, specifically `:254`).
- A fresh runtime probe passed
  `{ revision: 1, digest: "d", audit: "PASS", privateLesson: "secret" }` as
  the typed registry audit and received `aggregate.registry.privateLesson` in
  the serialized report.

The CLI currently constructs the registry object from three allowlisted fields,
so this is not reachable through the normal command path today. It remains a
public core-contract privacy/schema gap and is the same residual boundary noted
but not opened in the Task 1 fix re-review
(`.superpowers/sdd/2026-08-21-multi-project-control-plane/task-1-fix-review.md:26-30`).

Disposition: construct `registry` from exactly `revision`, `digest`, and
`audit`, and add an extra-field regression test analogous to the project-result
test.

## Spec review

The core manifest/aggregate, CLI parser and fixed runner, path containment,
minimal child environment, required/optional aggregation, redaction tests,
fixture, onboarding, and registry gate otherwise match the approved design and
plan:

- `npm run check` is the only accepted child command; execution is `[npm,
  "run", "check"]`, with `npm.cmd`/shell compatibility only on Windows
  (`packages/cli/src/commands/workspace.ts:98-109,229-267`).
- Registry audit precedes all project checks; the aggregate remains non-successful
  and projects are `NOT_RUN` when the audit fails
  (`:202-227`). `APPROVED` registry content is audited without being copied into
  output, while `CANDIDATE` and `BLOCKED` history blocks execution and remains
  visible as `NOT_RUN` (`tests/integration/multi-project-workspace.test.ts:219-283`).
- Required RED results remain visible while later projects run; optional
  missing roots remain visible as `NOT_RUN` and do not fail the required set
  (`tests/cli/workspace-check.test.ts:124-165`).
- The fixture is repository-relative, dependency-free, and has a matching
  registry digest (`examples/multi-project-workspace/workspace.manifest.json:1-19`;
  `examples/multi-project-workspace/knowledge/self-improvement/registry.sha256:1`).
- Onboarding consistently states that the manifest is inside the workspace and
  the displayed command runs from the repository root
  (`AGENTS.md:6-7`; `docs/MULTI_PROJECT_CONTROL_PLANE.md:7-21`;
  `docs/AI_AGENT_WORKFLOW.md:82-104`).

The design says the controller reads `APPROVED` lessons whose scope matches a
project (`docs/superpowers/specs/2026-08-21-multi-project-control-plane-design.md:88-101`).
The current command audits the registry and reports only revision/digest/audit;
it does not expose or pass lessons to child checks. This is safe and prevents
unreviewed instruction injection, but remains a residual interpretation risk if
project-scoped lesson application was intended to be observable in this CLI.

## Standards review and worker reports

The worker chain is complete and its scoped re-reviews are retired:

- Task 1 fix review closes both core findings and records retired status
  (`task-1-fix-review.md:13-24,32-68`).
- Task 2 fix review closes redaction, path-diagnostic, gate/platform coverage,
  and stale-count findings; it records the redaction heuristic as a residual
  (`task-2-fix-review.md:13-72`).
- Task 3 fix review closes approved/candidate/blocked registry coverage and
  onboarding consistency (`task-3-fix-review.md:33-80`).
- The ledger records Tasks 1–3 complete and Task 4 in progress
  (`progress.md:27-32`). Historical count mismatches in the original reports
  are corrected by immutable follow-up reports, not silently rewritten.

The branch is broader than the control-plane commits because it carries prior
flow-save, evidence, AI-operability, and Dataverse documentation work from
`ef38767` through `8890d07`. Those changes have their own specs/reports and are
treated as prerequisites for this cumulative branch. The unscoped license
replacement above is the remaining release-scope finding.

## Verification record

All commands were local and provider-free:

- `node --version`: `v22.23.2`; `npm --version`: `10.9.8`.
- Core focused test: 8 passed, 0 failed.
- CLI focused test: 13 passed, 0 failed.
- Onboarding/license test: 5 passed, 0 failed.
- `npm run build`: exit 0.
- Compiled integration test: 4 passed, 0 failed.
- Real fixture command: exit 0; two required projects `PASS`, registry audit
  `PASS`, revision 1, `LOCAL_SYNTHETIC` evidence.
- `npm test`: 302 passed, 0 failed, 0 skipped.
- `npm run check`: 417 passed, 0 failed, 0 skipped; 19 gates; 0 audit
  vulnerabilities.
- `git diff --check main...HEAD`: exit 0; worktree `git diff --check`: exit 0.
- Clean clone of `e19c9af`: `npm ci` exit 0, build exit 0, fixture command
  exit 0, clean status after execution.
- GitHub Actions result for the three OS matrix was not inspected, per the
  no-external/provider-operation instruction.

## Residual risks

- All evidence is `LOCAL_SYNTHETIC`; provider/tenant, hosted, and UAT gates are
  `NOT_RUN`.
- Child-output redaction remains heuristic rather than a universal secret
  classifier (`task-2-fix-review.md:62-70`).
- The aggregate has no explicit project-scoped approved-lesson application
  channel; only the registry audit gate is observable.
- The custom license requires separate ownership/legal approval before release;
  this review is not legal advice.

Final reviewer status: **retired**
