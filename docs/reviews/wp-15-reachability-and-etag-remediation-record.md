# WP-15 Remediation Record

## Implemented Controls

- NormalizedAction.controlReachability records conservative ancestry state.
- The normalizer evaluates deterministic boolean conditions and propagates
  reachability through true and false branches, including nested conditions.
- Known unreachable actions suppress all builder WP-06 derivations before
  section-specific evidence is emitted.
- Data-dependent branches remain unknown and retain the established
  structural and runAfter checks.
- Frontend Save rejects the wildcard and all C0/DEL characters in ETags,
  including control characters inside quoted values, while accepting a
  concrete quoted ETag and binding it to IF-MATCH.
- The public example manifest was regenerated from the changed synthetic
  frontend bytes.

## RED to GREEN

The WP-15 focused suite passes 4/4, including the compiled CLI fail-closed
control, nested branch control, reachable positive control, and runtime ETag
boundary control. The complete repository suite passes 315/315 tests in 21
suites on Node 22.23.1. The README contract, global rules, required-only rules,
and artifact commands each pass with exit 0. The README offline verify command
returns exit 8 only for the unavailable public-data scanner and reports tenant
and live gates as NOT_RUN. Build, diff check, and npm audit pass; audit reports
zero vulnerabilities.

The official history-aware public-data scanner was attempted and returned
process exit 8 with CLI_VALIDATOR_NOT_RUN. This is NOT_RUN, never PASS.

## Residual Gates

The official public-data scanner may remain NOT_RUN when its engine is
unavailable. Tenant discovery, preflight, apply, import, rebinding, enablement,
execution, mutation, live smoke, semantic readback, effective-permission
readback, tenant verification, publication, publication readback, and official
Git-history scanning remain separate gates. No local result promotes to those
claims.
