# WP-06 Wave 2 SharePoint and Application Rules Plan

> This is an implementation plan for fresh bounded workers. Workers do not spawn or coordinate other workers. All examples and fixtures are synthetic.

## Objective

Add the second offline validation wave for the complete application boundary:

`frontend -> SharePoint Lists -> Power Automate -> SharePoint -> frontend`

The wave must detect authority, permission, transport, pagination, OData, schema, index, and HTTP-classification failures before any tenant operation is considered.

## Rule Inventory

| Rule ID | Boundary | Required evidence |
|---|---|---|
| `SP-AUTHZ-001` | server actor authority | server identity and capability re-read before protected mutation |
| `SP-AUTHZ-002` | scope authority | current target scope is checked against the active capability |
| `SP-ACL-001` | minimum permission model | role matrix and forbidden browser writes match the contract |
| `SP-ACL-002` | effective permission | required operation booleans are read back for declared principals |
| `APP-SAVE-001` | direct-patch Save | explicit Save, minimal allowlisted patch, fresh digest, exact ETag, 412 conflict, GET reconciliation, semantic readback |
| `APP-PAGINATION-001` | continuation safety | exhaustion, same-origin/site-path enforcement, loop and page-limit failure |
| `SP-ODATA-001` | query construction | structured URL/OData escaping and rejection of raw fragments |
| `SP-SCHEMA-001` | field identity | internal names and `EntityPropertyName` are authoritative |
| `SP-SCHEMA-002` | typed field payload | endpoint-required `SP.Field` metadata and safe structured serialization |
| `SP-SCHEMA-003` | existing-field compatibility | property-by-property `MATCH`, `CREATE_MISSING`, `INCOMPATIBLE`, or `GET_FAILED` |
| `HTTP-SEMANTIC-001` | missing-column 400 | only the approved structured missing-column signature maps to `MISSING_OBJECT` |
| `HTTP-SEMANTIC-002` | phase-sensitive 404 | only declared initial Preflight 404 maps to `CREATE_MISSING` |
| `SP-INDEX-001` | index plan | bounded deterministic remove-before-add serialized plan |
| `SP-INDEX-002` | index Apply/readback | exact final set, per-operation readback, compatible zero-write no-op |

## Evidence Model

The worker must extend existing normalized evidence types without weakening `ArtifactGraph` or Wave-1 adapters. Every rule consumes structural evidence, never fixture names, labels, or arbitrary text. Evidence must identify the contract projection and the normalized artifact path while redacting values.

Minimum synthetic projections:

- frontend request builders, save mode, patch allowlist, pagination policy, and transport calls;
- SharePoint list/field/index/view/permission declarations;
- flow command path, server re-reads, mutation target, ETag, and readback;
- HTTP request construction and normalized response classification;
- Preflight, Apply, and Readback operation phases.

## RED Phase

Before production detector code, add one catalog entry, canonical RED fixture, expected diagnostic, and focused test for each rule. RED fixtures must include:

- client actor, role, amount, owner, state, or scope trusted as authority;
- missing server capability, wrong target scope, browser protected write, direct user grant, or incomplete ACL matrix;
- shared digest, wildcard ETag, missing 412 branch, automatic replay, autosave presented as explicit Save, or patch outside `clientEditable`;
- first-page-only reads, repeated/cross-origin/site-path continuation links, raw OData, unescaped quotes, or user-controlled query fragments;
- display-name binding, untyped field payload, assumed internal name, incomplete existing-field comparison, or incompatible in-place change;
- unrelated HTTP 400 classified as missing, Apply/readback 404 treated as create-missing;
- add-before-remove index mutation, parallel index writes, missing per-step readback, stale plan digest, or non-zero compatible Apply.

Run the focused Wave 2 tests and record non-success before detector implementation. A timeout or slow process is `PENDING`, not RED.

## GREEN Phase

Implement one detector per rule ID with shared parsing primitives only where the evidence contract is identical. Require:

1. canonical RED rejection;
2. canonical GREEN acceptance;
3. structurally independent positive control;
4. mutation that restores the RED diagnostic;
5. deterministic sanitized diagnostic;
6. built-CLI execution against final normalized evidence;
7. no network, credentials, tenant mutation, or publication behavior.

For HTTP rules, parse status, phase, and structured error fields as separate inputs. Status alone must never authorize absence. For index rules, prove ordering and zero-write compatible no-op behavior rather than trusting a plan label.

## REFACTOR Phase

- Re-run all Wave 1 and Wave 2 tests under Node 22.
- Reorder graph nodes, fields, indexes, operations, and fixture enumeration; reports must remain byte-stable.
- Run adversarial alternate names and decoy fields.
- Run source capability and public-data scans; preserve explicit scanner `NOT_RUN` if unavailable.
- Confirm every new rule has catalog, RED, GREEN, positive control, mutation, remediation text, and evidence boundary.

## Acceptance Gate

The coordinator independently inspects the diff and repeats build, full tests, and shipped built-CLI probes. A fresh reviewer then reviews the immutable commit. The wave is accepted only as local evidence; tenant discovery, Preflight, Apply, Readback, import, rebind, enablement, execution, mutation, semantic effect, and publication remain separate gates.

## Required Deliverables

- `packages/rules/src/sharepoint/`, `application/`, and `http/` detectors;
- normalized evidence types and builders where required;
- catalog and fixtures for all 14 rule IDs;
- focused, mutation, integration, and shipped-CLI tests;
- English remediation pages or a rule-indexed troubleshooting record;
- updated registry and sanitized review record.
