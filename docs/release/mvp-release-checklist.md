# MVP Release Checklist

**Scope:** Power Automate Flow Engineering Tool MVP, public synthetic repository
**Base head:** `b1d00b9`
Immutable Task 4 review head: `eaf31f8`
Task 4 implementation commit: `2c269c2`
**Release posture:** local evidence is reviewable; release remains blocked by
external and final-head gates listed below.

This checklist is safe for a public repository. It records commands and
sanitized evidence classes, never tenant values or raw connector evidence.

## Evidence language

| Class | Meaning | Current interpretation |
| --- | --- | --- |
| `LOCAL_SYNTHETIC` | Source, fixture, build, test, or offline CLI evidence | Available and reproducible locally |
| `PROVIDER` | Authenticated provider observation with authoritative readback | `NOT_VERIFIED` |
| `HOSTED` | Readback from the deployed/public runtime | `NOT_VERIFIED` |
| `UAT` | Acceptance by the named test environment or user | `NOT_VERIFIED` |

`NOT_VERIFIED` and `NOT_RUN` are not PASS. A local GREEN, a valid read-only
provider snapshot, or a passing documentation test cannot establish provider,
hosted, or UAT behavior.

## Task 1–3 API mapping

The release evidence maps to these exact offline exports; none establishes live
provider or UAT evidence:

| Task | Exact API/export | Evidence boundary |
| --- | --- | --- |
| Task 1 | `preparePowerAutomateDefinition` from `@spflow/core/flow-save` | Local package preparation/validation only; no tenant call or provider PASS |
| Task 2 | `createLocalEvidenceReport(input): LocalEvidenceReport` from `@spflow/core/evidence-report` | `LOCAL`/`LOCAL_SYNTHETIC` only; provider/UAT remain `NOT_VERIFIED` |
| Task 3 | `validateReadonlyProviderSnapshot(snapshot)` from `@spflow/core/provider-readonly` | Pure offline/read-only metadata contract; not live provider auth/rebind/readback/UAT |

These contracts do not authenticate, mutate, rebind, execute, publish, or
perform provider readback. `PROVIDER` requires authenticated authoritative
readback, and `UAT` requires the named acceptance environment or user.

## Reproducible commands

Run from a clean checkout with Node 22.x and npm 10.x. These commands are
portable across macOS, Linux, and Windows PowerShell:

```text
npm ci
npm run build
npm test
npm run check
node --experimental-strip-types --test tests/skills/dataverse-flow-engineering-kit-skill.test.ts
node --experimental-strip-types --test --test-name-pattern="deterministic offline Dataverse catalog consistency" tests/skills/dataverse-flow-engineering-kit-skill.test.ts
node packages/cli/dist/bin/spflow.js scan public-data . --history --format json
git diff --check
git status --short --branch
```

The focused Dataverse test covers documentation completeness, the
`LOCAL_SYNTHETIC`/provider/UAT boundary, the nine sanitized training scenarios,
and private-marker rejection. The official history-aware public-data scanner
is an independent gate: if its engine is unavailable, record its exit `8` and
`NOT_RUN`; never convert that result to PASS.

`npm test` delegates to `scripts/test-all.mjs`, which shares the same recursive,
shell-neutral test inventory as `npm run check` and includes both `.test.ts` and
`.test.mjs` files in deterministic POSIX order.

## Current local evidence

The following committed, sanitized summaries are the release traceability
records. All results are local only.

The Task 2 and Task 3 check counts are historical checkpoints from their
scoped re-reviews, not claims about the final Task 4 head. Re-run every command
above on the exact final commit.

### Worker handoffs

These are worker-authored summaries, not independent approvals:

- [Task 1 worker handoff summary](evidence/task-1-worker-handoff.md)
- [Task 2 worker handoff summary](evidence/task-2-worker-handoff.md)
- [Task 3 worker handoff summary](evidence/task-3-worker-handoff.md)
- [Task 4 worker handoff summary](evidence/task-4-worker-handoff.md)

### Independent review reports

These are separate sanitized review summaries and must not be substituted for
the worker handoff summaries above:

