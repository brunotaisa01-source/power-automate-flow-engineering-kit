# Task 3 worker handoff: read-only provider adapter contract

## Status

Implemented and verified in the local synthetic/offline boundary. Implementation commit: `e54515d86aca0d81c8abb531eb6d59bfeac4f7ee` (`feat: add read-only provider adapter contract`). No other workers were spawned or coordinated. No Power Automate, Dataverse, provider, browser, network, or tenant operation was performed.

## Files

- `packages/core/src/provider-readonly.ts` — exported `ReadonlyProviderSnapshot` contract types, immutable-input-safe schema/semantic validator, deterministic diagnostics, capability/readback/evidence-boundary checks, and secret-like value rejection.
- `packages/core/package.json` — exports `@spflow/core/provider-readonly`.
- `contracts/provider-readonly.schema.json` — strict additional-properties-free JSON Schema for sanitized environment, solution, flow, connection-reference, capability, and evidence metadata.
- `fixtures/provider-readonly/synthetic-readback.json` — synthetic-only fixture with local PASS and provider/UAT `NOT_VERIFIED` gates.
- `tests/unit/core/provider-readonly.test.ts` — RED/GREEN, mutation, identity, ambiguity, readback authority, schema, positive-control, and hostile-input coverage.
- `tests/integration/provider-readonly-boundary.test.ts` — offline/no-client boundary, fixture privacy, and local/provider/UAT separation coverage.

## RED evidence

Initial focused command:

```text
node --experimental-strip-types --test tests/unit/core/provider-readonly.test.ts tests/integration/provider-readonly-boundary.test.ts
```

Result: expected RED; both new test files failed to load with `ERR_MODULE_NOT_FOUND` because `packages/core/src/provider-readonly.ts` did not yet exist.

Authority regression RED command:

```text
node --experimental-strip-types --test --test-name-pattern='requires the readback authority' tests/unit/core/provider-readonly.test.ts
```

Result: 1 test failed as expected; a provider PASS incorrectly accepted a UAT-authority readback before the authority check was added.

Hostile-input RED command:

```text
node --experimental-strip-types --test --test-name-pattern='cyclic, unsupported, and hostile' tests/unit/core/provider-readonly.test.ts
```

Result: 1 test failed as expected; a throwing proxy escaped the validator instead of failing closed.

## GREEN and verification evidence

- `node --experimental-strip-types --test tests/unit/core/provider-readonly.test.ts tests/integration/provider-readonly-boundary.test.ts` — 14 passed, 0 failed.
- `node --experimental-strip-types --test --test-name-pattern='accepts a structurally different positive-control topology' tests/unit/core/provider-readonly.test.ts` — 1 passed, 0 failed.
- `node --experimental-strip-types --test --test-name-pattern='rejects mutation capabilities|ambiguous connection references|requires authoritative readback|requires the readback authority' tests/unit/core/provider-readonly.test.ts` — 4 passed, 0 failed.
- `npm run build` — exit 0.
- `npm test` — 288 passed, 0 failed.
- `npm run check` — exit 0; 401 tests passed, all 19 portable-check gates passed, and `npm audit` found 0 vulnerabilities.
- `git diff --check` — clean before the implementation commit.
- Package export smoke check importing `@spflow/core/provider-readonly` — PASS.
- Corrected privacy scan over `contracts/provider-readonly.schema.json` and `fixtures/provider-readonly/synthetic-readback.json` — PASS, 0 forbidden matches for URLs, email addresses, UUID-like tenant IDs, bearer/token/credential markers, and raw payload markers.

## Contract decisions

- The adapter is explicitly `read-only`, `offline`, and `tenantMutation: false`.
- Read operations are metadata-only. `import`, `rebind`, `publish`, `enable`, `trigger`, `update`, and `delete` remain explicitly forbidden capabilities.
- Environment, solution, flow, and connection-reference records must carry the same non-secret `identityCorrelation`.
- Connection references require `state: resolved` and `matchCount: 1`; unknown keys and unresolved/ambiguous references fail closed.
- `PROVIDER` and `UAT` `PASS` claims require an identity-correlated authoritative readback with matching authority and observed metadata fields.
- `LOCAL_SYNTHETIC` evidence is separate and cannot mint provider PASS. The checked-in fixture intentionally leaves provider and UAT `NOT_VERIFIED`.
- The validator performs no SDK import, network request, browser automation, tenant API call, import, rebind, publish, enablement, trigger, update, or delete. It does not mutate its input and returns stable lexically sorted diagnostics.
- Plain JSON shape, finite values, cyclic values, accessors/proxies, secret-like strings, URLs, emails, UUID-like identifiers, and secret/raw-payload fields are rejected or fail closed.

