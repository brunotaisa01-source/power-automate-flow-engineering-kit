# WP-06 Wave 2 READY Record

## State

- State: `READY_FOR_COORDINATOR_REVIEW`
- Work package: WP-06 Wave 2 SharePoint and application rules
- Base commit: `3d2e917653674c03e924280747343cdc810910e5`
- Runtime: Node.js `v22.23.1`, npm `10.9.4`
- Evidence class: `LOCAL_STATIC` and synthetic `LOCAL_RUNTIME`
- Network mode: offline
- Publication: not performed

## Changed-File Inventory

- Core normalized evidence: `packages/core/src/types/wp06-evidence.ts`, `packages/core/src/graph-builders/wp06-evidence.ts`, and the existing builder/frontend exports and entry points.
- Rule implementation: application Save/pagination, HTTP semantic classification, SharePoint authorization/ACL/OData/schema/index detectors, shared WP-06 evidence selection, and registry wiring.
- Rule contracts: one catalog plus RED, GREEN, independent positive control, expected diagnostic, and structural mutation for each of the 14 stable IDs.
- Tests: focused rule corpus, normalized-builder unit coverage, built-CLI integration coverage, and the Wave-1 registry retention assertion.
- Records: RED evidence, rule-indexed remediation, and this READY record.

No package adapter, Wave-1 production detector, CLI route, or unrelated documentation file was modified.

## RED Evidence

```text
node.exe --experimental-strip-types --test --test-name-pattern="WP-06 Wave 2 RED contracts" tests/rules/wp-06-wave2-rules.test.ts
```

- Exit code: `1`
- Result: 14 tests failed because all 14 detectors were not registered.
- Evidence was captured before production detector implementation in `docs/reviews/wp-06-wave2-red-record.md`.

## GREEN and REFACTOR Evidence

```text
npm run build
```

- Exit code: `0`
- Core, package adapters, rules, and CLI compiled under Node 22.

```text
node.exe --experimental-strip-types --test tests/unit/core/wp06-evidence.test.ts tests/rules/wp-06-wave2-rules.test.ts tests/integration/wp-06-built-cli.test.ts
```

- Exit code: `0`
- Tests: 35 passed, 0 failed.
- Coverage includes exact RED diagnostics, GREEN, independent controls, structural mutations, catalog schema and registry completeness, decoy resistance, field/index/operation reorder stability, normalized builders, and shipped built-CLI GREEN plus RED behavior.

```text
node.exe --experimental-strip-types --test --test-name-pattern="authorization evidence binds" tests/rules/wp-06-wave2-rules.test.ts
```

- Pre-fix exit code: `1`; alternate capability/list binding was not rejected.
- Post-fix exit code: `0`; exact capability and scope fields are bound to the contract.

```text
npm test
```

- First full run: exit `1`, 225 passed and 1 failed because the Wave-1 registry test excluded later rule IDs.
- Resolution: retain the test as a Wave-1-presence assertion without requiring the registry to contain only Wave 1.
- Final full run: exit `0`, 227 passed, 0 failed, 18 suites.

```text
git diff --check
```

- Exit code: `0`.
- A separate read-only check of untracked files found no trailing whitespace or missing final LF.

## Built CLI and Public Scan

The built-CLI integration test generated a schema-valid temporary synthetic project requiring all 14 rules. Direct `validate rules` execution returned PASS for complete normalized evidence, then returned only `SP-AUTHZ-001` after a structural client-authority mutation. Output did not echo the mutated value.

```text
node.exe packages/cli/dist/bin/spflow.js scan public-data . --format json
```

- Process result: non-success.
- Normalized CLI report: `exitCode: 8`, `result: FAIL`, `notRun: 1`.
- Residual gate: `public-data-scanner`.
- Status: `NOT_RUN`; no PASS is claimed.

A bounded read-only marker scan over changed files found no private project path, user path, non-example URL, or GUID-like value. This is a local supplemental check and is not promoted to the unavailable public-data scanner.

A source-only capability scan covered the 11 new WP-06 production source files and found no network or process-launch API imports/calls. Exit code: `0`.

## Sanitized Findings

- Index operation arrays initially depended on enumeration order. The detector now sorts by explicit sequence and rejects non-contiguous sequence values.
- The authorization audit added exact access-list, capability-field, and scope-field contract bindings after a focused counterexample exposed the omission.
- The final schema audit expanded `SP-SCHEMA-003` compatibility to compare logical name and all contract classification flags as well as platform field properties.
- The existing Wave-1 registry test initially required an exact registry equal to Wave 1. It now proves all Wave-1 detectors remain registered while permitting Wave 2.
- Diagnostics use fixed repository-relative paths and messages and do not emit evidence values, node IDs, labels, or environment data.

## Residual Gates

Not run and not claimed: tenant discovery, Preflight, Apply, Readback, import, rebind, enablement, execution, mutation, effective-permission probes, separate-user tests, semantic tenant effects, publication, and the unavailable public-data scanner.

The coordinator must inspect and commit the work. No commit or publication was performed by this worker.
