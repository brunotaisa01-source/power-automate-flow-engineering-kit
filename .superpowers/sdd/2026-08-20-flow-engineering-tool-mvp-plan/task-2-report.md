# Task 2 worker handoff

## Status

DONE. Task 2 is implemented and verified in local synthetic/offline scope. No subagents were dispatched; no worker coordination, review, push, merge, publish, tenant call, provider mutation, or UAT action was performed.

## Files

- `packages/core/src/evidence-report.ts` — pure deterministic local evidence report builder and exported input/output types.
- `packages/core/package.json` — exports `@spflow/core/evidence-report`.
- `packages/cli/src/commands/report-evidence.ts` — local JSON file adapter and existing `CommandReport` integration.
- `packages/cli/src/parse-args.ts` — `report evidence <path> --format text|json` route.
- `packages/cli/src/bin/spflow.ts` — route registration and help text.
- `tests/unit/core/evidence-report.test.ts` — core RED/GREEN, ordering, redaction, missing evidence, positive control, and mutation coverage.
- `tests/cli/report-evidence.test.ts` — JSON/text CLI, unreadable input, boundary, redaction, and local-failure coverage.

Task 1 implementation and tests were not modified.

## RED

Command:

```text
node --experimental-strip-types --test tests/unit/core/evidence-report.test.ts tests/cli/report-evidence.test.ts
```

Result: expected RED. Five tests failed: the new CLI route was still unrecognized, and the new core module did not yet exist. Existing route handling returned the generic argument-parsing result instead of `report evidence`.

## GREEN and verification

- `node --experimental-strip-types --test tests/unit/core/evidence-report.test.ts` — 6 passed, 0 failed.
- `npm run build` — exit 0.
- `node --experimental-strip-types --test tests/cli/report-evidence.test.ts tests/cli/prepare-flow.test.ts tests/unit/cli/parse-args.test.ts tests/unit/core/flow-save.test.ts` — 37 passed, 0 failed; Task 1 flow behavior remained green.
- `npm test` — 282 passed, 0 failed.
- `npm run check` — exit 0; build passed, 377 tests passed, all 19 portable-check gates passed, and npm audit reported 0 vulnerabilities.
- `git diff --check` — clean.

Independent positive control:

```text
node --experimental-strip-types --test --test-name-pattern='independent positive control' tests/unit/core/evidence-report.test.ts
```

Result: 1 passed, 0 failed. A structurally different branch-inspection input using `preparedDefinitionDiagnostics` and `localArtifactResults` produced a local PASS while provider and UAT remained `NOT_VERIFIED`.

Mutation/counterexample:

```text
node --experimental-strip-types --test --test-name-pattern='FAIL mutation' tests/cli/report-evidence.test.ts
```

Result: 1 passed, 0 failed. Mutating a synthetic local artifact result to `FAIL` returned CLI exit code 1 and retained both external gates as `NOT_VERIFIED`; it did not mint provider PASS.

## Design decisions

- `createLocalEvidenceReport` is pure and accepts either nested prepared-definition evidence or the explicit `preparedDefinitionDiagnostics`/`localArtifactResults` forms.
- Claims are always `claimClass=LOCAL_SYNTHETIC`; claims and diagnostics are sorted by stable identifiers/fields, independent of input order.
- The report always emits `providerGate=NOT_VERIFIED` and `uatGate=NOT_VERIFIED`, plus explicit provider/UAT gate records.
- Missing local evidence produces deterministic `LOCAL_*_EVIDENCE_MISSING` diagnostics and a `NOT_RUN` local result.
- Core and CLI output redacts absolute paths, non-example URLs, email addresses, UUIDs, bearer values, and nested diagnostic values.
- The CLI reads only the explicitly supplied local JSON path, returns the existing `CommandReport` shape, and adds text-visible `LOCAL_SYNTHETIC`, `PROVIDER_NOT_VERIFIED`, and `UAT_NOT_VERIFIED` diagnostics.

## Evidence boundary

All fixtures and report inputs are synthetic. A local `PASS` means only that the supplied offline definition diagnostics and local artifact results passed the local builder’s checks. The route never reads tenant state and never claims provider readback, import, connection rebinding, enablement, publication, execution, hosted verification, or UAT. Provider and UAT remain open residual gates.

## Concerns

- Cross-platform CI and any later provider/UAT adapter work remain outside this worker’s scope and were not run or attempted.
- A report with no completed local claim remains `NOT_RUN` and is non-successful at the CLI boundary; this is intentional fail-closed behavior.

## Commit hash

Implementation commit: `e35c3286161bd4f347ebbc56dafb4772c60d0546` (`feat: add local evidence reporting`).