## Limitations and explicit no-tenant statement

This is a provider-ready contract and validator, not a live provider connector. It does not authenticate, discover, read, import, rebind, enable, publish, trigger, update, delete, execute, or perform UAT against any Power Automate or Dataverse tenant. The fixture is synthetic and does not establish provider availability, authenticated connection validity, runtime execution, publication, mutation, email delivery, or UAT success. Those remain future external gates.

Handoff path: `.superpowers/sdd/2026-08-20-flow-engineering-tool-mvp-plan/task-3-report.md`.

## Fix round 1: independent review findings

Review base: `2662996012e34a2f3849312498268ec8cd76eea5`. All three Important findings from `task-3-review.md` were reproduced locally and fixed. Implementation commit: `ebd303f83459ccaa581f630e14c366c6eee334f4` (`fix: close provider snapshot review gaps`). The integration boundary test and package export were preserved; the implementation fix changed only the schema, core validator, and unit regressions listed below.

### RED evidence

Focused review-regression command:

```text
node --experimental-strip-types --test --test-name-pattern='compound or camel-case|property access fails after JSON safety|mismatched reciprocal' tests/unit/core/provider-readonly.test.ts
```

Result against the pre-fix implementation: 3 tests failed for the intended reasons — `readwrite` was accepted, the schema-version-throwing proxy escaped with an exception, and mismatched reciprocal memberships were accepted.

### GREEN evidence

- `node --experimental-strip-types --test --test-name-pattern='compound or camel-case|property access fails after JSON safety|mismatched reciprocal' tests/unit/core/provider-readonly.test.ts` — 3 passed, 0 failed.
- `node --experimental-strip-types --test tests/unit/core/provider-readonly.test.ts tests/integration/provider-readonly-boundary.test.ts` — 17 passed, 0 failed.
- `node --experimental-strip-types --test --test-name-pattern='accepts a structurally different positive-control topology' tests/unit/core/provider-readonly.test.ts` — 1 passed, 0 failed.
- `node --experimental-strip-types --test --test-name-pattern='rejects mutation capabilities|compound or camel-case|property access fails after JSON safety|mismatched reciprocal' tests/unit/core/provider-readonly.test.ts` — 4 passed, 0 failed.
- `npm run build` — exit 0.
- `npm test` — 288 passed, 0 failed.
- `npm_config_offline=true npm run check` — exit 0; 404 tests passed, all 19 portable-check gates passed, and npm audit found 0 vulnerabilities.
- Package export smoke check importing `@spflow/core/provider-readonly` — PASS.
- Privacy scan over `contracts/provider-readonly.schema.json` and `fixtures/provider-readonly/synthetic-readback.json` — PASS, 0 forbidden URL, email, UUID/GUID-like, token/credential, tenant-ID, or raw-payload matches.
- `git diff --check` — clean before implementation commit.

### Changed files and fixes

- `contracts/provider-readonly.schema.json` — operation capabilities now use the exact four-operation read-only enum; compound/camel-case mutation names cannot satisfy the schema.
- `packages/core/src/provider-readonly.ts` — runtime operation validation uses the same exact allowlist; validation/schema/semantic/privacy traversal is enclosed by a deterministic fail-closed exception boundary; flow/reference membership is checked in both directions.
- `tests/unit/core/provider-readonly.test.ts` — exact `readwrite`, `getorcreate`, and `listanddelete` mutations; schema/semantic property-get proxy failures; and reciprocal association mutation coverage, with valid read-only and reciprocal controls retained.

### Regression memory and limitations

Incident ID: `FAIL-20260820-provider-readonly-review-gaps`. Status: `RESOLVED` by the RED/GREEN tests above. Prevention rule: retain the exact operation enum, hostile-access guard, and reciprocal-association tests in the permanent provider-readonly suite. No prior matching project incident record was found by the regression-memory search; this handoff is the durable sanitized record for this fix round.

The adapter remains a provider-ready offline contract, not a live provider connector. No SDK, network, browser, Power Automate, Dataverse, tenant, import, rebind, publish, enable, trigger, update, delete, execution, provider readback, or UAT operation was attempted. No coordinator ledger was edited, no agents were spawned or coordinated, and no push was performed. GitHub Actions cross-platform results remain outside this worker’s local evidence.
