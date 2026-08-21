# Dataverse + Power Automate flow runbook

This runbook gives a clean-context AI an actionable sequence for a
Microsoft Dataverse-backed Power Automate flow. It is connector-specific
guidance for the public synthetic kit; it does not grant access to a tenant or
replace the user's authentication, MFA, consent, or UAT.

## What the kit does

The kit gives the AI:

- a repository contract in `AGENTS.md` and the durable workflow in
  `docs/AI_AGENT_WORKFLOW.md`;
- Dataverse-specific RED/GREEN rules in
  `skills/power-automate-flow-engineering-kit-dataverse/SKILL.md`;
- deterministic connector profiles and flow/package validators;
- an offline `spflow` CLI that prepares and validates definitions without
  calling a tenant;
- explicit evidence classes: `LOCAL_SYNTHETIC`, `PROVIDER_TENANT`, `HOSTED`,
  and `UAT`.

It does not store credentials, perform invisible login, bypass MFA, create a
connection by guessing, or claim that local tests prove a live flow.

## Phase 0 — start as a new AI

Read, in order:

1. `AGENTS.md`;
2. `README.md`;
3. `docs/AI_AGENT_WORKFLOW.md`;
4. this runbook;
5. the Dataverse skill and the connector profile used by the flow.

Inspect the working tree and verify the portable toolchain before editing:

```text
git status --short
node --version
npm --version
npm ci
npm run check
```

The local Dataverse contract can be checked with:

```text
node packages/cli/dist/bin/spflow.js validate connector examples/minimal-public-app/connectors/dataverse.profile.json --format text
```

Every command that was not run is an open gate. A local `PASS` is
`LOCAL_SYNTHETIC`, not `PROVIDER_TENANT`.

## Phase 1 — connect to the authorized Dataverse environment

The user must select the exact Power Platform environment and complete any
login, account selection, consent, and MFA challenge. The AI may operate the
visible connection UI after the user has authorized that exact task, but it
must never type, store, infer, or reuse a password or MFA code.

In the Power Platform maker surface:

1. select the named environment;
2. open **Connections**;
3. create or reconnect **Microsoft Dataverse**;
4. read back that the connection is `Connected` for the intended account;
5. open the target solution and its **Connection references**;
6. bind the Dataverse reference to that connected connection;
7. read back both the solution reference and the flow's installed reference.

The binding is a pair, not one string:

```text
connector alias:              shared_commondataserviceforapps
connection reference logical: [exact logical name from the solution]
connection name:              [connected provider connection name]
```

Never replace an alias with a logical name, invent a reference, or assume that
a connected account is enough to authorize a flow run. If the provider says
`ConfigurationNeeded`, `Connection not found`, or an authorization handshake
failed, stop and record the gate as `RED` or `NOT_RUN`.

## Phase 2 — design the flow locally

Use native Dataverse logical names, not display labels. For a lookup, use an
exact `@odata.bind` path whose entity set and logical field were read from the
published schema. For example, the shape is:

```json
{
  "prp_Requisition@odata.bind": "/prp_requisitions/[RECORD_ID]"
}
```

`[RECORD_ID]` is a bounded value supplied by the authorized scenario; never
copy a production identifier into a public fixture.

A protected flow should contain, as applicable:

- a typed Power Apps/manual trigger;
- a fresh identity, capability, scope, state, and lookup read;
- an allowlisted write with deterministic idempotency key;
- an audit row and notification intent;
- terminal status only after the required writes succeed;
- semantic Dataverse readback of the exact row and fields written;
- a fail-closed branch for errors, duplicates, missing lookups, or stale state.

For synthetic validation, use reserved data only:

```text
requester: synthetic.requester@example.invalid
approver:  synthetic.approver@example.invalid
record ID: 00000000-0000-0000-0000-000000000000
synthetic: true
```

Synthetic inputs must make approval and e-mail side effects unreachable or
explicitly suppressed. A successful synthetic response should be a bounded
outcome such as `SYNTHETIC_SUPPRESSED`, not a real approval or a sent message.

## Phase 3 — prepare and preflight the definition

Before an XRM/Flow API save, use the local helper:

```ts
import { preparePowerAutomateDefinition } from "@spflow/core/flow-save";

const prepared = preparePowerAutomateDefinition(
  rawDefinition,
  exactConnectionReferenceMap,
);
```

The helper must:

1. clone the input without mutation;
2. remove action-level `inputs.authentication`;
3. preserve connector aliases in `host.connectionName`;
4. set `host.connectionReferenceName` only from the exact map;
5. fail closed for missing or ambiguous aliases.

Then run the provider's preflight for the exact flow and solution. The
preflight must report valid definition, connected references, and no solution
wrap/publish blocker. Preview the exact diff before any save; do not resend a
whole definition when a surgical edit is sufficient.

## Phase 4 — save, publish, enable, and run narrowly

These are separate provider gates:

| Gate | Required readback |
| --- | --- |
| save/import | exact target flow and solution component exist |
| connection reference | logical reference and installed connection agree |
| publish | solution/customizations publish succeeds |
| enable | target flow state is `Started`/enabled |
| run | a new run ID exists for the selected flow |
| terminal status | run is `Succeeded` or an explicitly diagnosed failure |
| semantic readback | exact Dataverse rows and fields match the scenario |

For the first live check, run only the synthetic branch. Do not start a real
approval, send mail, mutate production data, or enable unrelated flows. A
successful response without a run ID is not execution evidence. A run ID
without semantic readback is not a complete GREEN.

## Phase 5 — semantic readback and evidence promotion

Read back by the deterministic scenario key, not by “latest row”. Require the
expected cardinality and exact fields. For a simple synthetic approval gate,
the acceptance shape may be:

```text
flow response:        outcome=SYNTHETIC_SUPPRESSED
real email:           false
approval action:      skipped/unreachable
audit rows:           exactly 1 matching key
notification rows:    exactly 1 matching key
duplicate rows:       0
```

Record the run ID, operation status, key, expected values, actual values, and
evidence class without storing credentials, cookies, raw mail, private URLs,
tenant exports, or personal data. Promote evidence only as follows:

- `LOCAL_SYNTHETIC`: local fixtures, CLI, build, and tests;
- `PROVIDER_TENANT`: authorized Dataverse/Power Automate connection, run, and
  readback in the named environment;
- `HOSTED`: the authenticated hosted app plus its own run/readback;
- `UAT`: a user-defined scenario accepted by the user after observed semantic
  readback.

Do not call the package or a flow `100% live` while a required class is
`NOT_RUN`, `RED`, or blocked by provider authorization.

## Stop conditions and handoff

Stop without retrying blindly when the provider returns `ConfigurationNeeded`,
`Connection not found`, `DirectApiAuthorizationRequired`, a mismatched
connection reference, a missing run ID, a failed readback, or a real side
effect path. Preserve the safe state and document the exact failure.

When a worker finishes, its handoff must list the files, RED command, GREEN
command, provider/hosted/UAT status, privacy boundary, known limitation, and
one next safe action. The worker then retires; the coordinator integrates and
re-runs the acceptance gates.
