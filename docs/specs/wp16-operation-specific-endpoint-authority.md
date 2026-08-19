# WP-16 Operation-Specific Endpoint Authority

## Status

Implemented locally from baseline `bfb42a0627f41f663632af7336bca629bd0be293`.
The evidence in this document is repository-local and synthetic. It is not
tenant, runtime, deployment, or publication evidence.

## Authority Model

The contract derives one origin, site path, and configured list resource. The
frontend source must contain matching literal bindings, and every URL supplied
to an operation must pass the shared origin/site boundary before its operation
grammar is evaluated. Caller-supplied site or resource values cannot replace
contract authority.

The old rule of accepting a list path plus arbitrary legitimate descendants is
insufficient. A path can be inside the correct site and list resource while
still targeting a different operation or a non-item endpoint. WP-16 therefore
uses separate helpers and separate AST-recognized shapes.

## Endpoint Grammars

Let `<listPath>` be the exact contract-derived path:

`https://example.test/sites/app/_api/web/lists/getbytitle('ITEMS_LIST')`

The synthetic `example.test` host is reserved for public fixtures.

| Operation helper | Accepted pathname | Query | Rejected examples |
| --- | --- | --- | --- |
| `saveItemUrl` | `<listPath>/items(<positive decimal integer>)` | none | `<listPath>`, `<listPath>/items`, `<listPath>/items(2)/fields`, item query |
| `odataListUrl` | `<listPath>` | none | `/fields`, `/items`, item path, extra descendant |
| `paginationCollectionUrl` | `<listPath>` | continuation query may remain | `/fields`, `/items`, item path, extra descendant |

All helpers reject:

- a different origin, site, list, or resource identifier;
- sibling-prefix paths and extra path segments;
- malformed absolute or relative URLs;
- credentials, fragments, and disallowed queries;
- raw `..` or `.` traversal markers;
- encoded dot, slash, or backslash traversal/separator markers.

The raw candidate guard runs before `new URL` normalization. This is required
because URL parsing can normalize a traversal path into a pathname that would
otherwise appear to match the allowlisted endpoint.

## Static Authority

The trusted frontend adapter accepts a closed fourteen-statement module: four
immutable contract declarations and ten fixed-order declarations/functions.
The three endpoint helpers are independently recognized. The adapter does not
accept a generic resource helper, a renamed alias, an extra statement, an
unreachable branch, or a source projection that merely repeats the expected
claims.

## Required Tests

Permanent runtime probes cover all three operations for `/fields`, wrong
collection/item forms, malformed URLs, raw and encoded traversal, encoded
separators, and resource substitutions. Existing tests continue to cover
origin, site, sibling-prefix, ETag, response status, readback, pagination loop,
OData allowlist, mutation closure, and source-authority controls.

The negative assertion is two-part: the operation must fail closed and the
fetch call count must remain zero. A positive fixture must still execute with
the configured synthetic endpoint shape.

## AI Build Procedure

When creating a new project, an AI should:

1. Read the contract and derive the origin, site path, and list path.
2. Generate three operation-specific endpoint helpers with no generic prefix
   acceptance.
3. Put raw/encoded traversal rejection before URL normalization.
4. Bind Save to the exact item form, OData to the exact list form, and
   pagination to the exact list form with continuation query handling.
5. Add RED probes before implementation and keep them permanently.
6. Mirror the accepted source shapes in the static recognizer and bind the
   real source inventory hash and byte count.
7. Run local validation and report tenant/runtime/publication gates separately.
