# WP-09 Fail-Closed Executable Authority Remediation Record

## Scope

- Baseline: `f3b5fde20e334c3262f550c60063a1c7bc8ffd0b`
- Evidence: local static and synthetic local tests only
- Runtime target: Node.js `22.x`
- Private source, tenant, network mutation, and publication: not accessed or run

## Remediation

1. Frontend derivation accepts explicit `globalThis.fetch` and exact supported Save, pagination, and OData statement sequences.
2. Field derivation requires response-bound FOUND/MISSING/FAILED branches, exact compatibility assertions, create-only-in-MISSING, and post-create GET/readback.
3. Index derivation requires a complete indexed-field read, exact current-state assertion, digest binding, serial remove-before-add operations, full per-step/final readbacks, and compatible zero-write NO_OP.
4. Authorization requires contract Owner and Amount fields in the target GET and in the reachable guard before emitting their authority sources.
5. Offline verification derives every required `LIVE_SMOKE NOT_RUN` gate from the project contract and shipped rule catalog metadata.
6. The compiled CLI all-fourteen-rule path continues to use raw synthetic frontend files, a normalized definition, real ZIP bytes, and an exact package manifest.
7. Trusted schema and index branches require exact direct child action sets; unlabelled extra writes suppress the affected derivation.

## RED To Focused GREEN

- Initial RED: `23/28` PASS, five intended failures.
- Index grammar RED: `2/4` PASS, two intended failures.
- Focused GREEN: `30/30` PASS across the raw-authority and CLI command suites.
- Strengthened schema, index, and authorization regressions: `3/3` PASS.
- Additional branch-closure RED: `0/1` PASS; focused GREEN: `3/3` PASS with both extra-write variants rejected.

## Claim Boundary

This record is not release proof. Local verification does not establish tenant
import, execution, mutation, readback, live smoke, or publication evidence.

## Final Local Verification

- `npm run build`: PASS on Node.js `22.23.1`.
- Focused raw-authority and CLI tests: `30/30` PASS.
- `npm test`: `282/282` tests and `21/21` suites PASS.
- `git diff --check`: PASS.
- `npm audit --audit-level=low`: PASS with zero vulnerabilities.
- Official `scan public-data`: `NOT_RUN`; the scanner engine is unavailable, so
  the command process and report exit with code `8` and
  `CLI_VALIDATOR_NOT_RUN`.
- Supplemental local diff probes: no private markers, changed binary archives,
  GUIDs, or non-example email addresses found.

## Residual External Gates

The following remain `NOT_RUN`: tenant discovery, Preflight, Apply, import,
connection rebinding, flow enablement, flow execution, tenant mutation,
rule-specific live smoke, semantic readback, effective-permission readback,
tenant verification, publication, and publication readback. GitHub history and
the official public-data scanner also remain unavailable as release evidence.
