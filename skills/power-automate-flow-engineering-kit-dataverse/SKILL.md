---
name: power-automate-flow-engineering-kit-dataverse
description: Use when designing, reviewing, preparing, or testing Dataverse-backed Power Automate flows, especially when connection references, logical schema names, @odata.bind lookups, approvals, synthetic side effects, or payment handoffs are involved.
---

# Dataverse Flow Engineering

Use this as a connector-specific companion to the main Flow Engineering Kit.
It contains reusable local RED/GREEN patterns only. It never authorizes tenant
mutation, publication, execution, email, or UAT claims.

## Evidence boundary

The companion profile is `LOCAL_SYNTHETIC`. Provider save/readback, connection
availability, solution binding, runtime execution, email delivery, and UAT are
`NOT_VERIFIED` until fresh evidence exists for the named environment and flow.
Do not copy real email addresses, tenant IDs, solution names, run IDs, URLs, or
raw payloads into a public artifact.

## Save boundary

Before an XRM/Flow API save, use `@spflow/core/flow-save`:

1. Clone the JSON definition without mutating the source.
2. Remove action-level `inputs.authentication`; the platform injects it.
3. Preserve the connector alias in `host.connectionName`.
4. Set `host.connectionReferenceName` only from the exact declared reference map.
5. Fail closed when the alias is missing, ambiguous, or lacks a logical name.

Never replace an alias with a logical name, invent a connection reference, or
reuse a provider candidate without fresh readback.

## Dataverse RED/GREEN gates

| Gate | RED | GREEN |
| --- | --- | --- |
| Auth/reference | Embedded auth or unresolved binding | Platform-normalized save candidate |
| Schema | Display, legacy, misspelled, or unsupported field | Native logical name/type and allowlist |
| Lookup | Raw GUID or wrong-case property | Exact `@odata.bind` plus readback |
| Synthetic | Approval/email side effect reachable | Synthetic branch suppresses side effects |
| Approval | Client actor or future level trusted | Current row/rule/step/actor reread |
| Replay | Duplicate outcome/audit/notification | Deterministic key, cardinality guard, readback |
| Payment | Unapproved or mismatched handoff | Approved, reconciled, unique tracker and log |
| Submission | Terminal status before lines/attachments | Draft until required writes/readbacks succeed |

## Working rule

Validate the local RED/GREEN fixture first. Then validate the compiled CLI and
portable check. Only after privacy review and independent review may a sanitized
lesson be considered for the global self-improvement registry. Local GREEN is
not provider GREEN.
