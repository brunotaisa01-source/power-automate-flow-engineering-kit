# WP-06 Evidence Binding Remediation Record

## Decision

`READY_FOR_INDEPENDENT_REVIEW`

This is a local remediation result. It is not an independent acceptance decision and does not establish package or tenant claims.

## Scope

- Added non-self-referential WP-06 evidence binding to an exact source artifact and exact project contract artifact.
- Enforced evidence node kind, bound source kind, path, SHA-256, byte length, revision, and one-section ownership.
- Closed fail-open cardinality for commands, lists, fields, permission operations, index plans, requests, traversals, and duplicate string or HTTP evidence.
- Made HTTP classification fail closed for 2xx, 400, 404, authentication, authorization, throttling, and server-status cases.
- Migrated all WP-06 canonical RED, GREEN, and positive-control graphs to split bound evidence.
- Preserved Wave-1 implementation behavior.

## TDD Evidence

### Initial RED

```text
node --experimental-strip-types --test tests/rules/wp-06-remediation-adversarial.test.ts
```

- Exit code: `1`.
- Result: `0/6` passed, `6/6` failed.
- Expected reason: the baseline returned no affected rule diagnostic for binding, kind, ownership, unsupported HTTP, undeclared evidence, or duplicate-value attacks.

### Focused RED Extensions

- Duplicate HTTP classification: `5/6` passed, one expected failure because the duplicate was accepted.
- Unknown binding/envelope claim keys: `5/6` passed, one expected failure because an undeclared key was accepted.

### Focused GREEN

```text
node --experimental-strip-types --test tests/rules/wp-06-wave2-rules.test.ts tests/rules/wp-06-remediation-adversarial.test.ts
```

- Exit code: `0`.
- Tests: `38/38` passed.
- Coverage: catalogs, canonical RED/GREEN, independent positive controls, structural mutations, binding attacks, kind mismatch, unsupported HTTP, exact ownership, duplicate values, graph ordering, and decoy labels on source nodes.

### Build

```text
npm run build
```

- Exit code: `0`.
- Core, package adapters, rules, and CLI compiled successfully.

### Built Integration

```text
node --experimental-strip-types --test tests/integration/wp-06-built-cli.test.ts
```

- Exit code: `0`.
- Tests: `2/2` passed.
- The built CLI validated split frontend evidence bound to exact source and contract bytes.
- The compiled rule registry validated all 14 WP-06 rules and rejected an authority mutation.

### Full Local Suite

```text
npm test
```

- Exit code: `0`.
- Suites: `19/19` passed.
- Tests: `234/234` passed.

## Public-Data Gate

```text
node packages/cli/dist/bin/spflow.js scan public-data . --format json
```

- CLI report exit code: `8`.
- Result: `FAIL` with `notRun: 1`.
- Residual gate: `public-data-scanner`.
- Classification: `NOT_RUN`, not a validation RED and not a PASS.

An auxiliary local pattern scan over versionable files found no company marker, user marker, local absolute user path, synchronized-folder marker, or tenant URL. It found only pre-existing public synthetic rejection vectors and documented reserved examples. This auxiliary scan does not replace the official scanner.

## External Gates

The following remain `NOT_RUN`:

- final package generation and ZIP inspection for this remediation;
- tenant import;
- connection rebinding;
- enablement;
- authenticated execution;
- controlled tenant mutation;
- effective-permission readback;
- semantic live readback;
- publication.

No local result in this record may be promoted to any of those claim classes.
