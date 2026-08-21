# Task 2 fix report — CLI workspace check review corrections

## Scope

Addressed all four findings in `task-2-review.md` without changing core
contracts, fixtures, providers, parser wiring, help text, or the immutable
Task 2 report.

Changed only:

- `packages/cli/src/commands/workspace.ts`
- `tests/cli/workspace-check.test.ts`
- `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-2-fix-report.md`

## Corrections

1. Child-output redaction recognizes `client_secret`, `access_token`, and
   `refresh_token`, including camelCase and `.`, `_`, and `-` delimiter forms,
   before the value is placed in a command report. Focused coverage asserts
   both the direct report and formatted CLI output contain no unsafe values.
2. Manifest-validation findings use a stable value-free message while keeping
   the original diagnostic code, JSON pointer, and remediation. Regression
   coverage exercises traversal, absolute/private, and symlink-escape paths.
3. Focused deterministic coverage now verifies registry audit failure causes
   zero runner calls, required-versus-optional exit precedence, the Windows
   `npm.cmd`/`shell`/`SystemRoot` branch, and parser/help/handler dispatch.
4. This fresh follow-up report records the current exact test counts; the
   original Task 2 report remains unchanged.

## TDD evidence

### RED

Temporarily reverting only the two production boundary changes and running:

```text
node --experimental-strip-types --test tests/cli/workspace-check.test.ts
```

Result: exit 1; 12 tests total, 10 passed, 2 failed. The failures were the
compound credential leakage assertion and the rejected traversal/absolute path
leakage assertion. This confirms the tests fail for the reviewed defects.

### GREEN

After restoring the minimal fixes, running:

```text
node --experimental-strip-types --test tests/cli/workspace-check.test.ts
```

Result: exit 0; 12 tests total, 12 passed, 0 failed.

## Final local verification

```text
npm test
```

Result: exit 0; 412 tests passed, 0 failed, 0 skipped.

```text
npm run build
```

Result: exit 0.

```text
npm run check
```

Result: exit 0; portable check passed all 19 gates and dependency audit found
0 vulnerabilities.

```text
git diff --check
```

Result: exit 0. No `npm run diff-check` script is defined in this repository;
the standard Git whitespace diff check was used.

## Evidence boundary

Evidence class: `LOCAL_SYNTHETIC`. No provider, hosted, or UAT operation was
performed.

worker status: retired

delegated_subagents: 0
