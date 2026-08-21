# Task 2 worker report — CLI workspace check and isolated project runner

## Objective and scope

Implemented only Task 2 from
`docs/superpowers/plans/2026-08-21-multi-project-control-plane.md`.
The CLI now supports `workspace check --manifest <path> --format text|json`.
It validates a safe manifest, audits the exact governed registry before any
project runs, executes only `npm run check` in isolated child processes, and
returns a core-contract aggregate with `LOCAL_SYNTHETIC` project evidence.

No core contracts, fixtures, product documentation, provider state, registry
contents, license, or Task 1 files were changed. No helper workers were
spawned or coordinated.

## Files changed

- `packages/cli/src/commands/workspace.ts`
- `packages/cli/src/parse-args.ts`
- `packages/cli/src/bin/spflow.ts`
- `tests/cli/workspace-check.test.ts`
- `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-2-report.md`

## TDD evidence

### RED

Command:

```text
node --experimental-strip-types --test tests/cli/workspace-check.test.ts
```

Result: exit 1. The expected failure was
`ERR_MODULE_NOT_FOUND` for `packages/cli/src/commands/workspace.ts`; the
workspace command, parser route, and runner did not exist yet.

### GREEN

Command:

```text
node --experimental-strip-types --test tests/cli/workspace-check.test.ts
```

Result: exit 0; 5 tests passed, 0 failed. The focused tests prove a stable
two-project GREEN aggregate; fixed `[npm, "run", "check"]` arguments;
allowlisted child environment; continuation after a required RED; optional
missing-root `NOT_RUN`; malformed-manifest/unknown-command failure; and
redaction of child paths, emails, IDs, credential-shaped values, and controller
binding values.

## Final local verification

```text
npm run build
```

Result: exit 0.

```text
npm test
```

Result: exit 0; 290 tests passed, 0 failed, 0 skipped.

```text
npm run check
```

Result: exit 0; portable check passed all 19 gates; dependency audit reported
0 vulnerabilities.

```text
git diff --check
```

Result: exit 0.

## Evidence class and boundaries

Evidence class: `LOCAL_SYNTHETIC`.

`PROVIDER_TENANT`, `HOSTED`, and `UAT` are `NOT_RUN`: Task 2 performs no
login, tenant mutation, flow run, email, approval, deployment, or acceptance
scenario. The existing checked-in registry audit remains non-successful because
`wp-17-skill-tdd-loophole` is an unresolved candidate; the new command treats
that condition as a fail-closed registry gate and does not change the registry.

## Limitations and next safe action

The runner is verified with injected deterministic child results; Task 3 owns
the dependency-free multi-project fixture and compiled-CLI end-to-end command.
The next safe action is Task 3: add that synthetic fixture and integration test
without changing the governed registry or promoting any candidate.

worker status: retired

delegated_subagents: 0
