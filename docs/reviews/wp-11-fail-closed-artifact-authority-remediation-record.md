# WP-11 Fail-Closed Artifact Authority Remediation Record

## Scope

- Baseline: `da422100f320bd0019adabf8136a42d94c5cc0aa`
- Evidence: local static and synthetic package-artifact tests only
- Runtime: Node.js `22.23.1`
- Private source projects: not accessed
- Tenant, external mutation, and publication: not accessed or run

## Remediation

1. Builder derivation now performs flow-wide mutation closure over every normalized action before emitting any trusted section.
2. Mutating actions must belong to the exact contract-derived action set already proven by their section. Unsupported connectors, missing HTTP methods, unlabelled writes, forged role extensions, and out-of-plan index, schema, permission, or protected-item writes suppress the complete builder derivation.
3. Field compatibility comparisons include all supported contract properties. Exact create payloads include type-specific ordered Choice values, Lookup list/field bindings, and DateTime display mode, and reject missing, extra, wrong-type, or wrong-value properties.
4. OData authority accepts only one equality expression over an allowlisted field. Values are quoted, single quotes are doubled, and `URLSearchParams` performs encoding; raw filter fragments are outside the grammar.
5. Save authority rejects empty, unknown, and undefined patch entries. Ambiguous responses reconcile by GET and then fail. Success requires parsing the GET response and comparing every serialized write field/value before return.
6. The compiled CLI still validates all fourteen contract-required WP-06 rules from exact synthetic frontend files, normalized definitions, native solution ZIP bytes, and exact manifests without synthetic graph hydration.
7. Rule-specific `LIVE_SMOKE NOT_RUN` gates remain derived dynamically from required catalog metadata.

## RED To GREEN

- Initial RED: `26/32` PASS, six intended failing subtests.
- Final raw-authority GREEN: `33/33` PASS.
- Expanded raw-authority, CLI, and shipped-integration GREEN: `71/71` PASS across `3/3` suites.
- Full GREEN: `291/291` PASS across `21/21` suites.

## Local Verification

```powershell
npm run build
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts tests/unit/cli/commands.test.ts tests/integration/shipped-validation.test.ts
npm test
git diff --check
npm audit --audit-level=low
node packages/cli/dist/bin/spflow.js scan public-data . --format json
```

- Node 22 build: PASS.
- Focused, expanded, and full tests: PASS with the counts above.
- `git diff --check`: PASS; line-ending conversion warnings are informational.
- Dependency audit: PASS with zero vulnerabilities.
- Official public-data scanner: `NOT_RUN`; process exit `1`, report exit code `8`, `CLI_VALIDATOR_NOT_RUN`, residual gate `public-data-scanner`.
- Supplemental changed-file scan: seven public paths expected at commit time; zero private markers, machine paths, non-example emails, GUIDs, or tracked binary archives.

## Claim Boundary

This record does not establish release readiness. Local adapter GREEN does not
prove tenant discovery, Preflight, Apply, import, connection rebinding, flow
enablement, execution, mutation, rule-specific live smoke, semantic readback,
effective-permission readback, tenant verification, publication, publication
readback, or official Git history scanning. Those gates remain `NOT_RUN`.
