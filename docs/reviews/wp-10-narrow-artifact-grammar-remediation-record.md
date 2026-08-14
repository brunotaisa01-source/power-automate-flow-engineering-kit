# WP-10 Narrow Artifact Grammar Remediation Record

## Scope

- Baseline: `47c544262f4fab45b9c18cc610908c8ae606ab0a`
- Evidence: local static and synthetic package-artifact tests only
- Runtime: Node.js `22.23.1`
- Private source projects: not accessed
- Tenant, external mutation, and publication: not accessed or run

## Remediation

1. Frontend parsing rejects diagnostics and accepts only a closed module inventory with exact structural AST shapes.
2. The accepted frontend grammar binds network calls to the unshadowed `globalThis.fetch` form and rejects aliases, extra declarations, unsupported control flow, reachable early exits, loop breaks, and textual decoys.
3. Field creation requires an exact contract-complete SharePoint payload plus response-dependent FOUND/MISSING/FAILED branches and post-create readback assertions.
4. Index derivation requires the complete indexed-field response, exact current-state assertion, approved digest assertion, serial remove-before-add writes, full per-step/final readbacks, and a digest-bound APPLY or zero-write NO_OP result.
5. Permission derivation supports only executable break-clear settings matching the contract; inheritance mismatches suppress both permission sections.
6. Owner and Amount authority remains conditional on exact target GET selection and reachable guard consumption.
7. Rule-specific `LIVE_SMOKE NOT_RUN` gates remain catalog-derived, and the compiled CLI validates all fourteen contract-required WP-06 rules from exact synthetic raw artifacts.

## RED To GREEN

- Initial RED: `22/28` PASS, six intended failing subtests.
- Focused raw-authority GREEN: `28/28` PASS.
- Expanded raw-authority, CLI, and shipped-integration GREEN: `66/66` PASS across `3/3` suites.
- Full GREEN: `286/286` PASS across `21/21` suites.

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
- Focused and full tests: PASS with the counts above.
- `git diff --check`: PASS; line-ending conversion warnings are informational.
- Dependency audit: PASS with zero vulnerabilities.
- Official public-data scanner: `NOT_RUN`; process exit `1`, report exit code `8`, `CLI_VALIDATOR_NOT_RUN`, residual gate `public-data-scanner`.
- Supplemental changed-file scan: seven public paths expected at commit time; zero private markers, machine paths, non-example emails, GUIDs, or tracked binary archives.
- Supplemental repository-history marker scan: zero matches. This is not a replacement for the unavailable official history scanner.

## Claim Boundary

This record does not establish release readiness. Local adapter GREEN does not
prove tenant discovery, Preflight, Apply, import, connection rebinding, flow
enablement, execution, mutation, rule-specific live smoke, semantic readback,
effective-permission readback, tenant verification, publication, publication
readback, or official Git history scanning. Those gates remain `NOT_RUN`.
