# Power Automate Flow Definition and Package Specification

## 1. Scope

This specification defines supported Power Automate definitions, native solution ZIP validation, action-graph validation, WDL expression checks, connector shapes, connection references, limits, manifest integrity, and import readiness.

The initial supported profile is `power-platform-solution-v1`. Unsupported export profiles fail with exit `3`; the CLI MUST NOT guess.

## 2. Validation Layers

Each layer is independently parsed and validated:

1. builder source;
2. generated flow definition;
3. final ZIP entry and extracted definition;
4. artifact manifest;
5. documentation and evidence claims.

A GREEN at one layer does not imply GREEN at a later layer. Import review uses the exact final ZIP digest and the definition extracted from that ZIP.

## 3. Native ZIP Envelope

### 3.1 Required root entries

For `power-platform-solution-v1`, normalized root inventory MUST contain:

```text
[Content_Types].xml
customizations.xml
solution.xml
```

It MUST contain at least one flow definition discoverable through solution metadata and the `Workflows/` inventory. Exact workflow paths and supporting entries are derived from parsed solution metadata and declared in the package manifest. Unknown root entries fail unless explicitly allowed by the profile schema.

### 3.2 Archive safety

Before content parsing, the adapter MUST reject:

- absolute paths, drive-prefixed paths, UNC paths, or `..` traversal;
- NUL bytes, control characters, device names, links, or duplicate normalized paths;
- encrypted entries;
- nested archives for a package whose contract sets `nestedArchives: "forbidden"`;
- more than 2,000 entries;
- any uncompressed entry larger than 50 MiB;
- total uncompressed size larger than 250 MiB;
- compression ratio above 100:1 for any entry;
- XML with DTD or external entity declarations.

ZIP traversal is lazy. Limits are enforced before full extraction. Validation uses memory-bounded streams and never writes entries outside an isolated temporary directory.

### 3.3 Inventory comparison

The normalized actual inventory MUST equal the profile-derived expected inventory. Missing, extra, duplicate, case-colliding, or renamed entries fail `PKG-NATIVE-001`.

## 4. Artifact Manifest

Path: `artifacts/manifest.json`

```ts
interface ArtifactManifest {
  schemaVersion: "1.0";
  projectId: string;
  contractRevision: number;
  generatedBy: { tool: "spflow"; version: string };
  packageProfile: "power-platform-solution-v1";
  files: ManifestEntry[];
}

interface ManifestEntry {
  path: string;
  mediaType: string;
  bytes: number;
  sha256: string;
  role: "definition" | "package" | "contract" | "schema" | "documentation";
}
```

- Entries are sorted by `path`.
- `sha256` is lowercase hexadecimal and recomputed from exact bytes.
- The manifest MUST NOT hash itself.
- Missing, extra, stale, or duplicate entries fail `PKG-INTEGRITY-001`.
- A private/internal digest from another repository MUST NOT be copied into the public manifest.

## 5. Definition Normalization

The adapter extracts each flow's trigger, actions, scopes, child actions, expressions, connection references, retry policies, concurrency settings, and operation metadata into:

```ts
interface NormalizedFlow {
  id: string;
  trigger: NormalizedTrigger;
  actions: Map<string, NormalizedAction>;
  connectionReferences: Set<string>;
  actionCount: number;
}

interface NormalizedAction {
  id: string;
  type: string;
  parentId?: string;
  parentType?: string;
  runAfter: Array<{ actionId: string; statuses: string[] }>;
  expressionPointers: string[];
  connector?: { reference: string; operationId: string; method?: string; uriClass?: string };
  retryPolicy?: { type: string; count?: number; interval?: string };
}
```

Action IDs are unique after case normalization. The adapter rejects unknown structures that prevent sound graph construction.

## 6. Action Graph

### 6.1 Nodes and edges

- The trigger is the unique root.
- Every top-level action is a node.
- Nested actions retain parent scope ancestry.
- Each `runAfter` reference creates a directed edge from predecessor to action.
- An action with no explicit `runAfter` follows only the platform-defined first-action semantics within its container; the adapter MUST model that relationship explicitly.

### 6.2 Required checks

- Every `runAfter` target exists in the same valid container context.
- Every status is from the supported status set.
- No cycle exists.
- Every security, authorization, mutation, audit, readback, completion, and failure action is transitively reachable from the trigger.
- Success and failure terminal paths are satisfiable; contradictory status requirements fail.
- A mutation path cannot bypass required authorization and state guards.
- Command `Succeeded` cannot be reached without semantic readback success.
- `Terminate` has no `Foreach` or `Apply_to_each` ancestor.

Failures use `PA-GRAPH-001`, `PA-GRAPH-002`, `PA-SCOPE-001`, or `FLOW-STATUS-001` as applicable.

## 7. WDL and JSON Expressions

Validators MUST parse every Workflow Definition Language expression and reject:

- unbalanced delimiters or malformed function calls;
- invalid action references;
- unsafe raw JSON interpolation;
- expression text that can produce invalid JSON for quote, backslash, newline, null, or Unicode controls;
- undeclared dynamic field/action names;
- secret or environment value literals;
- result references to actions that are not guaranteed reachable on that path.

