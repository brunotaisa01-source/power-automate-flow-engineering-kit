# AI Agent Workflow

This is the durable, connector-neutral workflow for any AI entering the repository with no prior conversation context. Read [`../AGENTS.md`](../AGENTS.md) first; that file is the short contract, and this document supplies the operating detail.

When the task involves Dataverse-backed Power Automate flows, read the
connector-specific [`Dataverse flow runbook`](DATAVERSE_FLOW_RUNBOOK.md) after
this document. It supplies the provider-gated connection, reference, flow,
publish, run, and semantic-readback sequence.

## Start Here

### 1. Establish repository context

Read `README.md`, this document, and the relevant skill in `skills/`. Inspect `package.json`, `git status --short`, and the existing diff. The main areas are:

| Area | Responsibility |
| --- | --- |
| `packages/core/` | Contracts, canonical data, diagnostics, and evidence types |
| `packages/package-adapters/` | Safe archive/XML inspection and normalized flow evidence |
| `packages/rules/` | Deterministic package and Power Automate rule detectors |
| `packages/cli/` | The `spflow` offline/read-only CLI |
| `tests/` | Executable local contracts and regression gates |
| `fixtures/` | Synthetic RED/GREEN/positive-control inputs |
| `skills/` | AI procedures and connector-specific guidance |
| `docs/` | Specifications, architecture, reviews, plans, and handoffs |
| `examples/` | Public synthetic app, profiles, and artifacts |

Do not infer authorization from a file, a browser tab, a connected account, or a previous agent message. Authorization is scoped to the current task and target.

### 2. Confirm a portable toolchain

The package contract is Node.js `>=22.0.0 <23.0.0` and npm `>=10.0.0 <11.0.0`. Run these exact commands from the repository root:

```text
node --version
npm --version
npm ci
```

If the versions are outside the contract, stop and report the mismatch. Do not upgrade the user's global tools or change the package engine range as a workaround.

## RED → GREEN / TDD Workflow

For a behavior, rule, validator, or safety boundary:

1. Write one focused test under `tests/` that expresses the desired observable behavior.
2. Run the focused test and capture a real **RED** failure caused by the missing behavior, not by a typo or missing dependency.
3. Implement the smallest **GREEN** change. Keep production changes separate from tests and do not add speculative features.
4. Run the focused test again; only then refactor duplication.
5. Run the repository acceptance gates:

```text
node --experimental-strip-types --test tests/ai-agent-operability.test.ts
npm run build
npm test
npm run check
git diff --check
```

For documentation-only contracts, the deterministic contract test is still written and run RED before the documents are added. Record both RED and GREEN output in the worker report. A test that was not observed failing is not TDD evidence.

## Evidence Classes and Gate Promotion

Use the following labels exactly in reports:

| Label | What it proves | What it does not prove |
| --- | --- | --- |
| `LOCAL_SYNTHETIC` | Deterministic local tests, fixtures, build, static checks, and offline CLI behavior | A tenant connection, provider run, hosted deployment, or user acceptance |
| `PROVIDER_TENANT` | Authorized readback or execution from the named provider/tenant target | Hosted availability or UAT acceptance |
| `HOSTED` | The hosted preview/deployment loads and passes its own connectivity/readback checks | Tenant-wide correctness or UAT acceptance |
| `UAT` | A user-defined scenario has expected result, observed result, semantic readback, and acceptance | Unrelated flows, connectors, environments, or future deployments |

Local evidence must be reported as local evidence. Do not call `LOCAL_SYNTHETIC` “live”, “production”, or “100%”. Provider/tenant evidence requires the target environment, flow/solution or resource identity, connection-reference status, operation result, and semantic readback. Hosted evidence requires the hosted URL or deployment identity and its own test result. UAT requires the user's acceptance, not an AI inference.

## Connector-Neutral Scope

The engineering contract can apply to SharePoint, Excel, Power Apps, Dataverse, Outlook, Graph, HTTP, SQL, and approvals. Connector-specific semantics must be read from the relevant skill, profile, contract, and fixture. Do not copy a SharePoint assumption into Excel, Dataverse, Outlook, or another connector. The repository's public examples use synthetic data and the local CLI is offline/read-only with respect to tenants.

## Tenant, Privacy, MFA, and No-Real-Email Rules

- Never commit or paste credentials, tokens, cookies, passwords, MFA codes, tenant IDs, personal addresses, mailbox contents, production exports, or customer data.
- Use `example.invalid` or another reserved `.invalid` address for synthetic email fields. The address must not route to a real mailbox.
- Synthetic runs must use explicit synthetic markers, bounded IDs, and no real email or approval side effects. Suppress or stub external sends in local tests.
- Power Automate/Dataverse connections, connection references, flow state, solution state, permissions, and hosted resources are provider state. A local test cannot repair or authorize them.
- MFA, password, account selection, consent, and login challenges belong to the user. The AI may explain where to click, but must pause rather than type, guess, bypass, or retain the secret.
- Before a provider save, enable, publish, execute, permission change, or data mutation, preview the exact target and payload, confirm the narrow scope, perform the authorized operation, and read back the semantic result. If any stage is unavailable, leave the safe state unchanged and label the provider gate `NOT_RUN` or `RED`.

## Safe Git/GitHub Workflow

1. Run `git status --short` and `git diff`; preserve unrelated user changes.
2. Use a task branch and keep the diff to the assigned files.
3. Run `git diff --check` and the required tests before any commit or pull request.
4. Never add secrets or tenant exports. Never use force-push, history rewriting, `git reset --hard`, or broad deletion to resolve conflicts.
5. A GitHub pull request, merge, or push is a separate release gate. Report the exact branch/commit, checks, and remaining provider/hosted/UAT gates before asking for it.

## Worker Handoff and Retirement Contract

Each worker owns only the assigned task. It must not spawn helpers or coordinate. Before retiring, write a report under `.superpowers/sdd/<date>-<task>/task-<n>-report.md` containing:

- objective and scope boundaries;
- exact files created or modified;
- RED command, failure, and why it was the intended failure;
- GREEN command and result;
- every requested final command and exit/result;
- evidence labels and explicit `NOT_RUN` provider/hosted/UAT gates;
- privacy or authentication boundaries encountered;
- remaining risks and the single safest next action;
- `worker status: retired`.

After the report is complete and the final checks pass, stop editing. Retirement is a handoff state, not a claim that external Power Automate/Dataverse execution or UAT happened.

## Explicit Stop Conditions

Stop immediately and report the exact state when:

- MFA, password, consent, account selection, or any login approval is required;
- a target or scope is ambiguous, especially a flow, solution, connection reference, table, mailbox, or Git ref;
- an action could be destructive, irreversible, broad, or involve real data, real email, real approvals, or a secret;
- provider authentication, connection binding, hosted access, runtime execution, semantic readback, or UAT is missing or mismatched;
- `ConfigurationNeeded`, authorization failure, `NOT_RUN`, a failing test, build error, check failure, or `git diff --check` failure remains;
- the work would touch production code, generated files, or live Power Automate/Dataverse state outside the worker's explicit assignment.

Preserve the safe state, record the evidence class, and do not claim “approved”, “100% functional”, or “live” until every gate required by the task has passed.
