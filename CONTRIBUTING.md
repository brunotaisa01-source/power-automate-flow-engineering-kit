# Contributing

## Before Opening a Change

1. Read the relevant specification, plan, and review record.
2. Add or update a synthetic RED fixture before changing production behavior.
3. Implement the smallest change that turns the RED into GREEN.
4. Add an independent positive control and a mutation or counterexample test.
5. Run the Node 22 build and the complete test suite.
6. Run `npm run check` for the cross-platform acceptance pack.
7. Run the source-only privacy and capability scans.

## Public Data Rules

Never commit tenant URLs, company or organization names, employee or customer data, email addresses, mailbox content, credentials, private identifiers, exported production packages, raw payloads, screenshots, or private source code. Use placeholders such as `{SITE_URL}`, `{LIST_TITLE}`, and `{CONNECTION_REFERENCE}`.

## Evidence Rules

Local static and package evidence must not be promoted to tenant evidence. Keep import, rebind, enablement, execution, mutation, semantic readback, and publication readback as explicit external gates.

`LOCAL_SYNTHETIC` means that a result came from a repository fixture, source
check, build, or offline CLI. `PROVIDER` requires an authenticated read-only
observation and authoritative readback. `UAT` requires the named acceptance
environment or user. Missing external evidence is `NOT_VERIFIED`, never an
implicit PASS.

## Portable documentation checks

The repository supports macOS, Linux, and Windows PowerShell with Node 22.x
and npm 10.x. Use the lockfile and run the same commands on each platform:

```text
npm ci
npm run build
npm test
npm run check
```

`RED means` a deterministic synthetic case demonstrates an invariant failure.
`GREEN means` the smallest correction passes that case while its mutation or
counterexample remains rejected. A local GREEN does not prove provider
authentication, connection rebind, runtime execution, or UAT.

The read-only provider contract is the machine-readable boundary for sanitized
environment, solution, flow, and connection-reference snapshots. It is
deliberately offline and read-only; it does not authorize import, rebind,
enablement, publication, execution, mutation, or deletion.

## Test Language

Rule tests must be deterministic. A positive control must have a structurally independent topology. A mutation must change behaviorally relevant evidence, not only a label or identifier.

## Work package checkpoints

Every work package and review record is written in English and records: state, work
package, files, last command, RED/GREEN phase, next action, and blocker. Keep old
evidence immutable; add a new review or remediation record instead of rewriting a
stronger claim. After implementation, request a fresh independent review and
retire the worker after its report.

## Documentation, skills, and release

- Validate documentation skills with a pressure scenario: RED without the skill,
  GREEN with the skill, then a loophole review and final English/privacy review.
- Treat self-improvement as Power Automate/Power Platform and connector-agnostic;
  cover SharePoint, Excel, Power Apps, Dataverse, Outlook, Graph, HTTP, SQL,
  approvals, and future connectors rather than assuming SharePoint.
- Run `spflow learn audit knowledge/self-improvement/registry.json --execute`;
  capture new findings locally, and promote only with an independent APPROVED
  review. These hooks must never mutate a tenant or use a write-capable MCP.
- Keep endpoint helpers operation-specific: Save item, OData list, and pagination
  collection/continuation. Do not restore a generic list-prefix authority check.
- Run `npm ci`, the Node 22 build, the complete suite, README example commands,
  `npm run check`, `git diff --check`, dependency audit, and the official
  history-aware scanner.
- Keep the public [MVP release checklist](docs/release/mvp-release-checklist.md)
  current. It must distinguish prior workflow/local evidence from a final-head
  GitHub Actions matrix and list live provider and UAT blockers explicitly.
- If the scanner engine is unavailable, record exit `8` and `NOT_RUN`; never call
  that result PASS. Do not publish until explicit publication authorization, clean
  scope, privacy review, independent approval, and required readbacks exist.
- Before saving raw Power Automate definitions, use `@spflow/core/flow-save` and
  keep connection-reference logical names sourced from the declared map. Never
  send action-level `inputs.authentication` or invent a logical name.
- Never use `git add -A` for mixed scope. Stage explicit paths and preserve
  unrelated worktree changes.
