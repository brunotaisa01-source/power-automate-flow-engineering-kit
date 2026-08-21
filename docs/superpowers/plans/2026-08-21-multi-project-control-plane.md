# Multi-project Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe `spflow workspace check` command that validates multiple local projects independently while consulting one governed self-improvement registry.

**Architecture:** Keep manifest validation and aggregate types in `@spflow/core`; keep child-process orchestration, CLI parsing, reporting, and exit precedence in `@spflow/cli`. The controller accepts only the fixed `npm run check` project command, never forwards controller secrets, and labels all project results `LOCAL_SYNTHETIC`. Existing `learn audit` remains the gate for shared memory; no workspace command promotes lessons.

**Tech Stack:** TypeScript 5.9, Node.js 22, Node `node:test`, `@spflow/core`, `@spflow/cli`, JSON manifest/fixtures, existing text/JSON reporters.

**Spec:** `docs/superpowers/specs/2026-08-21-multi-project-control-plane-design.md`

## Global Constraints

- Node.js `>=22.0.0 <23.0.0` and npm `>=10.0.0 <11.0.0`.
- Manifest paths must be repository-relative, normalized, and free of `..`, absolute prefixes, control characters, symlink escapes, duplicate IDs, and duplicate roots.
- The only accepted project check command is exactly `npm run check`; no shell fragments, pipes, redirects, or arbitrary executables are accepted.
- Child processes receive a minimal environment and never receive `SPFLOW_BINDING_*` values from the controller.
- Project output is sanitized before entering aggregate JSON/text reports.
- `APPROVED` lessons may be audited/read; `CANDIDATE`, `BLOCKED`, and `RETIRED` lessons may not become instructions.
- No command in this feature performs tenant login, connection mutation, import, rebind, publish, enable, run, approval, email, or registry promotion.
- Every behavior change requires a focused RED test, GREEN implementation, full tests, build, portable check, and `git diff --check`.

---

### Task 1: Core workspace manifest and aggregate contracts

**Files:**
- Create: `packages/core/src/workspace-control.ts`
- Modify: `packages/core/package.json`
- Test: `tests/unit/core/workspace-control.test.ts`

**Interfaces:**
- Produces `WorkspaceManifest`, `WorkspaceProject`, `WorkspaceProjectResult`, `WorkspaceRegistryAudit`, `WorkspaceAggregateData`, and `WorkspaceDiagnostic` types.
- Produces `validateWorkspaceManifest(value: unknown): WorkspaceDiagnostic[]`.
- Produces `aggregateWorkspaceResults(manifest: WorkspaceManifest, registryAudit: WorkspaceRegistryAudit, projects: readonly WorkspaceProjectResult[]): WorkspaceAggregateData`.
- Consumes `normalizeRepositoryPath` from `@spflow/core/path-policy` and existing `ExitCode`-compatible numeric values without importing CLI code.

- [ ] **Step 1: Write the failing core tests.**

  Add tests that assert a valid two-project manifest validates, duplicate IDs/roots and `..` paths fail, only `npm run check` is accepted, and aggregation preserves stable project order while treating any required non-zero result as non-successful.

- [ ] **Step 2: Run the focused RED test.**

  Run `node --experimental-strip-types --test tests/unit/core/workspace-control.test.ts`.

  Expected: the module import or required exports fail because the workspace-control module does not exist.

- [ ] **Step 3: Implement the smallest pure core module.**

  Use strict object/array/string checks, `normalizeRepositoryPath`, deterministic sorting by project ID, and an immutable return shape. Do not perform filesystem access or child-process execution in core.

- [ ] **Step 4: Run the focused GREEN test.**

  Run `node --experimental-strip-types --test tests/unit/core/workspace-control.test.ts` and confirm every manifest/aggregation assertion passes.

- [ ] **Step 5: Build the core workspace.**

  Run `npm run build` and confirm the new `@spflow/core/workspace-control` export compiles with declarations.

- [ ] **Step 6: Commit the core contract.**

  Run `git add packages/core/src/workspace-control.ts packages/core/package.json tests/unit/core/workspace-control.test.ts && git commit -m "feat: add multi-project workspace contracts"`.

