# Connector Profile Specification

## Purpose

A connector profile is a synthetic, local contract for one Power Automate or
Power Platform connector family. It does not contain a tenant URL, connection
reference, credential, or live endpoint. It makes operation semantics testable
before a tenant is considered.

## Supported families

The current synthetic catalog covers SharePoint, Excel, Power Apps, Dataverse,
Outlook, Graph, HTTP, SQL, and approvals. A `custom` or `future-*` profile may
be documented only when it preserves the same contract fields and evidence
boundary.

## Required semantics

Every operation declares:

- read or mutation kind;
- connector-action or HTTP transport and method/action;
- request allowlist, required fields, and forbidden fields;
- disjoint success and failure status classes;
- response body shape;
- semantic readback requirement and fields;
- concurrency mode/token;
- bounded retry and ambiguous mutation policy;
- idempotency key and duplicate policy;
- mutation closure: plan, status, audit, and readback.

Mutations cannot use GET, must be idempotent, must handle ambiguous responses,
and cannot pass without semantic readback. A failed response body cannot become
success merely because it contains an expected property.

## CLI

```powershell
spflow validate connector <profile.json> --format text
```

The command performs strict JSON Schema validation and semantic validation. The
synthetic trace harness additionally checks status-before-body, authoritative
pre-read, write status, semantic readback field presence, and field-by-field
equality against expected synthetic values.

## Evidence boundary

Connector profiles and traces prove only `LOCAL_STATIC`, `COMPILED_CLI`, and
`RUNTIME_SYNTHETIC`. They do not prove connector availability, authentication,
permissions, import, rebinding, enablement, execution, mutation, rollback, or
semantic tenant effect.
