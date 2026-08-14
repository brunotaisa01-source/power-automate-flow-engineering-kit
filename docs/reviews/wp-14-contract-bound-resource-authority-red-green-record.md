# WP-14 Contract-Bound Resource Authority RED/GREEN Record

## Baseline

- Baseline commit: d40fdbb0413463d38338c088ac3140f741db707c.
- Work package: WP-14.
- Scope: local synthetic repository only.
- External systems: not accessed.

## Initial RED

The first focused Node 22 run used the existing frontend fixture plus two
permanent WP-14 probes:

- caller-selected site/list source values were incorrectly accepted;
- an OData URL for another list on the same site was incorrectly accepted.

Result: 44 of 46 focused tests passed and 2 intended WP-14 probes failed.
The initial README quickstart probe also returned exit 2 for each root command
because the repository had no public example contract or artifact root.

## Remediation

1. The frontend adapter now derives the site origin and path from the contract
   site-url binding.
2. It derives list REST resources from the contract list title binding.
3. Save, OData, and pagination share a contract-bound list resource boundary.
   Caller site arguments cannot select another origin or site path.
4. Save requires a concrete quoted ETag, a successful current-item GET, an
   exact current response ETag match, and the same value in IF-MATCH.
5. The existing digest, response status, conflict, ambiguous-write,
   readback, inventory, lineage, ZIP, method, schema, permission, index,
   mutation-closure, and live-gate controls remain active.
6. The public example contains only reserved synthetic values and exact
   contract, frontend, flow, ZIP, and manifest bindings.

## Permanent GREEN Controls

- Valid same-origin, same-site, configured-list Save and OData fixtures.
- Valid pagination with configured-list continuation behavior.
- Wrong origin, wrong site path, sibling-prefix, and wrong-list probes for
  Save, OData, and pagination.
- Wildcard, weak, empty, missing, malformed, and mismatched ETag probes.
- Static source mutations that remove contract site/list binding or exact ETag
  proof and therefore produce no trusted derivation.
- Public example contract, global rule, required-only rule, and ZIP validation.

## Local Verification

- Node 22 build: PASS.
- Focused raw-artifact authority suite after WP-14 probes: 49/49 PASS.
- Public example contract validation: PASS.
- Public example global rule validation: PASS.
- Public example required-only rule validation: PASS.
- Public example package artifact validation: PASS.
- Offline verify: exit 8 with public-data-scanner NOT_RUN; live and tenant
  gates remain NOT_RUN.
- Built-CLI integration probe: 1/1 PASS.
- Full Node 22 repository suite: 311/311 PASS across 21 suites.
- `git diff --check`: PASS; only the expected Windows LF-to-CRLF warnings were
  emitted.
- `npm audit --audit-level=low`: PASS; 0 vulnerabilities.
- History-aware official public-data scan: exit 8, `CLI_VALIDATOR_NOT_RUN`,
  residual gate `public-data-scanner`; this is NOT_RUN, never PASS.

## External Gates

Tenant discovery, preflight, apply, import, rebinding, enablement, execution,
mutation, live smoke, semantic and effective-permission readback, tenant
verification, publication, publication readback, and official scanner engine
availability remain separate gates. Local GREEN is not tenant or release
validation.
