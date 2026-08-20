# SharePoint Flow Engineering Kit

## Use this skill when

Use this skill when designing, generating, reviewing, or validating a synthetic
or tenant-specific application with this data flow:

```text
frontend -> SharePoint Lists -> Power Automate -> SharePoint -> frontend
```

The product is the `spflow` CLI, project contracts, deterministic rules,
synthetic fixtures, evidence records, and documentation. It is not a tenant
administration API. Public commands and skills are read-only with respect to
tenants, lists, flows, permissions, and production.

Load the companion [Self-Improvement skill](../sharepoint-flow-engineering-kit-self-improvement/SKILL.md) automatically. It reads the versioned global lesson registry, captures new RED/review findings as sanitized candidates, and prevents unreviewed lessons from becoming instructions.

## Non-negotiable boundaries

- Read the project contract before generating an artifact. The contract is the
  authority for bindings, list identities, fields, operations, flow topology,
  package identity, and required rules.
- Derive the contract-bound origin, site path, and list path/list resource. Never
  let a caller, query string, continuation link, browser state, or source-level
  parameter replace contract authority.
- Keep public fixtures synthetic-only. Use `example.test`, explicit placeholders,
  and deterministic fake values. Protect synthetic-only privacy: never copy
  tenant URLs, private paths, names, identifiers, payloads, screenshots,
  credentials, or operational exports.
- Local evidence must not be treated as tenant evidence. A green test, build,
  package inspection, import, flow run, or synchronized folder does not prove
  tenant execution, mutation, semantic effect, or publication.
- Never use a write-capable MCP, write plugin, tenant mutation command, or
  improvised credential. A future MCP may be read-only only after separate
  stability and security approval.
- Keep residual external gates explicit. `NOT_RUN` is a residual state, not a
  successful runtime observation.

## 1. Read and bind the project contract

1. Load the JSON Schema and the target `project.contract.json`. Reject malformed,
   unknown, incomplete, or cross-referenced values before generating code.
2. Record the contract revision, data classification, runtime baseline, and
   evidence policy. A public contract must be `synthetic-public`.
3. Resolve `sharePoint.siteUrlBinding` to a `site-url` binding. For public work,
   its example must use a reserved synthetic host such as
   `https://example.test/sites/app`. Reject credentials, fragments, queries,
   real tenant domains, and absolute local binding files.
4. Resolve each list identity from its contract `id` and `titleBinding`. Derive
   the resource only from that binding, for example:

   ```text
   https://example.test/sites/app/_api/web/lists/getbytitle('ITEMS_LIST')
   ```

5. Carry the same contract-derived values into frontend, SharePoint rules, flow
   definitions, package manifests, and evidence. A repeated string is not proof
   unless its artifact path, digest, and data flow are bound in the graph.
6. Determine whether protected writes use the typed command queue or the narrow
   direct-patch exception. Prefer the typed command queue for protected business
   state.

## 2. Generate the frontend boundary

### Operation-specific endpoint helpers

Do not implement one generic list-prefix helper. Generate and test these three
helpers independently, all bound to the same contract origin, site path, and
list path:

- `saveItemUrl(listId, candidate)` accepts only
  `<listPath>/items(<positive decimal integer>)`, with no query or fragment.
- `odataListUrl(listId, candidate)` accepts only the exact `<listPath>`, with no
  query or fragment before the allowlisted OData query is added.
- `paginationCollectionUrl(listId, candidate)` accepts only the exact collection
  `<listPath>` for an initial request or server continuation. Preserve a query
  only when it is part of the validated server continuation contract.

Every helper must perform the following sequence:

1. Reject non-string candidates, credentials, fragments, malformed values, raw
   backslash, raw `.`/`..` traversal, encoded dots, encoded slash, encoded
   backslash, and encoded separators before URL parsing.
