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

## Current local evidence

The following prior worker evidence is local only and is cited for traceability:

| Area | Evidence | Result |
| --- | --- | --- |
| Task 1 flow preparation | `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-1-rereview-2.md` | Clean scoped re-review, `APPROVE`; focused 11/11 |
| Task 2 evidence reporting | `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-2-final-rereview.md` | `PASS`; focused 20/20, full 285/285, check 387/387 |
| Task 3 read-only provider contract | `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-3-rereview.md` | `PASS`; focused 17/17, full 288/288, check 404/404 |
| Task 4 fix round Dataverse/docs guard | `tests/skills/dataverse-flow-engineering-kit-skill.test.ts` | Focused 8/8; catalog harness 1/1; full 294/294; offline `npm run check` 410/410, 19 gates; supplemental privacy 0 markers; links 16/0; official scanner `exit 8`, `NOT_RUN` |

The Task 2 and Task 3 check counts are historical checkpoints from their
scoped re-reviews, not claims about the final Task 4 head. Re-run every command
above on the exact final commit.

### Worker handoffs

These are worker-authored implementation records, not independent approvals:

- `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-1-report.md`
- `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-2-report.md`
- `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-3-report.md`
- `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-4-report.md`

### Independent review reports

These are separate review records and must not be substituted for the worker
handoffs above:

- `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-1-rereview-2.md`
- `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-2-final-rereview.md`
- `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-3-rereview.md`
- `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-4-review.md`

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
