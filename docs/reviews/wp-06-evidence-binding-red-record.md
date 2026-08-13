# WP-06 Evidence Binding Remediation RED Record

## Baseline

- Commit: `da654e4b319c8d9fe4440d3d08f92d40eb4e1c75`.
- Working tree before tests: clean.
- Evidence class: local runtime test evidence.
- Network and tenant operations: not used.

## RED Command

```text
node --experimental-strip-types --test tests/rules/wp-06-remediation-adversarial.test.ts
```

## RED Result

- Exit code: `1`.
- Tests: `6`.
- Passed: `0`.
- Failed: `6`.
- Failure mode: each adversarial graph was accepted and returned no rule diagnostic where the test required the affected rule ID.

The RED proves the baseline does not reject:

- missing, circular, or altered source and contract bindings;
- wrong evidence or bound-source artifact kinds;
- mixed section ownership or duplicate traversals;
- HTTP 500 classified as `CREATE_MISSING`;
- undeclared list, field, operation, command, or index-plan evidence;
- duplicate allowlist values silently collapsed as sets.

## Claim Boundary

This record proves only that the focused local tests detect the reviewed false-GREEN behaviors. It does not prove package import, connection rebinding, enablement, execution, tenant mutation, effective permissions, semantic readback, or publication.