2. Parse through the contract-bound HTTP(S) origin and site boundary. Compare
   exact decoded path segments; a sibling such as `/sites/app-evil` is not
   `/sites/app`.
3. Compare the exact contract-derived list pathname and then apply the
   operation-specific grammar. Reject `/fields`, bare `/items`, item URLs given
   to collection operations, collection URLs given to Save, extra descendants,
   resource substitutions, wrong lists, wrong sites, and wrong origins.
4. Return a canonical URL only after all checks pass. Rejected candidates must
   fail before any `globalThis.fetch` call.

The raw guard must run before `new URL(...)` because URL normalization can turn
traversal into an apparently valid pathname. Tests must include uppercase and
lowercase encoded separators, malformed percent encodings, relative escapes,
sibling prefixes, wrong resources, and query misuse.

Use the unshadowed `globalThis.fetch` form in the accepted source grammar. The
static adapter must recognize a closed source inventory, fixed helper names,
fixed declaration order, fixed AST bodies, real source digest, and real byte
count. A renamed alias, extra statement, unreachable branch, copied projection,
or generic helper must remove trusted frontend authority.

### Frontend read path

- Select only contract `readAllowlist` fields.
- Escape OData string literals by doubling single quotes and encode query
  parameters with `URLSearchParams`. Do not accept caller-supplied filter
  fragments, fields, resources, sites, or operators.
- Validate the initial pagination URL and every server continuation with the
  collection helper before each request. Require successful `2xx`, an object
  body, an array `value`, finite page count, and loop detection. Never consume a
  body as trusted just because it contains the expected property.
- Treat the loaded item and its concrete ETag as a snapshot. A GET is not
  semantic readback unless it is status-checked and compared to the expected
  serialized data.

### Direct Save boundary

For an allowed direct patch, the sequence is closed and deterministic:

1. Validate the exact Save item URL before any request.
2. Reject an empty patch, unknown field, `undefined` value, wildcard ETag, weak
   or malformed ETag, and every C0/control/DEL character.
3. GET the item and require status `200`. Prove the native
   `@odata.etag` exactly equals the supplied ETag.
4. POST to the exact item URL with `X-HTTP-Method: MERGE`, the current exact
   `IF-MATCH`, and a fresh context digest obtained under the contract site path.
5. Treat `412` as a conflict. For any other failed or ambiguous write, perform
   one reconciliation GET and fail; never blindly retry or report success.
6. Require status `200` for the final readback and compare every serialized patch
   field with the native response. A status code, body shape, or contract claim
   alone is not semantic success.

Check response status before parsing and require semantic readback; a body
shape alone never proves behavior. The `siteUrl` parameter may remain for
compatibility, but it cannot choose authority. The contract-derived value must
be used by the executable helper and recognized by the static adapter.

## 3. Use a typed command queue for protected business writes

The preferred protected-write boundary is:

```text
frontend intent -> typed command list -> flow claims command
  -> flow re-reads identity/capability/scope/target/state/ETag
  -> validates transition -> mutates protected list
  -> writes audit event -> performs semantic readback
  -> completes command -> frontend reloads authoritative state
```

The browser may provide a requested operation and correlation ID. It must not
provide authoritative actor identity, capability, scope, protected status,
amount, ownership, server state, or ETag. The flow must reject unknown command
types, fields, transitions, principals, scopes, duplicate commands, stale ETags,
and out-of-plan mutations. Every mutation must have an explicit role, bounded
write count, data-flow proof, response check, audit step, and readback.

## 4. Build SharePoint schema and state boundaries

### Schema lifecycle

A schema operation is trusted only when it is tied to the contract target, a
real native SharePoint response, and a reachable executable branch. The response
state is exactly one of `FOUND`, `MISSING`, or `FAILED`:

- `FOUND`: native status and complete response properties match the contract.
  Do not create or overwrite.
- `MISSING`: only the explicitly classified initial missing response may enter
  the create branch. Build the complete type-specific payload, create once,
  status-check the response, then GET and compare the created field.
