# WP-18 Connector-Neutral Runtime Profiles Remediation Record r01

## Implemented

WP18 adds a shared synthetic connector-profile contract and validator while
preserving the executable SharePoint reference profile. The contract covers
connector-action/HTTP transport, request allowlist and forbidden fields,
pre-read authority, success/failure status closure, concurrency tokens,
idempotency keys, bounded retry, ambiguous mutation handling, mutation closure,
and semantic readback.

The CLI command is:

```powershell
spflow validate connector <profile.json> --format text
```

The public example now contains synthetic profiles for nine connector families:
SharePoint, Excel, Power Apps, Dataverse, Outlook, Graph, HTTP, SQL, and
approvals. The trace harness requires status-before-body, body shape, declared
pre-read fields, successful write status, semantic readback fields, and expected
value equality.

## RED/GREEN Evidence

- RED: permanent status-overlap fixture fails closed.
- RED: mutated idempotency, concurrency, retry, readback, and transport controls
  fail closed.
- GREEN: all nine profiles validate through the compiled CLI.
- Positive control: connector matrix preserves distinct HTTP/action transport and
  SharePoint/Excel/Dataverse/optimistic concurrency modes.
- Full local suite: `339/339`.

## Non-claims

No tenant connector, credentials, connection rebinding, import, enablement,
execution, mutation, rollback, or live semantic readback was performed. Local
synthetic GREEN is not tenant GREEN.
