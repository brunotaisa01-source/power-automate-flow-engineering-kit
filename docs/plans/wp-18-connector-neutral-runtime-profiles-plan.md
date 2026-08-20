# WP-18 Connector-Neutral Runtime Profiles Plan

## Objective

Extend the local synthetic product beyond the SharePoint executable reference
without rewriting the existing core. Add a strict connector-profile contract, a
shared semantic validator, a scripted synthetic response/readback harness, and a
CLI command that can validate Power Automate/Power Platform operations across
SharePoint, Excel, Power Apps, Dataverse, Outlook, Graph, HTTP, SQL, approvals,
and future connectors.

## Non-goals

- No tenant connector calls.
- No credentials, connection rebinding, import, enablement, or flow execution.
- No write-capable MCP or SharePoint/Power Platform plugin.
- No claim that a local profile proves a connector works in a tenant.
- No replacement of the current SharePoint WP06/WP16 executable profile.

## Profile contract

Each profile binds:

- connector identity and synthetic target;
- operation IDs and read/mutation classification;
- method/action and endpoint/action grammar;
- request allowlist and required fields;
- success/failure status classes;
- response shape and semantic readback fields;
- concurrency mode and token requirements;
- bounded retry and ambiguous-write reconciliation;
- idempotency key fields and duplicate policy;
- mutation closure: plan, status, audit, readback;
- local synthetic claim class.

## Test-first sequence

1. Add a RED schema/semantic fixture for a connector profile that accepts a
   failed body, missing readback, unbounded retry, wrong method, missing
   idempotency, or mutation without audit/readback.
2. Add independent GREEN profiles for every listed connector.
3. Add a structurally separate positive control with a different connector and
   operation topology.
4. Implement the smallest fail-closed validator and synthetic response harness.
5. Add `spflow validate connector <profile>`.
6. Run focused tests, build, full suite, README/example checks, audit, privacy, and
   official scanner classification.
7. Request a fresh independent Luna max review before commit/push.

## Evidence boundary

The profile validator and response harness prove only `LOCAL_STATIC`,
`COMPILED_CLI`, and `RUNTIME_SYNTHETIC` behavior. They do not prove connector
availability, tenant permissions, flow import, execution, mutation, or semantic
tenant effect.