- [Task 1 independent review summary](evidence/task-1-independent-review.md)
- [Task 2 independent review summary](evidence/task-2-independent-review.md)
- [Task 3 independent review summary](evidence/task-3-independent-review.md)
- [Task 4 independent review summary](evidence/task-4-independent-review.md)

## Task 4 catalog independent controls

The deterministic catalog harness has an independently shaped positive control
and a behaviorally relevant mutation/RED control. Both are local synthetic
checks only:

```text
node --experimental-strip-types --test --test-name-pattern="Task 4 catalog positive-control" tests/skills/dataverse-flow-engineering-kit-skill.test.ts
=> exit 0; 1/1 passed

node --experimental-strip-types --test --test-name-pattern="Task 4 catalog mutation/RED" tests/skills/dataverse-flow-engineering-kit-skill.test.ts
=> exit 0; 1/1 passed; missing red.failure rejected with CATALOG_RED_FAILURE_REQUIRED
```

The positive control uses a distinct branch-inspection/payload-boundary
topology. The mutation empties a required `red.failure` field and the harness
fails closed. Neither control executes a live connector or establishes
provider/UAT evidence.

Current whole-branch correction candidate evidence: focused Task 4 suite 11/11,
full `npm test` 422/422, and offline `npm run check` 422/422 with 19 gates and
0 audit vulnerabilities. These are local results, not hosted/provider/UAT
results.

## CI distinction

The previous GitHub Actions matrix evidence consists of the workflow
configuration and the existing prior CI run below; it is separate from the
final-head matrix state.

- **existing prior CI run:** CI run `32405651477` completed successfully for
  prior head `b5e9c6e1a4e19bad676f180b1a48638f652ef268` at
  [the public run record](https://github.com/brunotaisa01-source/power-automate-flow-engineering-kit/actions/runs/32405651477).
  It is historical evidence for that prior head, not evidence for the immutable
  Task 4 review head `eaf31f8`, implementation commit `2c269c2`, or any later
  coordinator/fix-round head.
- **final-head GitHub Actions matrix: `NOT_RUN` / `PENDING`:** no final-head
  matrix result exists for `eaf31f8` or any later coordinator head. Do not infer
  it from the existing prior CI run, and do not invent a final-head URL or
  result. Run `.github/workflows/ci.yml` only on the exact final head and
  require `portable-check (ubuntu-latest)`, `portable-check (macos-latest)`,
  and `portable-check (windows-latest)` to pass.

The final-head CI still pending status remains `NOT_RUN`/`PENDING` until that
exact matrix has completed.

## Blockers before release

- Final GitHub Actions matrix on the final head is pending.
- Live provider auth is pending; no tenant credential or provider session is
  part of this repository evidence.
- Connection rebind and solution import/save are pending and must be verified
  against the named environment.
- Provider readback is pending; local snapshot validation is not live
  readback, mutation proof, or publication proof.
- Flow enablement, execution, Dataverse row effects, approval/email delivery,
  and semantic readback are pending.
- UAT is pending and requires an explicitly named acceptance environment/user.

## Dataverse public-data gate

The Dataverse training profile remains sanitized and local:

- `examples/minimal-public-app/connectors/dataverse.red-green.json` is
  `LOCAL_SYNTHETIC`.
- The profile and every scenario carry `providerGate=NOT_VERIFIED` and
  `uatGate=NOT_VERIFIED`.
- Public docs use typed placeholders and reserved `example.invalid` values;
  they must not contain real email addresses, tenant UUIDs, tenant URLs,
  credentials/tokens, or raw payload bodies.
- The focused privacy test is supplemental evidence. It does not replace the
  official history-aware scanner or human privacy/IP review.

## No-tenant statement

Task 4 does not import, rebind, enable, publish, execute, mutate, send email,
create approvals, read business rows, perform provider semantic readback, or
run UAT. The release claim must remain limited to portable local contracts,
sanitized Dataverse training, read-only snapshot validation, and the exact
local evidence reproduced by the commands above until every blocker is closed.
