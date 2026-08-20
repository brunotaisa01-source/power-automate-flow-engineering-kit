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