Synthetic tests MUST include quotes, backslashes, CR/LF, empty strings, nulls, and reserved OData characters. Corrections use structured objects, platform expression functions, and serializer-owned escaping.

## 8. Connector Method Shapes

### 8.1 SharePoint REST mutation

A SharePoint MERGE request through an HTTP connector MUST use:

```text
method: POST
headers.X-HTTP-Method: MERGE
headers.IF-MATCH: exact non-wildcard ETag
```

The connector method value `MERGE` is invalid. `IF-MATCH: *` is invalid for protected or direct-patch writes.

### 8.2 SharePoint field/index update

Where required by the endpoint, the body MUST include `__metadata.type: "SP.Field"`. Untyped index payloads fail `SP-SCHEMA-002`.

### 8.3 Request URI

- URI components are structurally composed and encoded.
- Empty pagination URI is guarded before connector execution.
- Dynamic continuation URIs are same-origin constrained.
- A connector action MUST NOT contain a real tenant URL in public artifacts.

## 9. Connection References

- Every action connection reference MUST be declared in the flow contract and solution metadata.
- Every declared required reference MUST be used by at least one reachable action.
- Logical names must be placeholders or synthetic identifiers in public fixtures.
- Import starts disabled.
- Rebind is a tenant-only operation and requires authenticated readback of each reference before enablement.
- Personal or implicit connections are rejected by the public profile.

Violations use `PA-CONNECTION-001`.

## 10. Limits and Concurrency

- `actionCount` includes trigger-adjacent actions and all nested actions.
- It MUST be less than or equal to the flow's `actionBudget` and the profile platform budget.
- A definition over budget fails `PA-LIMIT-001`; it is not truncated or waived.
- Command processors that require serialization declare concurrency enabled with degree `1`.
- Parallelism is allowed only when the contract proves independent keys, bounded fan-out, and idempotent effects.

## 11. Retry and Idempotency

- Mutating connector actions MUST disable implicit unsafe retries or use a contract-proven idempotent operation.
- Timeout/unknown result branches perform GET reconciliation.
- A write MAY be replayed only after readback proves no effect and the operation is explicitly replay-safe.
- Dedupe uses a non-empty deterministic key and `0/1/many` handling.
- Multiple matches fail reconciliation.

Blind retry fails `FLOW-RETRY-001`. Missing idempotency handling fails `FLOW-IDEMPOTENCY-001`.

## 12. Destructive Gates

A destructive definition MUST contain reachable gates for:

- dry run;
- bounded target and operation allowlist;
- exact plan digest;
- explicit approval token/reference;
- item and write limits;
- recent ETag/state reread;
- stop-on-unexpected behavior;
- semantic readback;
- failure audit and rollback/compensation path.

The package contract MUST declare destructive flows. Missing or bypassable gates fail `FLOW-DESTRUCTIVE-001`.

## 13. Import Readiness Output

```ts
interface PackageReadiness {
  result: "READY_FOR_DISABLED_IMPORT_REVIEW" | "BLOCKED";
  packagePath: string;
  packageDigest: string;
  profile: string;
  flowIds: string[];
  diagnostics: Diagnostic[];
  residualGates: Array<"IMPORT_DISABLED" | "REBIND_READBACK" | "ENABLE_READBACK" | "LIVE_SMOKE" | "TENANT_VERIFIED">;
}
```

`READY_FOR_DISABLED_IMPORT_REVIEW` is a `PACKAGE_ARTIFACT` claim only. It does not assert that import will succeed or that any tenant gate passed.

## 14. Required Rule Coverage

At minimum, package validation exercises:

- `PKG-NATIVE-001`: native envelope mismatch;
- `PKG-ARCHIVE-001`: unsafe archive;
- `PKG-INTEGRITY-001`: stale manifest;
- `PA-LIMIT-001`: action budget overflow;
- `PA-GRAPH-001`: unreachable action or invalid predecessor;
- `PA-GRAPH-002`: cycle or unsatisfiable path;
- `PA-WDL-001`: invalid WDL;
- `PA-EXPRESSION-001`: unsafe JSON interpolation;
- `PA-CONNECTOR-001`: invalid connector method shape;
- `PA-CONNECTION-001`: missing or unused required connection reference;
- `PA-SCOPE-001`: `Terminate` inside loop;
- `FLOW-IDEMPOTENCY-001`: incomplete key/cardinality handling;
- `FLOW-RETRY-001`: blind mutation retry;
- `FLOW-STATUS-001`: completion without semantic effect;
- `FLOW-DESTRUCTIVE-001`: missing destructive gates;
- `DATA-PUBLIC-002`: private data inside archive.

## 15. Commands

```text
spflow validate artifact artifacts/{PACKAGE_FILE} --contract project.contract.json --format json
spflow verify --root . --offline --format json
```

No validation command imports, binds, enables, triggers, disables, or deletes a flow.

