# WP-12 Native Readback And Mutation Controls Remediation Record

## Scope

- Baseline: `f9539c15f4b45fc212a6e42806442e43a37b01cc`
- Evidence: local static and synthetic package-artifact tests only
- Runtime: Node.js `22.23.1`
- Private source projects: not accessed
- Tenant, external mutation, and publication: not accessed or run

## Remediation

1. Pagination authority now requires URL parsing, exact decoded site-path segment boundaries, explicit string continuation values, loop detection, same-origin checks, and bounded traversal. A sibling prefix such as `/sites/app-evil` cannot satisfy `/sites/app`.
2. Save authority requires `readback.ok` and exact status `200` before parsing. Success then requires every serialized write field/value to match the actual GET body.
3. Schema authority separates contract policy metadata from native SharePoint field properties. GET and post-create readback use exact native casing. Choice, DateTime, and Lookup properties are included only for supported types; Lookup list IDs are resolved by an executable list GET and consumed by create and readback expressions.
4. Permission grant readback uses a Query action that binds principal and role within one assignment object. Effective permissions are asserted against native `High`/`Low` masks; unknown operation names fail closed. Executable inheritance must still match `break-clear`.
5. Each index update performs a field pre-read and requires exact `POST`, `X-HTTP-Method: MERGE`, `IF-MATCH` data flow from that field's `@odata.etag`, fresh request digest, per-step readback, and final complete-state readback.
6. `PA-CONNECTOR-001` is method-aware. GET, HEAD, and OPTIONS do not require MERGE. Recognized create/action POSTs remain exempt; every other HTTP mutation or ambiguous method requires `POST`/`MERGE` and a non-wildcard exact ETag.
7. The compiled CLI still validates all fourteen contract-required WP-06 rules from exact synthetic frontend files, normalized definitions, native solution ZIP bytes, and exact manifests. Catalog-derived `LIVE_SMOKE NOT_RUN` behavior remains unchanged.

## RED To GREEN

- Initial focused RED: `65/74` PASS, nine intended failing tests.
- Final focused GREEN: `77/77` PASS across `2/2` suites.
- Full GREEN: `302/302` PASS across `21/21` suites.

## Local Verification

```powershell
npm run build
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts tests/rules/adapter-boundary-remediation.test.ts
npm test
git diff --check
npm audit --audit-level=low
node packages/cli/dist/bin/spflow.js scan public-data . --format json
```

- Node 22 build: PASS.
- Focused and full tests: PASS with the counts above.
- Dependency audit: PASS with zero vulnerabilities.
- Official public-data scanner: `NOT_RUN`; process exit `1`, report exit code `8`, `CLI_VALIDATOR_NOT_RUN`, residual gate `public-data-scanner`.
- Supplemental changed-file scan: zero private markers, machine paths, non-example emails, GUIDs, or tracked binary archives.

## Claim Boundary

This record does not establish release readiness. Local adapter GREEN does not
prove tenant discovery, Preflight, Apply, import, connection rebinding, flow
enablement, execution, mutation, rule-specific live smoke, semantic readback,
effective-permission readback, tenant verification, publication, publication
readback, or official Git history scanning. Those gates remain `NOT_RUN`.