- `FAILED`: any unexpected status, malformed body, wrong schema, incomplete
  response, or failed readback. Stop. Never reinterpret a body with a `500` or
  other failed status as `FOUND`.

Choice, Lookup, DateTime, Text, Number, and other types require their native
properties and contract bindings. A contract metadata projection or a parameter
label is not a native response.

### Index lifecycle

Read every contract-required indexed field and assert the exact current state,
including native ETag and digest evidence. Consume an approved digest assertion
from the reachable executable plan. Index changes use serial remove-before-add operations; compatible state is
`NO_OP` with zero writes and the same digest/current-state proof. If a change is needed, use the exact
field ETag with `POST`/`MERGE`/`IF-MATCH`, status-check every response, and perform
per-step plus final native readbacks. Do not infer an index from a label, list
enumeration, stale evidence, or a successful write without readback.

## 5. Permission and authorization boundaries

Permission intent is not permission evidence. For a contract-approved
`break-clear` profile:

1. Resolve the principal and role from explicit bindings.
2. Break and clear inheritance only in the bounded executable plan.
3. Execute one grant assignment that binds the principal and role together.
4. Perform permission readback against the exact assignment and require one
   matching principal-role object.
5. Perform effective-permission readback and validate native `High` and `Low`
   masks against the contract operation set.
6. Reject direct user grants, substring matches, missing assignment data,
   contract-only claims, and inherited-state assumptions.

Authorization must re-read owner and amount (or equivalent protected fields)
from the exact target GET. A field absent from the selected server read cannot
create authorization.

## 6. Power Automate flow boundary

Inspect the normalized flow definition and final package separately. Validate
trigger, action graph, run-after relationships, connection references, method,
endpoint, payload, mutation closure, retry, idempotency, HTTP classification,
status handling, response data flow, and semantic assertions.

- GET/HEAD/OPTIONS are reads. Recognized updates require exact
  `POST`/`MERGE`/ETag controls. Unknown or dynamic non-read requests fail closed.
- Every response body is parsed only after status validation. A body containing
  an expected property cannot promote a failed response.
- Retry must be bounded, operation-specific, and safe for the idempotency model.
  Never retry an ambiguous mutation blindly.
- A `Succeeded` label is not semantic success. The success branch must be
  reachable, response-dependent, and followed by semantic readback.
- The normalized definition, safely inspected final ZIP, package manifest,
  frontend inventory, and contract must form one exact digest/byte/inventory
  graph. A JSON file named `.zip`, a copied source projection, or a manifest
  claim cannot authorize the package.

## 7. RED/GREEN workflow

Run RED before GREEN for every change:

1. Write a permanent synthetic RED fixture that demonstrates the specific bypass
   and asserts the expected diagnostic, including zero unauthorized requests
   where applicable.
2. Add an independent positive control with a structurally different topology.
3. Implement the smallest fail-closed change.
4. Run the focused test, then build, package/example commands, full suite,
   whitespace check, dependency audit, and scanner checks.
5. Run mutation or counterexample tests to prove a label, alias, projection,
   branch, digest, or identifier cannot fake authority.
6. Ask for an independent review. Do not call a focused result a release.

Keep the RED fixture permanently. A timeout is not automatically RED; record the
command, timeout, process state, and next action separately.

## 8. Local, runtime, tenant, and publication evidence

Use these claim classes exactly and do not promote one into another:

