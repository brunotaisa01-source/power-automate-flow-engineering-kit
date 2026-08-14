# WP-13 Failed Response And Site Boundary Remediation Record

## Implementation

1. Pagination now requires `response.ok`, a `2xx` status, an object body, and
   an array `value` before it consumes results or continuation links. Failed,
   malformed, and unexpected responses fail closed.
2. Fresh digest retrieval validates the item and configured site boundary,
   requests context info beneath that site path, requires a successful `2xx`
   response, and accepts only a non-empty string `FormDigestValue`.
3. Save and OData require a configured `siteUrl` argument. The shared boundary
   helper rejects malformed URLs, credentials, hashes, cross-origin targets,
   and sibling-prefix paths using decoded path segments.
4. The frontend authority grammar now requires the boundary helper and the
   hardened response/data-flow shapes. Legacy source no longer produces a
   trusted derivation.

## Permanent Controls

- HTTP 500 pagination spoof-body regression.
- Malformed page-body and unexpected-status regressions.
- Failed, missing, and non-string digest regressions.
- Cross-origin, sibling-prefix, and malformed URL regressions.
- Same-origin Save and OData positive controls.
- Existing compiled fourteen-rule raw-artifact, package, ZIP, inventory,
  manifest, lineage, mutation-closure, privacy, and live-gate controls.

## Local Verification

- Node `22.23.1` build: PASS.
- Focused raw-artifact authority suite: `44/44` PASS.
- Full suite: `306/306` tests across `21/21` suites PASS.
- `git diff --check`: PASS.
- `npm audit --audit-level=low`: `0 vulnerabilities`.
- Supplemental scan covered `503` non-generated files: zero private marker
  matches, zero tracked denied archives, and one documented synthetic negative
  test vector (`person@example.com`).
- Official public-data scanner: `NOT_RUN`; process exit `1`, report exit `8`,
  diagnostic `CLI_VALIDATOR_NOT_RUN`, residual gate `public-data-scanner`.

## External Gates

Tenant discovery, preflight, apply, import, rebinding, enablement, execution,
mutation, live smoke, semantic and effective-permission readback, tenant
verification, publication, publication readback, and official scanner engine
availability remain separate gates. Local GREEN must not be reported as tenant
or release validation.
