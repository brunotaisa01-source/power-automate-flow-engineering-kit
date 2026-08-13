# WP-06 Wave 2 Remediation Record

All guidance applies to public synthetic or approved project artifacts. Local validation does not authorize or prove a tenant operation.

| Rule | Remediation |
|---|---|
| `SP-AUTHZ-001` | Re-read the authenticated system identity and exactly one active capability row using the contract's access list and capability fields, then validate current target state, declared command and transition, and effective operation before protected mutation. |
| `SP-AUTHZ-002` | Compare the contract's exact target and access scope fields using current target state and the active capability. Never authorize from a client scope claim. |
| `SP-ACL-001` | Use binding-key principals, forbid direct user grants, and match each list role and browser operation to the contract. |
| `SP-ACL-002` | Record explicit effective-operation booleans for every declared principal. Reject a missing probe or any undeclared allowed operation. |
| `APP-SAVE-001` | Use explicit Save, only `clientEditable` patch fields, a transaction-fresh digest, exact ETag, HTTP 412 conflict handling, GET-only ambiguous reconciliation, and semantic readback before success. |
| `APP-PAGINATION-001` | Follow continuation URLs to exhaustion using URL parsing, same-origin and site-path checks, visited-link detection, a positive page limit, and fail-closed handling. |
| `SP-ODATA-001` | Select fields from the contract allowlist, double single quotes in string literals, and encode query parameters and paths with structured URL APIs. Reject raw fragments. |
| `SP-SCHEMA-001` | Read field definitions and bind operations to the contracted internal name and confirmed `EntityPropertyName`; display names are presentation only. |
| `SP-SCHEMA-002` | Serialize structured endpoint-compatible payloads with the exact `SP.Field*` create type, `FieldTypeKind`, and generic `SP.Field` index-update metadata. |
| `SP-SCHEMA-003` | Compare every contracted property and return only `MATCH`, `CREATE_MISSING`, `INCOMPATIBLE`, or `GET_FAILED`. Do not coerce incompatible fields in place. |
| `HTTP-SEMANTIC-001` | Parse status and structured error fields separately. Map only code `-2147024809` or normalized `Column does not exist` semantics to `MISSING_OBJECT`; classify unrelated 400 responses as `GET_FAILED`. |
| `HTTP-SEMANTIC-002` | Map 404 to `CREATE_MISSING` only for an explicitly allowed initial Preflight GET. Apply and post-write Readback remain strict `GET_FAILED`. |
| `SP-INDEX-001` | Bind a fresh plan digest to current and required sets, enforce write limits, remove extras serially before additions, and use contract order for additions. |
| `SP-INDEX-002` | Read back every write and the exact final set. Return `NO_OP` with zero operations and zero writes when the current set is already compatible. |

Tenant schema state, effective permissions, separate-user behavior, HTTP response shapes, Apply execution, semantic effects, and publication remain residual external gates.
