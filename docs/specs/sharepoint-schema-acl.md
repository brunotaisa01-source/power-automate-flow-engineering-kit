# SharePoint Schema and ACL Specification

## 1. Scope

This specification defines list schema, field identity, indexes, views, permissions, provisioning, preflight, Apply, and authenticated readback. It applies to generated templates and to project contracts validated by `spflow`.

## 2. Schema Authority

The authoritative declaration is each `ListContract` in `project.contract.json`, validated by `contracts/sharepoint-schema.schema.json`. Builder source, generated requests, flow definitions, ZIP content, tests, and documentation are projections and MUST match it.

Display names are presentation only. All REST, flow, view, filter, index, and patch operations use a confirmed SharePoint internal name or `EntityPropertyName` read from the target.

## 3. Required System Fields

Every list read model MUST account for:

| Field | Use |
|---|---|
| `ID` | SharePoint item identity |
| `Created` | Creation audit |
| `Author` | Creation system identity |
| `Modified` | Last change time |
| `Editor` | Last change system identity |
| ETag metadata | Exact concurrency token |

These fields do not grant actor authority to the browser. A flow re-reads system identity and its declared access-control contract.

## 4. Field Contract

For each declared field, validation MUST compare:

- logical name;
- confirmed internal name;
- SharePoint type;
- required flag;
- indexed flag;
- unique flag;
- maximum length;
- DateOnly versus DateTime mode;
- exact Choice value set and order policy;
- lookup target list and field;
- client-editable, server-authoritative, immutable, and sensitive classifications.

### 4.1 Create payload

Provisioners MUST use structured JSON serialization. A field create payload MUST declare the endpoint-required metadata type. Example with placeholders:

```json
{
  "__metadata": { "type": "SP.FieldText" },
  "Title": "{FIELD_DISPLAY_NAME}",
  "FieldTypeKind": 2,
  "Required": false,
  "EnforceUniqueValues": false,
  "MaxLength": 255
}
```

Where the endpoint requires a generic update payload, it MUST include:

```json
{
  "__metadata": { "type": "SP.Field" },
  "Indexed": true
}
```

String concatenation that injects unescaped field names or values into JSON is forbidden.

### 4.2 Existing fields

A provisioner MUST NOT treat an existing field as compatible merely because a GET returned one item. It MUST compare every contracted property. The outcomes are:

- `MATCH`: no write;
- `CREATE_MISSING`: create allowed only by an approved Apply plan;
- `INCOMPATIBLE`: fail and require an explicit migration plan;
- `GET_FAILED`: fail without mutation.

Changing an incompatible field in place is forbidden unless a dedicated migration contract declares the conversion, bounds, rollback, and readback.

## 5. List Roles and Write Models

| Role | Browser read | Browser create | Browser update/delete | Processor |
|---|---:|---:|---:|---|
| `protected-domain` | Allowlisted | No | No, except contracted direct patch | Contracted mutation only |
| `command-queue` | Own/status subset | Typed append | No | Claim and status update |
| `audit` | Role-dependent | No | No | Append only |
| `access-control` | Minimum required or none | No | No | Read authorization rows |
| `reference` | Allowlisted | No by default | No by default | Contracted maintenance flow |
| `outbox` | Status subset | No | No | Append/claim/update by contracted processors |

Protected list writes from a browser are a blocking violation unless the list is explicitly `direct-patch` and every patched field is `clientEditable`.

## 6. Index Policy

### 6.1 Declaration

- Each index has a unique field and deterministic `order` beginning at 1.
- The declared index set, field `indexed` flags, builder, generated definition, final ZIP, manifest, tests, and documentation MUST agree.
- Default compatibility budget is 20 indexes per list. A different budget requires an explicit package/profile capability and tenant evidence.
- Unique fields that require an index count toward the budget.

### 6.2 Remediation algorithm

Given current set `C` and required set `R`:

```text
remove = C - R, sorted by internal name
add    = R - C, sorted by contract order then internal name
```

Apply MUST:

1. Re-read current indexes.
2. If `C == R`, return `NO_OP` with zero writes.
3. Remove each field in `remove` serially with readback after each write.
4. Re-read index count before additions.
5. Add each field in `add` serially using a typed `SP.Field` payload with readback after each write.
6. Re-read the full final set and require exact equality with `R`.

Addition before removal is forbidden. Parallel index mutation is forbidden. A repeated compatible Apply MUST perform zero writes.

## 7. View Contract

- A view references confirmed field internal names only.
- Every field MUST exist and be compatible before view creation or update.
- Row limit MUST be positive and pagination MUST be enabled.
- View update uses an explicit ordered field set; no implicit carry-forward.
- A wrong binding or missing field is a blocking error, not a best-effort omission.
- Apply is followed by view field and query readback.

