# WP-08 Executable Semantics Remediation Record

## Scope Boundary

This work uses synthetic local artifacts only. It does not establish release
readiness, tenant behavior, successful import, or publication.

## Remediation

1. Frontend adapters now accept only the documented statement shapes and
   reject statically terminating or structurally ambiguous variants.
2. Builder adapters parse relative canonical SharePoint REST paths and exact
   query identities instead of substring matching.
3. Authorization evidence requires server reads, a fail-closed guard, a
   true-branch MERGE, exact ETag, mutation readback, and a fail-closed readback
   assertion.
4. Permission evidence requires principal and role resolution, executable grant
   assignment, role-assignment readback, effective-permission probes, and
   fail-closed dependent assertions.
5. HTTP evidence requires a response-dependent 400/404 decision tree. Runtime
   observation remains the separate `LIVE_SMOKE` gate.
6. Index evidence requires a field read, response-dependent plan guard, plan
   hash data flow, fresh request digest, typed serial writes, per-step readback,
   and final readback assertions.
7. Builder sections derive independently, so an unsupported section cannot mint
   evidence and does not erase valid unrelated evidence.
8. `validate rules --required-only` runs only the contract-declared rule IDs;
   the unqualified command continues to validate the global registry.

## Current Local Evidence

The original five probes moved from `11/16` PASS to `16/16` PASS. After adding
canonical endpoint, dominance/data-flow, parser, and compiled-process controls,
the focused command passed `33/33` tests across two suites. The compiled CLI
process passed all fourteen contract-required WP-06 rules from a verified
frontend inventory, declared definition, real solution ZIP bytes, and package
manifest without synthetic graph hydration.

## Final Local Verification

Fresh Node.js `22.23.1` commands completed after the production and test
changes:

```powershell
npm run build
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts tests/unit/cli/parse-args.test.ts
npm test
git diff --check
npm audit --audit-level=low
node packages/cli/dist/bin/spflow.js scan public-data . --format json
```

- Build: PASS
- Focused tests: `33/33` PASS across `2/2` suites
- Complete suite: `276/276` PASS across `21/21` suites
- Diff check: PASS
- Dependency audit: PASS, `0` vulnerabilities
- Official public-data scanner: `NOT_RUN`; process exit `1`, report
  `exitCode: 8`, `CLI_VALIDATOR_NOT_RUN`, residual gate
  `public-data-scanner`

A supplemental current-change scan checked all 13 changed or added files. It
found zero private/company markers, non-example email addresses, non-example
URLs, GUIDs, secret assignments, or machine-specific identities. All changed
files are Markdown or TypeScript. This does not replace the official scanner.

## Residual Gates

`NOT_RUN`: official public-data scanner, Git history scan, tenant discovery,
Preflight, Apply, import, connection rebinding, enablement, execution, tenant
mutation, authenticated HTTP live smoke, semantic readback, effective
permissions, tenant verification, publication, and publication readback.
