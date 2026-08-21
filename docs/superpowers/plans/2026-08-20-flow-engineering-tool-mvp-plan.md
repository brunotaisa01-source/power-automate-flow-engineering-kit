# Flow Engineering Tool MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the portable local Flow Engineering Tool MVP from `docs/superpowers/specs/2026-08-20-flow-engineering-tool-design.md` with complete TDD, worker handoffs, reviews, and cross-platform gates.

**Architecture:** Keep pure JSON preparation in `@spflow/core`, add file/report orchestration in the CLI, and preserve the existing offline solution/connector validators. Every worker owns a disjoint file set, writes a sanitized handoff, and stops after review; only the coordinator integrates decisions and controls the branch.

**Tech Stack:** Node.js 22, npm workspaces, TypeScript 5.9, Node test runner, JSON fixtures, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-20-flow-engineering-tool-design.md`

## Global Constraints

- Node.js must remain `>=22.0.0 <23.0.0` and npm must remain `>=10.0.0 <11.0.0`.
- The MVP must be offline/read-only with respect to tenants.
- Public files contain synthetic placeholders only; no raw local Dataverse evidence is copied.
- Missing or ambiguous connection references fail closed; no values are invented.
- Every task uses RED → GREEN → positive control/mutation → full verification.
- Workers do not dispatch, coordinate, review, or retire other workers; they only implement their brief and write their handoff.
- No GitHub push, PR, merge, publish, or tenant mutation is performed by a worker.

## Coordinator checklist

- [ ] Create SDD workspace and ledger.
- [ ] Preflight plan conflict scan recorded in ledger.
- [ ] Task 1 worker + task review complete.
- [ ] Task 2 worker + task review complete.
- [ ] Task 3 worker + task review complete.
- [ ] Task 4 worker + task review complete.
- [ ] Whole-branch review complete.
- [ ] `npm run check`, privacy scan, and CI rerun on final commit.
- [ ] Every worker handoff stored and worker retired.
- [ ] Final goal completion only after all evidence gates pass.

### Task 1: Core preparation and flow command contract

**Files:**
- Modify: `packages/core/src/flow-save.ts`
- Modify: `packages/core/package.json`
- Create/modify: `packages/cli/src/commands/prepare-flow.ts`
- Modify: `packages/cli/src/parse-args.ts`
- Modify: `packages/cli/src/bin/spflow.ts`
- Test: `tests/unit/core/flow-save.test.ts`
- Test: `tests/cli/prepare-flow.test.ts`
- Handoff: `.superpowers/sdd/flow-engineering-tool-mvp-plan/task-1-report.md`

**Interfaces:**
- `preparePowerAutomateDefinition(definition, connectionReferences): unknown` remains the pure transformation boundary.
- CLI routes `prepare flow` and `validate flow` consume definition and connection-reference JSON paths and return the existing `CommandReport` shape.

- [ ] **Step 1: Add RED tests** for both CLI routes: valid synthetic definition, missing alias, nested authentication, no output overwrite, JSON report, and deterministic exit codes.
- [ ] **Step 2: Run focused RED tests** and record the intended failures in the worker handoff.
- [ ] **Step 3: Implement the smallest CLI/file/report layer** with argument arrays and explicit output-only writes.
- [ ] **Step 4: Run focused GREEN tests, independent positive control, and mutation test.**
- [ ] **Step 5: Run build and the affected CLI suite; write the handoff with files, commands, results, concerns, and evidence boundary.**

### Task 2: Local evidence reporting and ZIP/flow inspection bridge

**Files:**
- Create: `packages/core/src/evidence-report.ts`
- Create/modify: `packages/cli/src/commands/report-evidence.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/cli/src/parse-args.ts`
- Modify: `packages/cli/src/bin/spflow.ts`
- Test: `tests/unit/core/evidence-report.test.ts`
- Test: `tests/cli/report-evidence.test.ts`
- Handoff: `.superpowers/sdd/flow-engineering-tool-mvp-plan/task-2-report.md`

**Interfaces:**
- `createLocalEvidenceReport(input): LocalEvidenceReport` accepts prepared definition diagnostics and existing local artifact results, emits `LOCAL_SYNTHETIC` claims, and emits explicit `NOT_VERIFIED` provider/UAT gates.
- CLI route `report evidence <path> --format text|json` never reads tenant state and never presents local evidence as provider PASS.

- [ ] **Step 1: Add RED tests** for local/provider boundary labels, deterministic ordering, private-value redaction, and missing evidence.
- [ ] **Step 2: Run focused RED tests.**
- [ ] **Step 3: Implement the pure report builder and CLI adapter.**
- [ ] **Step 4: Run GREEN, positive-control, mutation, build, and CLI tests.**
- [ ] **Step 5: Write a sanitized worker handoff and retire the worker after review.**

### Task 3: Read-only provider adapter contract

**Files:**
- Create: `packages/core/src/provider-readonly.ts`
- Modify: `packages/core/package.json`
- Create: `contracts/provider-readonly.schema.json`
- Create: `fixtures/provider-readonly/synthetic-readback.json`
- Test: `tests/unit/core/provider-readonly.test.ts`
- Test: `tests/integration/provider-readonly-boundary.test.ts`
- Handoff: `.superpowers/sdd/flow-engineering-tool-mvp-plan/task-3-report.md`

**Interfaces:**
- `ReadonlyProviderSnapshot` represents environment/solution/flow/reference metadata without credentials or raw payloads.
- `validateReadonlyProviderSnapshot(snapshot)` fails closed on mutation capabilities, missing identity correlation, ambiguous references, or provider/UAT claims without readback.

- [ ] **Step 1: Add RED tests** for mutation-free capability, identity mismatch, ambiguous connection reference, and provider-vs-local evidence separation.
- [ ] **Step 2: Run focused RED tests.**
- [ ] **Step 3: Implement schema-validated types and pure snapshot validator; do not call a tenant.**
- [ ] **Step 4: Run GREEN, independent positive control, mutation, full build, and check.**
- [ ] **Step 5: Write a handoff documenting that the adapter contract is provider-ready but not a live connector.**

### Task 4: Documentation, Dataverse training integration, and release checklist

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `skills/power-automate-flow-engineering-kit-dataverse/SKILL.md`
- Modify: `docs/connectors/dataverse-red-green.md`
- Modify: `examples/minimal-public-app/connectors/dataverse.red-green.json`
- Test: `tests/skills/dataverse-flow-engineering-kit-skill.test.ts`
- Create: `docs/release/mvp-release-checklist.md`
- Handoff: `.superpowers/sdd/flow-engineering-tool-mvp-plan/task-4-report.md`

**Interfaces:**
- Dataverse training remains sanitized and `LOCAL_SYNTHETIC`/`NOT_VERIFIED` for provider and UAT.
- Release checklist names exact commands, CI run, privacy scan, worker handoffs, review verdicts, and remaining blockers.

- [ ] **Step 1: Add RED tests** for missing skill/context/release checklist and private marker rejection.
- [ ] **Step 2: Run focused RED tests.**
- [ ] **Step 3: Add minimal documentation and sanitized scenarios.**
- [ ] **Step 4: Run GREEN, full local check, privacy scan, and documentation consistency checks.**
- [ ] **Step 5: Write the handoff and retire the worker after review.**

## Review protocol

For each task, the coordinator records the base commit, extracts a task brief, dispatches one worker, waits for its report, generates a diff review package, dispatches a separate spec/quality reviewer, and runs a fix round through the same worker if needed. Workers never coordinate or review. After all tasks, the coordinator dispatches one broad whole-branch reviewer and resolves all findings before completion.

## Final verification

```text
npm ci
npm run check
git diff --check
privacy scan over public additions
GitHub Actions matrix on final commit
```

No Dataverse tenant import, flow run, publish, email, or business-row mutation is part of this MVP's completion claim.
