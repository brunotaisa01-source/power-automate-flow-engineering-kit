# Multi-project control plane design

## Status

Design approved in conversation on 2026-08-21; implementation starts only
after this written design is reviewed.

## Goal

Give one clean-context AI a safe control surface for validating several
Power Automate/Power Platform projects while reusing only sanitized,
independently approved engineering lessons across those projects.

## Non-goals

- no credential, cookie, token, tenant export, or raw provider evidence sharing;
- no automatic login, MFA completion, consent, import, rebind, publish, enable,
  run, approval, email, or tenant mutation;
- no silent model-weight training;
- no claim that one project's GREEN result approves another project;
- no automatic promotion of a new RED/GREEN finding into global instructions.

## User workflow

An operator creates a small local manifest that points to project folders and
the shared sanitized registry:

```json
{
  "schemaVersion": "1.0",
  "workspaceId": "synthetic-project-workspace",
  "registryPath": "./knowledge/self-improvement/registry.json",
  "projects": [
    {
      "id": "procurement",
      "root": "./procurement",
      "check": "npm run check",
      "required": true
    },
    {
      "id": "expenses",
      "root": "./expenses",
      "check": "npm run check",
      "required": true
    }
  ]
}
```

The operator runs:

```text
node packages/cli/dist/bin/spflow.js workspace check --manifest workspace.manifest.json --format text
```

The command resolves only safe relative paths, audits the shared registry,
executes each project's declared portable check in an isolated child process,
labels each project result `LOCAL_SYNTHETIC`, and emits one deterministic
aggregate report. The command refuses unknown check commands, absolute paths,
path traversal, duplicate project IDs, duplicate roots, and missing required
projects.

## Architecture

### Manifest loader

`@spflow/core` owns a strict manifest schema and deterministic path resolver.
The loader returns project identities, safe roots, check command metadata, and
required/optional scope. It does not inspect tenant state and never echoes
private path values into diagnostics.

### Workspace runner

`@spflow/cli` owns `workspace check`. It:

1. loads and validates the manifest;
2. audits the exact shared registry before project execution;
3. runs each allowed `npm run check` from that project's root with a bounded
   environment and no secret values copied from the controller;
4. captures exit status and sanitized stdout/stderr summaries;
5. continues through all projects so one RED project cannot hide another;
6. calculates the aggregate result using required-project and exit precedence;
7. emits JSON or text with stable project ordering.

Project checks run in separate child processes. The controller never imports a
project's private application memory into another project's process.

### Global memory

The existing `knowledge/self-improvement/registry.json` remains the only
global instruction source. The controller reads `APPROVED` lessons whose scope
matches a project and reports the registry revision/digest. New findings follow
the existing loop:

```text
RED -> sanitized CANDIDATE -> GREEN -> positive control -> independent review
    -> privacy/history audit -> registry promotion -> next-project consumption
```

`CANDIDATE`, `BLOCKED`, and `RETIRED` lessons remain visible history but are
never applied as instructions. Workspace aggregation does not promote lessons.

### Aggregate report

The report uses the existing CLI report envelope and adds:

```json
{
  "data": {
    "workspaceId": "synthetic-project-workspace",
    "registry": {
      "revision": 1,
      "digest": "[SANITIZED_DIGEST]",
      "audit": "PASS"
    },
    "projects": [
      {
        "id": "procurement",
        "required": true,
        "result": "PASS",
        "exitCode": 0,
        "evidenceClass": "LOCAL_SYNTHETIC"
      }
    ],
    "summary": {
      "total": 1,
      "passed": 1,
      "failed": 0,
      "notRun": 0,
      "blocked": 0
    }
  }
}
```

The aggregate is `PASS` only when the registry audit passes and every required
project returns zero. An optional project may be `NOT_RUN` without failing the
required set, but it remains visible. Any malformed manifest, registry audit
failure, secret/privacy violation, required-project failure, or missing
required project is non-successful and fail-closed.

## Security and privacy

- Manifest paths are relative to the manifest directory and are normalized
  before access.
- Project IDs are synthetic public labels; absolute paths and private values are
  redacted from reports.
- The runner passes only a minimal deterministic environment to child checks;
  it does not forward `SPFLOW_BINDING_*` values or arbitrary secrets.
- Project stdout/stderr is summarized and redacted before it enters the
  aggregate report.
- The controller is local/read-only with respect to Power Platform. A project
  may have its own authorized provider workflow, but the workspace command
  does not invoke it.

## Evidence boundaries

The workspace command proves `LOCAL_SYNTHETIC` orchestration only. It does not
promote project results to `PROVIDER_TENANT`, `HOSTED`, or `UAT`. Each project
must retain its own provider/hosted/UAT evidence and its own connection
references. A shared lesson can describe a reusable invariant, but its claim
boundary remains the evidence class recorded in the registry.

## Test contract

The implementation must add deterministic tests for:

1. a valid two-project manifest produces stable project ordering and a GREEN
   aggregate when both checks pass;
2. one required RED project produces a non-zero aggregate while the other
   project still runs and remains independently reported;
3. an optional missing project is visible as `NOT_RUN` without hiding the
   required result;
4. duplicate IDs, duplicate roots, absolute paths, traversal, unknown check
   commands, malformed JSON, and registry audit failures fail closed;
5. child output is sanitized and no controller secret or private path appears;
6. `APPROVED` lessons are read, while `CANDIDATE`/`BLOCKED` lessons cannot
   change the aggregate or become instructions;
7. the command works with JSON and text reporters and preserves exit-code
   precedence across project results.

## Acceptance criteria

- A new AI can read `AGENTS.md`, this design's implementation, and the workspace
  manifest without prior chat context.
- The same approved lesson is discoverable for all projects without copying
  private project data.
- A RED in project A is preserved as project A RED and cannot be masked by
  project B GREEN.
- A new finding is stored as a sanitized candidate with RED/GREEN/positive
  control evidence before any promotion is possible.
- Full local tests, the portable check, the workspace synthetic fixture, and
  macOS/Linux/Windows CI pass.
