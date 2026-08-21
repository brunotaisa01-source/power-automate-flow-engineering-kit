# AI Agent Operating Contract

This repository is a public, synthetic-data Power Automate Flow Engineering Kit. A clean-context AI must read this file and [`docs/AI_AGENT_WORKFLOW.md`](docs/AI_AGENT_WORKFLOW.md) before changing files.

## Start Here

1. Read this contract, `README.md`, and the relevant skill under `skills/`.
   For Dataverse-backed flows, also read
   [`docs/DATAVERSE_FLOW_RUNBOOK.md`](docs/DATAVERSE_FLOW_RUNBOOK.md).
   Read `LICENSE` before distributing or commercializing anything; this
   repository permits personal/internal use but not unlicensed resale.
2. Run `git status --short` and inspect existing user changes before editing. Preserve unrelated work; never use a destructive reset to make the tree convenient.
3. Confirm Node.js 22.x and npm 10.x, then install with `npm ci`.
4. State the requested scope, the evidence class being produced, and any provider gate that cannot be proven locally.
5. Use TDD for behavior changes: write one deterministic RED test, observe the intended failure, implement the smallest GREEN change, then run the complete checks.

## Repository Map

- `packages/`: TypeScript packages — core contracts, package adapters, rules, and the CLI.
- `tests/`: deterministic unit, integration, adapter-boundary, skill, and operability tests.
- `fixtures/`: synthetic RED, GREEN, positive-control, mutation, and connector fixtures.
- `skills/`: installable AI guidance, including read-only and Dataverse-specific boundaries.
- `docs/`: architecture, specs, connector guidance, reviews, plans, and AI workflow documentation.
- `docs/DATAVERSE_FLOW_RUNBOOK.md`: actionable Dataverse connection-reference,
  flow lifecycle, synthetic-run, and semantic-readback sequence.
- `examples/`: the synthetic public app, connector profiles, flow/package artifacts, and local contracts.
- `.superpowers/sdd/`: worker reports containing exact files, commands, evidence, and handoff status.

## Portable Commands

Use a terminal and Node argument arrays; do not depend on Bash-only loops or platform-specific paths.

```text
node --version
npm --version
npm ci
node --experimental-strip-types --test tests/ai-agent-operability.test.ts
npm run build
npm test
npm run check
git diff --check
```

Node must report `22.x`; npm must report `10.x`. `npm run check` is the repository's portable acceptance command. A command that was not run is not a passing gate.

## TDD: RED to GREEN

- **RED:** add a focused test that describes one missing behavior, run it, and record the expected failure.
- **GREEN:** make the smallest change that makes the focused test pass; do not add unrelated production behavior.
- **REFACTOR:** remove duplication only after GREEN, then rerun the focused test.
- Finish with `npm run build`, `npm test`, `npm run check`, and `git diff --check` when the task requires repository acceptance.
- Keep tests deterministic and synthetic. Never make a test depend on a tenant, login, clock, network, mailbox, approval, or live Dataverse row.

## Evidence Classes

Use explicit labels in reports and do not promote one evidence class into another:

- `LOCAL_SYNTHETIC`: offline tests, fixtures, CLI output, static inspection, and local build evidence.
- `PROVIDER_TENANT`: readback from an actual Power Automate, Power Platform, SharePoint, Excel, Power Apps, Dataverse, Outlook, Graph, HTTP, SQL, or approvals provider in a named authorized environment.
- `HOSTED`: evidence from a hosted preview or deployed app, including its own consent, connectivity, and readback gates.
- `UAT`: a user-accepted scenario with a defined input, expected result, observed result, and semantic readback.

Local evidence is not provider/tenant evidence. Provider/tenant evidence is not hosted evidence. Hosted evidence is not UAT evidence. A local GREEN test never justifies claiming a live flow is 100% functional.

## Safety and Privacy Boundaries

- Keep examples connector-neutral while naming SharePoint, Excel, Power Apps, Dataverse, Outlook, Graph, HTTP, SQL, and approvals where the contract applies.
- Use synthetic IDs, data, and `example.invalid` addresses only. No real email, mailbox, recipient, approval, customer data, tenant identifier, token, password, credential, or exported production payload belongs in Git.
- MFA, password entry, consent, account selection, and security challenges are user-controlled. Do not guess, bypass, store, or type a password or MFA code; pause for the user.
- Treat connections, connection references, flows, solutions, Dataverse tables, permissions, and hosted deployments as provider state. Preview and read back before any authorized save; never widen scope by guesswork.
- Do not send real email, create real approvals, mutate real data, delete resources, publish, enable, or execute a live flow unless the task explicitly names that target and the user has completed the required authentication and authorization gate.

## Git/GitHub Safety

Inspect `git status --short` and `git diff` before and after work. Work on a task branch, keep the diff limited to the requested files, never commit secrets, and never force-push or rewrite history. A pull request or push is a separate release action; report the branch, exact diff, checks, and unresolved provider gates before requesting it. Never use `git reset --hard`, broad cleanup, or deletion to hide unrelated user work.

## Worker Handoff and Retirement

A worker executes only the assigned task. It does not spawn helpers or coordinate other workers. The handoff must document the exact work, files changed, RED evidence, GREEN evidence, every command and result, evidence labels, known limitations, and the next safe action. After the report is written and validation is complete, the worker must retire and make no further edits. Retirement does not mean the whole product or provider integration is approved.

## Stop Conditions

Stop and report instead of guessing when any of these occurs:

- a required password, MFA, consent, account selection, or provider login needs the user;
- the target environment, flow, connection reference, file, or requested mutation is ambiguous;
- a destructive action, real data, real email, approval, secret, or tenant export would be involved;
- a provider gate, hosted gate, or UAT gate is unavailable, mismatched, or returns `ConfigurationNeeded`/authorization failure;
- a test, build, check, readback, or `git diff --check` is RED;
- the requested change would modify production code, generated files, or live Power Automate/Dataverse state outside the assigned scope.

When stopped, preserve the safe state, record the exact failure and evidence class, and do not claim completion or 100% live functionality.
