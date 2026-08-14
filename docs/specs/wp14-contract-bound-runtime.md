# WP-14 Contract-Bound Runtime Authority

## Purpose

WP-14 defines the minimum authority boundary for frontend code that talks to
SharePoint REST resources. A browser argument, query string, continuation
link, or source-level site URL is input data. It is not an authority source.
Authority comes from the project contract and the exact raw artifact that
passes the closed frontend grammar.

This specification is intentionally narrow. It describes what the current
frontend adapter can prove locally. It does not authorize tenant discovery,
flow execution, mutation, or publication.

## Contract Binding

1. Resolve the site URL from `sharePoint.siteUrlBinding`.
2. Require the binding to be a `site-url` binding with a valid HTTP(S)
   `example.test` value in a public contract.
3. Reject credentials, query strings, fragments, and an invalid trailing site
   configuration.
4. Derive each direct-patch list resource from the contract list
   `titleBinding` as:

   `/_api/web/lists/getbytitle('<titleBinding>')`

5. Require the accepted raw frontend artifact to contain a closed
   `SITE_URL` constant and a closed `LIST_RESOURCES` record that
   exactly match those contract-derived values.
6. Ignore caller-supplied `siteUrl` parameters for authority. They may
   remain in a public function signature for integration compatibility, but
   they cannot select an origin, site, or list.

The current grammar proves a literal contract match. A future expression-based
binding must be added as a new grammar shape with its own RED fixtures; a
string that merely looks like a binding expression is not sufficient.

## URL Boundary

Every Save item URL, OData base URL, initial pagination URL, and continuation
URL must pass the same sequence:

1. Parse with the URL API.
2. Match the contract site origin exactly.
3. Match the configured site path using decoded path segments, not a raw
   string prefix. A site named `app-evil` must not satisfy a site named
   `app`.
4. Match the configured list resource using decoded segment equality. The exact
   list resource and legitimate item descendants are allowed. A sibling list
   or another list on the same site is rejected.
5. Reject credentials, hashes, malformed URLs, origin changes, site escapes,
   sibling prefixes, and unknown list IDs before network I/O.

Relative URLs that resolve outside the configured site are rejected. A valid
synthetic URL uses the configured site path, for example:

`https://example.test/sites/app/_api/web/lists/getbytitle('ITEMS_LIST')`

The example domain is reserved synthetic data. It is not a tenant endpoint.

## Exact Save Concurrency

When direct patching is enabled, Save must prove all of the following:

1. The patch is non-empty and every field is contract-allowlisted.
2. The ETag is a concrete quoted entity tag. Wildcard, weak, empty, missing,
   or malformed values are rejected.
3. A current item GET is made first and must return status 200.
4. The current response must contain a concrete `@odata.etag` exactly
   equal to the ETag supplied to Save.
5. A fresh context digest is read under the contract site path and accepted
   only from a successful 2xx response with a non-empty string value.
6. The mutation uses POST with `X-HTTP-Method: MERGE`, the exact current
   ETag in `IF-MATCH`, and the fresh digest.
7. Status 412 becomes a conflict. Any other non-success mutation is reconciled
   by one GET and then fails; it is never reported as success or blindly
   retried.
8. A successful mutation requires a status-200 readback and a field-by-field
   comparison with the serialized patch.

The exact ETag read and the exact IF-MATCH value are one proof chain. A
contract claim, header label, or caller-provided wildcard cannot substitute for
that chain.

## Pagination

Pagination must validate the initial URL before the first fetch and validate
each server continuation before the next fetch. It must:

- require successful 2xx responses;
- require an object body with an array `value`;
- append values in server order;
- reject malformed or empty continuation strings;
- reject cross-origin, wrong-site, sibling-prefix, and wrong-list links;
- track visited canonical URLs and fail on loops;
- enforce the finite page limit;
- stop only when the continuation property is absent or null.

No response body is consumed as trusted data before its status and shape have
passed validation.

## OData

The accepted OData shape selects fields from the contract read allowlist,
escapes a single equality literal by doubling single quotes, and delegates
encoding to `URLSearchParams`. Raw filter fragments, arbitrary operators,
caller-selected resource paths, and caller-selected sites are outside the
grammar.

## RED Controls

Permanent tests must cover each of Save, OData, and pagination with:

- wrong origin;
- wrong site path;
- sibling site prefix;
- wrong list on the same site.

Save must additionally cover wildcard, malformed, missing, and mismatched
ETags. A negative probe is GREEN only when the invalid source or runtime input
fails closed and no trusted derivation or unauthorized request is produced.

## AI Build Procedure

An AI creating a new project should:

1. Read the project contract schema and the target contract before writing
   frontend code.
2. Resolve site and list identities from contract bindings, never from request
   data.
3. Generate the exact accepted resource helper and keep Save, OData, and
   pagination on that single helper.
4. Generate the current-ETag GET before the mutation and bind that value to
   IF-MATCH.
5. Generate status checks before parsing every response body.
6. Create valid synthetic fixtures plus all four boundary classes and the
   ETag negatives.
7. Run global validation and required-only validation separately.
8. Bind every manifest, digest, byte count, ZIP inventory, and source file to
   the real artifact graph.
9. Run the public-data scanner. If its engine is unavailable, record
   NOT_RUN; never convert that state to PASS.
10. Keep tenant, live-smoke, publication, and semantic-effect claims as
    separate gates requiring separately authenticated evidence.

The repository's example at `examples/minimal-public-app` is the
smallest complete public fixture for this procedure.
