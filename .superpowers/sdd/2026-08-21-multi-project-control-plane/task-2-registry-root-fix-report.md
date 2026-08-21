# Task 2 registry-root fix report

## Objective and scope

Changed the workspace CLI integration so the governed registry audit uses the
workspace manifest directory as its repository root. The existing realpath
containment check for the registry path remains unchanged and still runs before
the audit.

Evidence class: `LOCAL_SYNTHETIC`.

## Files changed

- `packages/cli/src/commands/workspace.ts`
- `tests/cli/workspace-check.test.ts`
- `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-2-registry-root-fix-report.md`

No fixtures, documentation outside this report, core, license, provider, or
pre-existing unrelated worktree files were changed.

## Root cause and correction

`workspace.ts` derived the audit root from the resolved registry file path with
three parent traversals. The correction removes that derived-root helper and
passes `manifestDirectory` directly to `auditLearningRegistry`, while retaining
`resolveContainedExisting(manifestDirectory, manifest.registryPath)` as the
registry containment gate.

## RED / GREEN evidence

The requested Task 3 fixture path
`examples/multi-project-workspace/registry/registry.json` is absent from this
fork. In addition, this fork's core audit contract accepts only
`knowledge/self-improvement/registry.json`; a `registry/registry.json` path is
rejected by core independently of the CLI root argument. Therefore the exact
Task 3 blocker could not be observed here without changing an out-of-scope
fixture or core file.

The focused regression uses the supported canonical registry layout in a
nested synthetic `examples/multi-project-workspace` manifest directory and
asserts a passing registry audit plus project execution. Its pre-change run
was already GREEN (13 tests passed), so it is recorded as a coverage limitation
rather than falsely claimed as observed RED.

Focused command after the correction:

```text
node --experimental-strip-types --test tests/cli/workspace-check.test.ts
```

Result: exit `0`; 13 tests passed, 0 failed, 0 skipped.

## Final verification

```text
npm test
```

Exit `0`; 413 tests passed, 0 failed, 0 skipped.

```text
npm run build
```

Exit `0`.

```text
npm run check
```

Exit `0`; portable check passed all 19 gates and dependency audit reported 0
vulnerabilities.

```text
git diff --check
```

Exit `0`.

Provider, hosted, publication, and UAT gates: `NOT_RUN`; this is an offline
CLI integration change only.

worker status: retired