| Claim class | What it can prove | What it cannot prove |
| --- | --- | --- |
| `LOCAL_STATIC` | parser, schema, source, graph, and deterministic rule facts | HTTP, tenant, or semantic effect |
| `LOCAL_PACKAGE` | exact local ZIP/archive and manifest inspection | import or runtime |
| `COMPILED_CLI` | shipped CLI process behavior | production behavior |
| `RUNTIME_SYNTHETIC` | controlled in-memory or synthetic HTTP behavior | tenant behavior |
| `TENANT_READONLY` | authorized discovery/readback in a tenant | mutation or publication |
| `TENANT_PREFLIGHT` | bounded preflight facts | import, enablement, or execution |
| `TENANT_IMPORTED` | authorized import response | rebinding, enablement, execution |
| `TENANT_REBOUND` | explicit connection rebinding readback | enablement or run effect |
| `TENANT_ENABLED` | enablement readback | execution or mutation |
| `TENANT_EXECUTED` | controlled run response | semantic effect without readback |
| `TENANT_READBACK` | native post-run comparison | publication |
| `TENANT_MUTATED` | explicitly authorized mutation and compensation evidence | production readiness |
| `PUBLISHED` | public repository publication response | tenant readiness |
| `PUBLISHED_READBACK` | public repository readback | tenant execution or semantic effect |

Report `LOCAL_STATIC` separately from `TENANT_READONLY`. A local or synthetic
GREEN is never tenant GREEN. Keep `LIVE_SMOKE NOT_RUN`, publication, rollback,
permission, semantic effect, and tenant gates visible
until separately authenticated evidence exists.

## 9. CLI and validation procedure

From the repository root with Node 22 and npm 10:

```powershell
npm ci
npm run build
npm test
node packages/cli/dist/bin/spflow.js validate contract examples/minimal-public-app/project.contract.json --format text
node packages/cli/dist/bin/spflow.js validate rules --root examples/minimal-public-app --format text
node packages/cli/dist/bin/spflow.js validate rules --root examples/minimal-public-app --required-only --format text
node packages/cli/dist/bin/spflow.js validate artifact examples/minimal-public-app/artifacts/example-solution.zip --contract examples/minimal-public-app/project.contract.json --format text
node packages/cli/dist/bin/spflow.js verify --root examples/minimal-public-app --offline --format text
node packages/cli/dist/bin/spflow.js scan public-data . --history --format json
git diff --check
npm audit --audit-level=low
```

The contract, rules, required-only, and artifact commands should return exit
`0` when their local evidence is complete. Offline verification or an explicitly
requested unavailable scanner may return exit `8`; report the exact
`NOT_RUN` diagnostic and never rewrite it as PASS. `npm test` and a build do not
close tenant or publication gates.

## 10. Privacy and release checklist

Before any public commit or publication:

- Run the official public-data scanner with history when available. If its
  engine is unavailable, record exit `8` and `NOT_RUN`; do not claim scanner
  PASS.
- Run a supplemental review for company markers, private paths, real emails,
  GUIDs, URLs, credentials, production archives, screenshots, and unexpected
  binary files. Classify documented synthetic negative fixtures separately.
- Inspect ZIP entries recursively and verify the exact manifest digest and byte
  count.
- Review `git status`, explicit commit scope, history reachability, and clean
  worktree. Never use `git add -A` when scope is mixed.
- Do not publish private source projects, raw reports, tenant IDs, URLs, names,
  screenshots, payloads, or credentials.

## 11. Report format

Every validation wave must report:

```text
Decision: APPROVED or BLOCKED
commit: <hash or not committed>
tree: <tree hash or not committed>
branch: <branch>
clean worktree: yes/no
worker used: <scope>
worker retired: yes/no
files changed: <explicit paths>
RED results: <counts and command>
GREEN results: <counts and command>
build result: PASS/FAIL
full suite result: <count>
README command results: <per-command exit>
audit result: PASS/FAIL
privacy scan result: PASS/NOT_RUN/BLOCKED with scope
official scanner result: PASS/NOT_RUN/BLOCKED
independent review result: APPROVED/BLOCKED
residual external gates: <explicit list>
next action: <one action>
blocker: <concrete condition or none>
```

A complete report still cannot say `100% ready` while any required tenant,
publication, scanner, rollback, semantic readback, or independent human gate
remains open.
