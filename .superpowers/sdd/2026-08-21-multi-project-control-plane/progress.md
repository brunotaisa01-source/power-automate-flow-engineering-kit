# SDD ledger — plan: docs/superpowers/plans/2026-08-21-multi-project-control-plane.md

## Pre-flight

The design is `docs/superpowers/specs/2026-08-21-multi-project-control-plane-design.md`.
The plan has four sequential tasks with disjoint implementation surfaces.

| Task pair | Shared files/interfaces | Pre-flight ruling |
| --- | --- | --- |
| 1 → 2 | Core workspace types consumed by CLI | Task 1 defines the exported types and pure validation before Task 2 imports them. |
| 2 → 3 | `workspace check` command and report envelope | Task 3 uses only the public CLI command and does not reach into runner internals. |
| 3 → 4 | Fixtures, docs, worker reports | Task 4 only reviews and verifies completed outputs; it does not change feature behavior. |

| Task | Internal consistency check |
| --- | --- |
| 1 | Tests bind the exact pure manifest/aggregate exports named in the interface. |
| 2 | Tests inject the runner dependency while production parser uses the default fixed `npm run check` runner. |
| 3 | The manifest points to dependency-free fixture projects whose only check command is `npm run check`. |
| 4 | Review commands operate on the final branch, clean clone, and CI artifacts named in the plan. |

## Decisions

- The fixed child command is `npm run check`; arbitrary shell commands are not accepted.
- The registry is audited before project checks; an unapproved lesson never changes a workspace result.
- Project results remain individually visible; required-project failure cannot be masked by another project's GREEN.

## Task status

- Task 1: complete — worker Hume delivered 06aa6ea; reviewer Avicenna found two P2s; worker Franklin fixed them in 3cb8681; reviewer Pascal marked both resolved and retired.
- Task 2: pending
- Task 3: pending
- Task 4: pending

## Task 1 review

- Reviewer Avicenna retired with two P2 findings: aggregate object-spread can
  propagate uncontracted fields, and GREEN/registry-failure aggregate cases
  were not covered.
- Ruling: fix both before Task 2; the findings are load-bearing for privacy and
  global gate correctness.
