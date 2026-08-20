# Portable Flow Save Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Power Automate Flow Engineering Kit portable across laptops and prevent outgoing definitions from carrying platform-injected authentication or missing XRM connection-reference names.

**Architecture:** Add a pure, dependency-free preparation function to `@spflow/core` that clones a raw Power Automate definition, removes only action-level `inputs.authentication`, and binds each `OpenApiConnection` host to the logical connection reference declared by alias. Add a cross-platform Node check runner and GitHub Actions workflow so the same deterministic gates run on macOS, Linux, and Windows-compatible Node/npm installations.

**Tech Stack:** Node.js 22, TypeScript 5.9, Node test runner, npm workspaces, GitHub Actions.

**Spec:** `README.md`, `CONTRIBUTING.md`, and the live failure invariant `extra-authentication` plus required `host.connectionReferenceName` for XRM-backed OpenApiConnection saves.

## Global Constraints

- Node.js must remain `>=22.0.0 <23.0.0` and npm must remain `>=10.0.0 <11.0.0`.
- The preparation function must be offline, deterministic, JSON-only, and must not make tenant calls.
- The function must preserve triggers, action order, runAfter, expressions, payloads, and connection aliases.
- Missing or ambiguous connection-reference metadata must fail closed; no logical name may be invented.
- Public repository fixtures must contain synthetic values only.
- Existing offline evidence must remain separate from provider/tenant evidence.

---

### Task 1: Add the RED/GREEN definition-preparation contract

**Files:**
- Create: `tests/unit/core/flow-save.test.ts`
- Create: `packages/core/src/flow-save.ts`
- Modify: `packages/core/package.json`

**Interfaces:**
- Produces `preparePowerAutomateDefinition(definition: unknown, connectionReferences: unknown): unknown`.
- Produces `FlowDefinitionPreparationError` for malformed definitions, missing aliases, or missing logical names.

- [x] **Step 1: Write the failing test**

Create a synthetic OpenApiConnection action with `host.connectionName`, a matching connection-reference map containing `connectionReferenceLogicalName`, and `inputs.authentication`. Assert that preparation removes only `inputs.authentication`, adds the logical `host.connectionReferenceName`, preserves `host.connectionName` and payload fields, and does not mutate the input. Add a second test asserting an unknown alias throws `FlowDefinitionPreparationError`.

- [x] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --experimental-strip-types --test tests/unit/core/flow-save.test.ts
```

Expected: module-import failure because `packages/core/src/flow-save.ts` does not yet exist.

- [x] **Step 3: Implement the minimal pure function**

Implement JSON-safe cloning and recursive traversal of `actions`, `else.actions`, and `cases.*.actions`. For each `OpenApiConnection`, resolve the alias from `host.connectionName` or an existing logical name, require an exact declared reference, set `host.connectionReferenceName` to the declared logical name, and delete only `inputs.authentication`. Throw instead of guessing when the binding is absent or incomplete.

- [x] **Step 4: Run the focused test and confirm GREEN**

Run the same focused command and expect all focused tests to pass.

- [x] **Step 5: Export the helper from `@spflow/core`**

Add `"./flow-save": "./dist/flow-save.js"` to `packages/core/package.json`, then run `npm run build` to verify the compiled export.

### Task 2: Add a portable local acceptance runner

**Files:**
- Create: `scripts/portable-check.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

**Interfaces:**
- Produces `npm run check`, a cross-platform Node runner that invokes build, test, contract, all connector profiles, global/required rule checks, artifact validation, read-only plugin checks, and high-severity dependency audit.

- [x] **Step 1: Add the runner test case to the RED checklist**

Use the existing CLI commands as the acceptance contract; the runner must invoke them through `process.execPath` and `spawnSync`/`spawn` with argument arrays, never shell globs or shell-specific loops.

- [x] **Step 2: Implement the runner**

Fail on any required command exit code other than `0`, print command labels and exit codes, and keep `verify --offline` and open learning candidates out of the required-green `check` command because they are documented external/deferred gates.

- [x] **Step 3: Add documentation**

Document `nvm use`, `npm ci`, `npm run check`, the expected offline-only residual gates, and the new helper's save-boundary usage without tenant credentials.

- [x] **Step 4: Run `npm run check`**

Observed: build, 353 tests, nine connectors, CLI acceptance, plugin read-only checks, and audit passed.

### Task 3: Make GitHub CI enforce the portable contract

**Files:**
- Create: `.nvmrc`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- GitHub Actions runs on Ubuntu, macOS, and Windows with Node 22, `npm ci`, and `npm run check`.

- [x] **Step 1: Add Node 22 pin**

Use `22` in `.nvmrc`; retain exact semver floors in `package.json`.

- [x] **Step 2: Add the matrix workflow**

Use `actions/checkout@v4`, `actions/setup-node@v4` with `node-version-file: .nvmrc` and `cache: npm`, then run `npm ci` and `npm run check` on `ubuntu-latest`, `macos-latest`, and `windows-latest`.

- [x] **Step 3: Validate workflow syntax and local parity**

Run `git diff --check`, `npm run check`, and inspect the workflow for shell-specific commands or secret use.

### Task 4: Provider correction and final release handoff

**Files:**
- Modify only the authorized Power Automate flow definitions through preview-token-bound FlowAgent operations; do not commit tenant data.

- [x] **Step 1: Reconcile each flow identity**

Use fresh `get_flow` readback and do not mutate standalone aliases when the solution/workflow identity or connection-reference entity is unresolved.

- [ ] **Step 2: Apply the smallest live edit**

For a resolvable solution flow, use `edit_flow`/`update_flow` preview plus one token-bound apply to remove action authentication and add logical `host.connectionReferenceName`, preserving aliases and declared refs.

- [ ] **Step 3: Verify provider readback**

Run `validate_flow`, `preflight_flow`, and fresh `get_flow` readback. Do not publish or run business flows until these gates pass and runtime/UAT authorization exists.

- [ ] **Step 4: Validate, commit, and push**

Run the full local check, stage only intended files, commit on `codex/portable-runtime-auth-guard`, push that branch, and report the exact commit and remaining provider blockers.
