# Dataverse RED/GREEN context pack

This is the sanitized, public version of the Dataverse lessons collected from
local RED/GREEN work. It is intentionally a reusable contract, not a copy of a
tenant export. The machine-readable cases live in
`examples/minimal-public-app/connectors/dataverse.red-green.json` and the
reference skill is
`skills/power-automate-flow-engineering-kit-dataverse/SKILL.md`.

## Evidence and portability

Run the pack on macOS, Linux, or Windows PowerShell with Node 22.x and npm 10.x:

```text
npm ci
npm run build
npm test
npm run check
```

`RED means` a deterministic synthetic case shows the invariant that must be
rejected. `GREEN means` the corrected local shape passes while its mutation or
counterexample remains fail-closed. These are `LOCAL_SYNTHETIC` checks only.

Provider status is `NOT_VERIFIED` until an authenticated read-only provider
observation supplies authoritative readback. UAT status is `NOT_VERIFIED` until
the named acceptance environment or user confirms the behavior. The read-only
provider contract supplies sanitized snapshot validation; it does not import,
rebind, enable, publish, run, write, or delete Dataverse resources.

## Sanitized scenario catalog and offline consistency harness

`dataverse.red-green.json` is a sanitized scenario catalog, not a tenant export
and not a live connector test. The focused test runs a deterministic offline
Dataverse catalog consistency harness. This deterministic offline Dataverse catalog consistency harness requires
every scenario to have a non-empty
`red.failure` and `green.correction`, canonicalizes the entries by scenario ID,
and compares the result again after reversing the input order.

Run that harness with:

```text
node --experimental-strip-types --test --test-name-pattern="deterministic offline Dataverse catalog consistency" tests/skills/dataverse-flow-engineering-kit-skill.test.ts
```

The harness checks catalog shape and deterministic local content only. It does not execute live connector calls, call a provider, mutate Dataverse, or establish provider or UAT evidence. Its result remains `LOCAL_SYNTHETIC` with provider and UAT `NOT_VERIFIED`.

## What the cases teach

### DV-AUTH-001 — platform-injected authentication

RED: a connector action contains `inputs.authentication`.

GREEN: remove only that property before an outgoing save, preserving trigger,
payload, expressions, and action order. The platform owns the injected
authentication boundary.

### DV-REF-001 — connection-reference binding

RED: the host alias is replaced with a logical name, or the reference has no
physical connection binding.

GREEN: preserve the alias in `host.connectionName` and derive the exact logical
name into `host.connectionReferenceName` from the declared map. A connected
physical account does not prove that the logical reference is available to the
flow's solution context.

### DV-SCHEMA-001 and DV-LOOKUP-001 — native schema and relationships

RED: display names, legacy names, misspellings, raw GUID fields, or incorrectly
cased navigation properties are sent to Dataverse.

GREEN: read the native logical schema, allowlist the fields and types, use the
exact case-sensitive `@odata.bind` navigation property, and compare the native
response field-by-field after a write.

### DV-SYNTHETIC-001 — side-effect boundary

RED: a synthetic request can reach Approval or Outlook actions.

GREEN: reread the synthetic marker and suppress approval/email/business side
effects while leaving the real branch explicit and testable. Synthetic email
addresses must use `example.invalid`.

### DV-DOA-001 — current-level authority

RED: a client-supplied actor or future approval level can decide a request.

GREEN: reread the authoritative request, active rule, current step, assigned
actor, and level; reject missing, mismatched, or terminal state.

### DV-IDEMPOTENCY-001 — replay-safe outcomes

RED: a repeated decision creates another terminal state, audit row, or
notification.

GREEN: reserve a deterministic key, handle zero/one/many readback cardinality,
write only in the allowed branch, and perform semantic readback before success.

### DV-PAYMENT-001 — reconciled handoff

RED: payment creation proceeds for an unapproved or mismatched request.

GREEN: reread approval status, request identity, amount, owner, and unique key;
write the tracker only after all comparisons pass, then read back the tracker
and notification log.

### DV-ATTACHMENT-001 — complete submission

RED: a request becomes terminal while required lines or attachments are
unfinished.

GREEN: keep the header Draft until every required operation and readback passes;
route every failure to a fail-closed response.

## Validation order

Run the local synthetic gates in this order:

```text
1. focused RED/GREEN tests
2. npm run build
3. npm run check
4. validate connector dataverse.profile.json
5. review provider/UAT residual gates separately
```

The first four steps prove local synthetic behavior only. They do not prove
connection rebind, solution save, publish, flow execution, Dataverse rows,
approval delivery, email delivery, or UAT. Those facts must remain explicitly
`NOT_VERIFIED` until fresh provider evidence is independently reviewed.

## Live limitations

This context pack cannot authenticate to a tenant or establish live provider
auth, connection rebind, solution import/save, flow execution, Dataverse row
effects, approval/email delivery, semantic readback, publication readback, or
UAT. Do not report a local GREEN or a read-only contract PASS as provider or UAT
evidence. Use the public [MVP release checklist](../release/mvp-release-checklist.md)
to track those external gates.

## Public-data rule

Never promote raw evidence from a tenant. Replace all environment-specific
values with typed placeholders such as `{ENVIRONMENT_ID}`,
`{CONNECTION_REFERENCE}`, `{REQUEST_ID}`, and `synthetic.owner@example.invalid`.
