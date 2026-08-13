# WP-07 Semantic Authority Remediation Record

> Historical local record. A later independent review blocked this commit for
> conditional early exits, substring URI matching, non-executable permission,
> HTTP, and index claims, and missing compiled-process coverage. Current claims
> are defined by the WP-08 records; this file must not be used as release proof.

## Scope

- Baseline: `bf42ebaa9215f8b6bf8dadf2ce566debbca5c293`
- Evidence class: local static and synthetic local test evidence only
- Runtime: Node.js `22.23.1`
- Private source projects: not accessed
- Tenant, network mutation, and publication: not run

## Local Remediation

1. Frontend derivation now requires reachable top-level behavior, exact AST data flow from consumed allowlists, fresh digest retrieval, POST/MERGE headers, exact ETag, `412` conflict handling, GET-only reconciliation, bounded continuation traversal, and structured OData construction.
2. Builder derivation now checks normalized connector methods, concrete SharePoint URI classes, action parameters, payload metadata, exact request headers, guard expressions, successful `runAfter`, and true-branch mutation dominance.
3. Trusted lineage is attached only inside `inspectTrustedProjectArtifacts(root, contract)`. Package exports that accept caller-authored derivations or evidence were removed.
4. The executable definition adapter emits all six builder sections, including `permissionProbes` and `indexPlans` with serial write/readback evidence.
5. The compiled CLI all-rule integration creates its context from a schema-valid synthetic contract, verified frontend inventory, normalized definition, real solution ZIP bytes, and package manifest. Synthetic graph hydration is not used for this acceptance path.
6. Static HTTP classification remains separate from runtime observation. Offline `verify` always emits the explicit `HTTP_SEMANTIC_001_LIVE_SMOKE_NOT_RUN` residual gate.

## Focused GREEN Evidence

```powershell
npm run build
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts tests/unit/cli/commands.test.ts tests/unit/package-adapters/public-trust-boundary.test.ts
```

Result: build PASS and the original `15/15` tests PASS. A fresh focused rerun
after adding the no-index regression passed `18/18` tests across three suites.

The raw-authority suite subsequently passed `11/11`, including the compiled
all-fourteen-rule raw-artifact integration and the fabricated/rebound evidence
probe. The eleventh test preserves non-index derivations for schema-valid
contracts that do not request index work.

## Final Verification

The final verification was run after all production and test changes with
Node.js `22.23.1` and npm `10.9.4`:

```powershell
npm run build
npm test
git diff --check
npm audit --audit-level=low
```

- Build: PASS
- Complete suite: `268/268` tests PASS across `21/21` suites
- Diff check: PASS
- Dependency audit: PASS, `0` vulnerabilities

The official command remained an explicit external gate:

```powershell
node packages/cli/dist/bin/spflow.js scan public-data . --format json
```

Result: process exit code `1`; the JSON report contained `exitCode: 8`,
`CLI_VALIDATOR_NOT_RUN`, and residual gate `public-data-scanner`. No PASS claim
is made for that scanner.

A supplemental scan limited to the 17 changed paths (16 existing files and one
deletion) found zero private/company markers, GUIDs, non-example email
addresses, or tracked binary artifacts. This supplemental result does not
replace the official scanner gate.

## Residual Gates

`NOT_RUN`: tenant discovery, Preflight, Apply, import, connection rebinding,
enablement, execution, tenant mutation, authenticated runtime HTTP observation,
semantic readback, effective-permission readback, tenant verification,
publication, publication readback, and Git history scan.

No local result may be promoted to any of those claim classes.