## 8. OData Contract

### 8.1 Literals

For a string value `v`:

```text
odataLiteral = "'" + v.replaceAll("'", "''") + "'"
```

The complete query is constructed with a URL API. Raw user input MUST NOT be concatenated into `$filter`, `$select`, `$expand`, or a server-relative path.

### 8.2 Pagination

Every schema discovery and readback query follows continuation links to exhaustion. A continuation is accepted only when it is same-origin, stays under the expected site path, and has not already been visited.

## 9. HTTP Classification

### 9.1 Semantic missing-column 400

`MISSING_OBJECT` is allowed only if the parsed platform error has a known missing-column code or a normalized message semantically equivalent to `Column does not exist`. The detector MUST require both an HTTP 400 context and a matching structured signature. Unrelated invalid query, malformed JSON, invalid type, authorization, and throttling responses are `GET_FAILED`.

### 9.2 Phase-sensitive 404

| Phase | Declared initial GET | 404 classification |
|---|---:|---|
| Preflight | `allowCreateMissing404: true` | `CREATE_MISSING` |
| Preflight | false/absent | `GET_FAILED` |
| Apply | any | `GET_FAILED` |
| Post-write readback | any | `GET_FAILED` |

An Apply branch MUST NOT reuse a permissive Preflight 404 classifier.

## 10. Permission Contract

### 10.1 Principles

- Minimum privilege is mandatory.
- Direct user grants are forbidden in reusable templates.
- Group or service-principal bindings are declared through environment binding keys.
- Browser create permission on a command queue does not imply update/delete permission.
- Audit read and mutation authority SHOULD be separated.
- Connection ownership does not replace list authorization.

### 10.2 Capability authorization

An authorization decision is valid only when all are true:

1. Authenticated system identity was read server-side.
2. Exactly one active access row matches the principal and required capability.
3. Scope mode is satisfied against current target state.
4. Effective permissions permit the required operation.
5. The command type and state transition are declared for the capability.

Zero matches is unauthorized. Multiple active matches are configuration failure, not implicit authorization.

### 10.3 Effective-permission readback

Tenant Preflight and Readback MUST probe effective permissions for representative identities or approved test principals. The probe records only normalized operation booleans and synthetic labels in exported evidence, never personal identity.

Required operations are:

- protected list: read and no unauthorized direct update;
- command queue: create and no browser update/delete;
- audit: processor append and expected reviewer read;
- access control: processor read and no browser mutation;
- processor: contracted reads/writes only.

## 11. Preflight Plan

Preflight is read-only and emits canonical JSON:

```ts
interface SchemaPlan {
  schemaVersion: "1.0";
  contractRevision: number;
  targetBindingKey: string;
  operations: SchemaOperation[];
  maximumWrites: number;
  planDigest: string;
  result: "READY" | "BLOCKED";
}

interface SchemaOperation {
  sequence: number;
  kind: "create-list" | "create-field" | "remove-index" | "add-index" | "upsert-view" | "set-permissions" | "no-op";
  listId: string;
  field?: string;
  expectedBefore: unknown;
  intendedAfter: unknown;
  writes: 0 | 1;
  residualGate: string;
}
```

- Operations are totally ordered.
- `maximumWrites` equals the sum of operation writes and MUST not exceed the destructive write limit.
- The digest is calculated over canonical plan JSON with `planDigest` omitted.
- `BLOCKED` plans have zero authorized writes.

## 12. Apply and Readback

Apply requires an explicit target, exact approved plan digest, current authorization, write limits, and rollback procedure. Before each operation it re-reads expected state. A mismatch stops execution. Apply never infers approval from possession of a plan.

Readback records exact list existence, field properties, `EntityPropertyName`, indexes, views, permissions, and operation counts. Tenant state is not `TENANT_VERIFIED` until all required readback assertions pass in the same approved change window.

## 13. Required Tests

Offline fixtures MUST cover:

- assumed display name versus confirmed internal name;
- invalid view field binding;
- untyped index payload;
- field exists but has incompatible type or DateTime mode;
- unencoded OData quotes and reserved characters;
- same-origin and cross-origin continuation links;
- semantic missing-column 400 and unrelated 400;
- allowed initial Preflight 404 and strict Apply/readback 404;
- add-before-remove index plan;
- compatible index no-op and second-Apply no-op;
- contract/schema/builder/ZIP index drift;
- missing capability scope, zero/multiple access rows, and client actor trust;
- destructive plan with incorrect write count or missing digest.

Tenant-only residual gates are list creation, schema compatibility, effective permission probes, index/view readback, separate-user tests, and controlled Apply. Local tests MUST NOT claim those results.

