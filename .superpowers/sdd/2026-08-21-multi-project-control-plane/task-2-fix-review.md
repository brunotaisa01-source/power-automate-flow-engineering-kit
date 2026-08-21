# Task 2 fix re-review — CLI workspace check

## Scope

Re-reviewed commit `4571a281c6562b4349111929114004811776c4c9` against the four
findings in `task-2-review.md`. The review covered only the committed Task 2
fixes and their tests. No production files or provider state were changed.

Evidence class: `LOCAL_SYNTHETIC`.

## Finding dispositions

### P1 — Credential-shaped child output can be emitted verbatim: RESOLVED

`packages/cli/src/commands/workspace.ts:76-88` now redacts
`client/access/refresh` plus `secret/token`, as well as password, token,
secret, API-key, and authorization assignments. The expression accepts
underscore, dot, and hyphen delimiters and camelCase forms. The redaction is
applied before a project finding is created, and the CLI boundary is exercised
again by the formatted-report test.

`tests/cli/workspace-check.test.ts:181-209` covers direct and formatted JSON
reports with underscore, camelCase, and hyphen-delimited credential keys. The
focused suite passed 12/12, including this regression.

### P2 — Rejected manifest paths can leak into diagnostics: RESOLVED

`packages/cli/src/commands/workspace.ts:117-127` now emits a stable,
value-free manifest message while retaining the diagnostic code and JSON
pointer. The symlink-escape project-root path is also not copied into the
report.

`tests/cli/workspace-check.test.ts:211-254` covers traversal, absolute/private,
and symlink-escape values, asserts that the private path markers are absent,
and preserves the expected codes/pointers. The focused suite passed 12/12.

### P2 — Registry gate, precedence, Windows, parser, and dispatch coverage is missing: RESOLVED

`tests/cli/workspace-check.test.ts:256-275` verifies a failed registry audit
causes zero runner calls and leaves projects `NOT_RUN`. Lines 277-296 verify
required failure precedence while keeping optional failure warnings. Lines
298-321 verify the Windows `npm.cmd`, `shell: true`, `SystemRoot`, and
allowlisted environment behavior. Lines 323-353 verify parser output, help
text, handler dispatch, and formatted report routing.

The focused suite passed 12/12; the added tests are deterministic and use the
injected runner.

### P2 — Task 2 report test evidence is stale: RESOLVED

The committed follow-up report records current evidence rather than changing
the original immutable Task 2 report. I independently reproduced the reported
results from commit `4571a28`:

- `npm test`: 412 passed, 0 failed, 0 skipped.
- `npm run build`: exit 0.
- `npm run check`: exit 0, all 19 portable gates passed, 0 audit vulnerabilities.
- `git diff --check 4571a28^ 4571a28`: exit 0.

These results match `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-2-fix-report.md:54-80`.

## Residual concerns

- Verification is local and synthetic only; Windows execution, provider,
  hosted, and UAT behavior remain unverified by this review.
- Credential redaction is a targeted heuristic, not a universal credential-key
  schema. The reviewed `client/access/refresh` delimiter and camelCase cases
  are covered; future credential naming variants may need explicit additions.
- The historical RED run in the fix report was not replayed after the commit;
  this re-review verifies the committed GREEN behavior and current evidence.

No finding remains open.

Reviewer status: **retired**

delegated_subagents: 0
