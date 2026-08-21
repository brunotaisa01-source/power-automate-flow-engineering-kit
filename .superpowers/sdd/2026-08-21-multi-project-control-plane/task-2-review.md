# Task 2 review — CLI workspace check and isolated project runner

## Review target and scope

Reviewed commit `f3d441afc32d20984f62256ca9c566d355ad62f5` against
`docs/superpowers/specs/2026-08-21-multi-project-control-plane-design.md`,
Task 2 of `docs/superpowers/plans/2026-08-21-multi-project-control-plane.md`,
and the committed Task 2 report. The review covered the parent-to-commit
diff, parser/help/handler wiring, manifest and realpath containment, fixed
command execution, child environment isolation, report redaction, registry
gating, aggregation, exit behavior, Windows compatibility, and tests.

The existing worktree change to `progress.md` was preserved. No production
files or provider state were changed.

## Findings

### P1 — Credential-shaped child output can be emitted verbatim

Evidence: `packages/cli/src/commands/workspace.ts:76-88` only recognizes a
small set of standalone credential labels. It does not match common keys such
as `client_secret`, `access_token`, or `refresh_token`; the underscore prevents
the `\b` boundary before `secret`/`token`. `projectFailure` then embeds the
result at `:158-167` in the diagnostic message. A fresh probe of the extracted
commit with child output
`client_secret=unsafe access_token=unsafe` returned both values unchanged in
the JSON report.

Recommendation: reuse the centralized CLI redaction routine or extend the
credential recognizer to cover delimiter-, underscore-, and camel-case forms,
including client/access/refresh secrets and token assignments. Add regression
tests that assert those values cannot appear in either direct command reports
or formatted CLI output.

### P2 — Rejected manifest paths can leak into diagnostics

Evidence: `packages/cli/src/commands/workspace.ts:117-126` copies
`WorkspaceDiagnostic.message` directly into a report. The shared path policy
includes the rejected input in errors such as
`Repository path traversal is forbidden: '../outside'.`; the normal CLI
redactor does not remove traversal paths and its absolute-path expression does
not match a path enclosed in the single quotes produced by the policy. A fresh
probe through `executeCli` showed `../outside` in the emitted JSON diagnostic.
An absolute path containing a user name has the same quoted-path exposure.
This conflicts with the design requirement that private path values are not
echoed into diagnostics.

Recommendation: make manifest findings use stable, value-free messages (retain
the JSON pointer and diagnostic code), or apply one path-safe redaction helper
before report construction and again at the final reporter boundary. Add
absolute, traversal, symlink-escape, and quoted-path regression cases.

### P2 — Acceptance-critical gating, precedence, and platform branches are not tested

Evidence: `tests/cli/workspace-check.test.ts` has five tests, but none creates
an invalid/digest-mismatched/open-candidate registry and asserts that the
runner is never called; none exercises required-root failure together with
other exit codes or optional check failure; and none covers the
`platform: "win32"` branch (`npm.cmd`, `shell: true`, and `SystemRoot`). The
parser/help/`CliHandlers` wiring is implemented in
`packages/cli/src/parse-args.ts` and `packages/cli/src/bin/spflow.ts`, but the
focused tests do not assert the route, help line, or compiled handler dispatch.
Consequently the report's fail-closed registry claim, exit precedence, and
Windows behavior are primarily static claims rather than regression-tested
behavior.

Recommendation: add deterministic tests for registry audit failure with zero
child invocations, mixed required/optional failures and precedence, the
Windows runner options/environment, and parser/help/`executeCli` dispatch.

### P2 — Task 2 report test evidence is stale

Evidence: `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-2-report.md:61-65`
claims `npm test` passed 290 tests. Running the committed tree from a temporary
extraction of `f3d441a` produced 405 passing tests, including the five focused
workspace tests; build and portable-check execution also completed without a
reported failure. The mismatch makes the handoff evidence non-reproducible.

Recommendation: rerun and record the exact commands from the committed tree,
including the actual test count and portable-check result, then leave the
corrected evidence in a follow-up immutable review/report record if the worker
report itself must remain unchanged.

## Positive checks

- The parser route, help line, handler registration, exact `[npm, "run",
  "check"]` argument array, and `npm.cmd`/Windows shell branch are present.
- Manifest validation rejects absolute/traversal paths, duplicate IDs/roots,
  and non-exact check commands; existing project roots are realpath-checked
  before execution; project output is summarized rather than copied into
  aggregate project data.
- Child environments are allowlisted to `PATH`, Windows `SystemRoot`, and
  `npm_config_loglevel`; `SPFLOW_BINDING_*` values are not forwarded.
- Project execution continues after a failure, required/optional results stay
  visible, aggregate ordering is deterministic, and registry audit occurs
  before project execution.
- Fresh focused verification of the extracted commit passed 5/5 workspace
  tests; the full test run passed 405/405 tests. Evidence class is
  `LOCAL_SYNTHETIC`; provider, hosted, and UAT gates were not exercised.

Reviewer status: **retired**

delegated_subagents: 0