### Task 2: CLI workspace check and isolated project runner

**Files:**
- Create: `packages/cli/src/commands/workspace.ts`
- Modify: `packages/cli/src/parse-args.ts`
- Modify: `packages/cli/src/bin/spflow.ts`
- Test: `tests/cli/workspace-check.test.ts`

**Interfaces:**
- Consumes `WorkspaceManifest` and `aggregateWorkspaceResults` from `@spflow/core/workspace-control`.
- Produces `workspaceCheckCommand(args: readonly string[], options?: WorkspaceCheckOptions): Promise<CommandReport>`.
- Adds parsed route `workspace-check` with `manifestPath` and `format`.
- Runs only `[npmExecutable(), "run", "check"]` with `cwd` set to each resolved project root, `shell: false` except the existing Windows `npm.cmd` compatibility path, and an allowlisted environment containing `PATH`, `SystemRoot` on Windows, and `npm_config_loglevel=error` only.

- [ ] **Step 1: Write failing CLI tests.**

  Add temp-directory tests for a two-project GREEN manifest, one required RED project that does not mask the other project, an optional missing project reported as `NOT_RUN`, malformed manifests, unknown commands, and output redaction. Stub `spawnSync` through a runner dependency injected into `workspaceCheckCommand` rather than executing arbitrary commands in unit tests.

- [ ] **Step 2: Run the focused RED test.**

  Run `node --experimental-strip-types --test tests/cli/workspace-check.test.ts`.

  Expected: the parser route/handler and workspace command module are missing.

- [ ] **Step 3: Implement manifest loading and path containment.**

  Resolve the manifest file, registry path, and project roots from the manifest directory; reject realpath escapes and missing required roots; keep optional missing roots visible as `NOT_RUN`.

- [ ] **Step 4: Implement registry audit gating.**

  Invoke the existing learning audit with the exact registry path before project checks. If audit diagnostics include candidate/block/privacy/schema/digest failures, emit a non-successful aggregate and do not treat any lesson as instructions.

- [ ] **Step 5: Implement isolated fixed-command execution.**

  Execute every project independently, capture exit code/stdout/stderr, redact absolute paths/emails/GUIDs/credential-shaped values with existing CLI redaction semantics, and continue after failures. Never forward `SPFLOW_BINDING_*` environment variables.

- [ ] **Step 6: Wire parser, handler, help, and reporters.**

  Add `workspace check --manifest workspace.manifest.json [--format text|json]` to `parseCliArgs`, `CliHandlers`, `HELP_TEXT`, and the CLI build entrypoint. Use the existing `createCommandReport` and reporter output; required project failure returns a non-zero exit code.

- [ ] **Step 7: Run the focused GREEN test and full CLI checks.**

  Run `node --experimental-strip-types --test tests/cli/workspace-check.test.ts`, then `npm test` and `npm run build`.

- [ ] **Step 8: Commit the runner.**

  Run `git add packages/cli/src/commands/workspace.ts packages/cli/src/parse-args.ts packages/cli/src/bin/spflow.ts tests/cli/workspace-check.test.ts && git commit -m "feat: add isolated multi-project workspace check"`.

### Task 3: Synthetic workspace fixture, global-memory behavior, and onboarding

**Files:**
- Create: `examples/multi-project-workspace.manifest.json`
- Create: `examples/multi-project-workspace/projects/green-a/package.json`
- Create: `examples/multi-project-workspace/projects/green-a/check.mjs`
- Create: `examples/multi-project-workspace/projects/green-b/package.json`
- Create: `examples/multi-project-workspace/projects/green-b/check.mjs`
- Create: `examples/multi-project-workspace/projects/red/package.json`
- Create: `examples/multi-project-workspace/projects/red/check.mjs`
- Create: `examples/multi-project-workspace/knowledge/self-improvement/registry.json`
- Create: `examples/multi-project-workspace/knowledge/self-improvement/registry.sha256`
- Create: `docs/MULTI_PROJECT_CONTROL_PLANE.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/AI_AGENT_WORKFLOW.md`
- Test: `tests/integration/multi-project-workspace.test.ts`

