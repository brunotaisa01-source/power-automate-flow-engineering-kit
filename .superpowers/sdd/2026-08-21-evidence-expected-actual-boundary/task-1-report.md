# Worker report — evidence expected/actual boundary

## Status

DONE for the bounded local repository task. No Power Automate or Dataverse state
was read or changed. No publish, push, merge, coordination, or subagent
dispatch was performed.

`incident_id`: `FAIL-20260821-evidence-expected-actual-values`
`wave/task`: worker / evidence expected-actual boundary
`evidence_class`: `LOCAL_RUNTIME`

## RED

Added the regression first, then ran:

```text
node --experimental-strip-types --test --test-name-pattern='fails closed for unsupported or cyclic expected and actual values' tests/unit/core/evidence-report.test.ts
```

Result: exit `1`. The malformed diagnostic was accepted and the report result
was `PASS` instead of the required `NOT_RUN`.

The counterexamples cover a `BigInt`, a `Symbol`, and a cyclic object in the
`expected`/`actual` diagnostic fields.

## GREEN

Implemented the smallest core-boundary correction in
`packages/core/src/evidence-report.ts`:

- added recursive JSON-safe validation for finite primitives, arrays, and plain
  objects;
- rejected cycles, unsupported values, custom prototypes, and accessor
  properties before redaction or diagnostic sorting;
- made `isDiagnosticInput` validate optional diagnostic fields and the
  `expected`/`actual` fields at runtime;
- preserved valid JSON-safe objects and arrays without changing their values.

Invalid entries now produce `LOCAL_DIAGNOSTIC_ENTRY_INVALID`, keep the local
claim at `NOT_RUN`, and cannot mint a local `PASS` or throw during canonical
sorting. Valid JSON-safe values remain available in the normalized report.

## Files changed

- `packages/core/src/evidence-report.ts`
- `tests/unit/core/evidence-report.test.ts`
- `tests/cli/report-evidence.test.ts`
- `.superpowers/sdd/2026-08-21-evidence-expected-actual-boundary/task-1-report.md`

## Verification

- Focused RED: exit `1`, intended pre-fix failure reproduced.
- Focused core GREEN: `2` passed, `0` failed.
- `npm run build`: exit `0`.
- Core + CLI suites: `64` passed, `0` failed.
- `npm test`: `285` passed, `0` failed, `0` skipped, `0` todo.
- `git diff --check`: clean.

## Review and remaining gaps

`review_status`: pending independent review. The implementation is local and
synthetic only; provider, tenant, hosted, publication, and UAT behavior were
not tested and are outside this worker scope. No remaining local P1 is known
for the requested expected/actual validation boundary.

`remaining_blockers`: independent review and any provider/UAT verification are
still required by the wider release process.
`delegated_subagents`: `0`
