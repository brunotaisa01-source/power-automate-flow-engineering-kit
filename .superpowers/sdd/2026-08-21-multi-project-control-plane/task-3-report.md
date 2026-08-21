# Task 3 worker report — multi-project fixture and onboarding

## Objective and scope

Implemented only Task 3 from the multi-project control-plane plan, following
the final canonical registry ruling. The fixture manifest is located at
`examples/multi-project-workspace/workspace.manifest.json`; its registry path
is exactly `knowledge/self-improvement/registry.json`, and all project roots
are relative to that workspace directory.

No CLI/core source, provider state, license, or other task files were changed.
No helpers were spawned or coordinated.

## Files changed

- `examples/multi-project-workspace/workspace.manifest.json`
- `examples/multi-project-workspace/projects/green-a/package.json`
- `examples/multi-project-workspace/projects/green-a/check.mjs`
- `examples/multi-project-workspace/projects/green-b/package.json`
- `examples/multi-project-workspace/projects/green-b/check.mjs`
- `examples/multi-project-workspace/projects/red/package.json`
- `examples/multi-project-workspace/projects/red/check.mjs`
- `examples/multi-project-workspace/knowledge/self-improvement/registry.json`
- `examples/multi-project-workspace/knowledge/self-improvement/registry.sha256`
- `docs/MULTI_PROJECT_CONTROL_PLANE.md`
- `AGENTS.md`
- `README.md`
- `docs/AI_AGENT_WORKFLOW.md`
- `tests/integration/multi-project-workspace.test.ts`
- `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-3-report.md`

## TDD evidence

### RED

Command:

```text
node --experimental-strip-types --test tests/integration/multi-project-workspace.test.ts
```

Result: exit `1`. The test failed with `ENOENT` for the missing
`examples/multi-project-workspace` fixture directory. This was the intended
pre-implementation failure: no compiled-CLI fixture contract existed.

### GREEN

Command:

```text
node --experimental-strip-types --test tests/integration/multi-project-workspace.test.ts
```

Result: exit `0`; 1 test passed, 0 failed. The compiled CLI verifies two
required GREEN projects, a required RED that does not mask either GREEN
project, visible optional `NOT_RUN`, and the real global registry's unresolved
candidate gate. The gate keeps the required project visible as `NOT_RUN` and
the deterministic check marker proves zero child-runner calls.

## Compiled fixture command

```text
node packages/cli/dist/bin/spflow.js workspace check --manifest examples/multi-project-workspace/workspace.manifest.json --format json
```

Result: exit `0`; registry audit `PASS` at revision `1` with digest
`22251cd799afe4979cf166caf87ae9fec377016ce9d4b8981a5f776b9cca727c`, and
both required fixture projects passed with `LOCAL_SYNTHETIC` evidence.

## Final local verification

```text
npm run build
```

Result: exit `0`.

```text
npm test
```

Result: exit `0`; 414 tests passed, 0 failed, 0 skipped.

```text
npm run check
```

Result: exit `0`; portable checks passed.

```text
git diff --check
```

Result: exit `0`.

## Evidence boundary and remaining risk

Evidence class: `LOCAL_SYNTHETIC`. `PROVIDER_TENANT`, `HOSTED`, and `UAT` are
`NOT_RUN`: this task does not authenticate, mutate a tenant, execute a flow,
or perform user acceptance.

The real global registry intentionally contains an unresolved candidate and
therefore blocks workspace execution; this is verified behavior, not a defect.
The next safe action is Task 4's independent review and release evidence.

worker status: retired

delegated_subagents: 0