**Interfaces:**
- Consumes the `workspace check` CLI from Task 2.
- Produces a repository-relative example manifest and a deterministic three-project synthetic test harness.
- Produces onboarding text that tells a clean-context AI how to create a manifest, run the controller, interpret per-project results, and capture/promote new lessons safely.

- [ ] **Step 1: Write the failing integration test.**

  Add a test that runs the compiled CLI against the fixture manifest with two GREEN projects, mutates the manifest to include the RED project, and verifies the aggregate contains separate project results and never promotes a candidate lesson.

- [ ] **Step 2: Run the focused RED test.**

  Run `node --experimental-strip-types --test tests/integration/multi-project-workspace.test.ts`.

  Expected: the fixture manifest and integration behavior are missing.

- [ ] **Step 3: Add synthetic project checks and manifest.**

  Each fixture project uses a dependency-free `npm run check` script. Green checks exit zero with synthetic output; the red check exits one with a deterministic red code. The manifest uses only relative paths and a fixture-local registry at `examples/multi-project-workspace/knowledge/self-improvement/registry.json`, which follows the canonical global registry contract.

- [ ] **Step 4: Add the operator/AI runbook.**

  Document the exact first-use sequence, global registry revision, per-project isolation, RED/GREEN/BLOCKED semantics, candidate capture, independent review, and the explicit boundary that provider/hosted/UAT evidence remains project-specific.

- [ ] **Step 5: Run focused GREEN and real fixture command.**

  Run `node --experimental-strip-types --test tests/integration/multi-project-workspace.test.ts` and `node packages/cli/dist/bin/spflow.js workspace check --manifest examples/multi-project-workspace.manifest.json --format json`. Confirm two projects pass, output is deterministic, and no private values appear.

- [ ] **Step 6: Run full acceptance.**

  Run `npm run build`, `npm test`, `npm run check`, and `git diff --check`.

- [ ] **Step 7: Commit fixtures and onboarding.**

  Run `git add examples/multi-project-workspace.manifest.json examples/multi-project-workspace docs/MULTI_PROJECT_CONTROL_PLANE.md AGENTS.md README.md docs/AI_AGENT_WORKFLOW.md tests/integration/multi-project-workspace.test.ts && git commit -m "test: add multi-project control-plane fixture"`.

### Task 4: Final independent review and release evidence

**Files:**
- Modify: `.superpowers/sdd/2026-08-21-multi-project-control-plane/progress.md`
- Create: `.superpowers/sdd/2026-08-21-multi-project-control-plane/task-*.md`
- Test: clean clone of the published branch and GitHub Actions CI.

**Interfaces:**
- Consumes all Tasks 1–3 outputs and the design spec.
- Produces worker retirement reports, final release evidence, and a public branch/PR that contains the implementation.

- [ ] **Step 1: Review each worker report and exact diff.**

  Confirm only assigned files changed, each worker recorded RED/GREEN and retired, and no secrets, tenant identifiers, or generated private evidence entered the public branch.

- [ ] **Step 2: Run repository-wide local gates.**

  Run `npm run build`, `npm test`, `npm run check`, `git diff --check`, and the real fixture command. Record exact counts and exit codes.

- [ ] **Step 3: Run the clean-context user test.**

  Clone the published branch into a fresh temporary directory, run `npm ci`, read `AGENTS.md`/`README.md`/`docs/MULTI_PROJECT_CONTROL_PLANE.md`, run the workspace command, and confirm the fresh clone is clean after execution.

- [ ] **Step 4: Wait for GitHub CI.**

  Confirm the latest PR workflow passes `portable-check` on `ubuntu-latest`, `macos-latest`, and `windows-latest` for the final commit.

- [ ] **Step 5: Commit release evidence and push.**

  Run `git status --short`, `git diff --check`, `git push origin HEAD`, and record the final commit, branch, PR, CI run, clean-clone result, and residual provider/hosted/UAT boundaries. Keep the PR draft unless the user explicitly requests a ready-for-review or merge action.
