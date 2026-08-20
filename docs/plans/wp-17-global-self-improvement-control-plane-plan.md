# WP-17 Global Self-Improvement Control Plane Plan

## Objective

Make every new validated failure teach future AIs automatically without requiring
a person to repeat the lesson. The registry covers Power Automate and Power
Platform behavior across SharePoint, Excel, Power Apps, Dataverse, Outlook,
Graph, HTTP, SQL, approvals, and future connectors; it is not SharePoint-only.
Self-improvement is a governed, versioned lesson registry consumed by the skill
and an optional read-only plugin/MCP surface. It is not autonomous model
retraining and it never grants tenant mutation authority.

## Global loop

1. A local test, adversarial fixture, worker review, scanner, or runtime gate
   produces a RED/finding.
2. The coordinator automatically creates a sanitized candidate lesson containing
   the trigger, invariant, exact scope, RED test, GREEN test, independent positive
   control, claim boundary, and source evidence. No private value is copied.
3. The candidate remains outside the approved registry while its status is
   `CANDIDATE` or `BLOCKED`. `spflow learn audit` reports it as an open gate.
4. The implementation keeps the RED fixture permanent, adds GREEN behavior and a
   structurally independent positive control, and reruns the adversarial tests.
5. A fresh independent Luna max reviewer checks the lesson and its tests.
6. Privacy/history review and registry audit pass. Only a commit that changes a
   candidate to `APPROVED` may add it to the global registry.
7. Every new AI skill/plugin activation reads the registry revision and digest
   before planning. It applies all approved invariants automatically.

## Trusted states

- `CANDIDATE`: automatically captured but not trusted.
- `BLOCKED`: reviewer or privacy gate found a problem.
- `APPROVED`: RED/GREEN/positive-control evidence and independent review pass.
- `RETIRED`: superseded by a newer lesson; history remains immutable.

Only `APPROVED` lessons are instructions to future AIs. A candidate cannot
weaken a rule, close a residual gate, or authorize a tenant action.

## Integration boundary

The public CLI exposes read-only audit plus local-only capture/promotion
hooks: `spflow learn audit --execute`, `spflow learn capture`, and
`spflow learn promote`. Audit verifies the exact registry SHA-256 sidecar and runs
distinct node-test bindings. Promotion requires a valid lifecycle transition,
executable evidence, an independent APPROVED review, and recomputes the sidecar.
These hooks never contact or mutate a tenant. Offline `verify` automatically audits
`knowledge/self-improvement/registry.json` when that file is present and fails
closed for malformed or unresolved learning records.

The installed self-improvement skill is the global AI hook. A future plugin or
read-only MCP may expose only `registry metadata`, `approved lessons`, and
`candidate status` through an allowlisted read API. It must not create, update,
delete, approve, promote, mutate tenants, import, enable, trigger, or change
permissions. Until such an interface is separately approved, the checked-in
registry and skill are the source of truth.

## Required lesson fields

Every approved lesson binds:

- stable lesson ID and revision;
- sanitized trigger and originating work package;
- invariant and affected domains;
- permanent RED fixture/test;
- GREEN fixture/test;
- structurally independent positive control/test;
- claim boundary;
- source review record and independent approval;
- synthetic-public privacy classification.

Paths, tests, digests, and review records must resolve inside the repository.
Absolute paths, tenant values, credentials, private names, and raw runtime
payloads are invalid.

## Non-goals

- No model-weight self-training.
- No unreviewed edits to normative rules.
- No write-capable MCP or SharePoint plugin.
- No conversion of local GREEN, candidate status, or documentation text into
  tenant/runtime/publication evidence.
