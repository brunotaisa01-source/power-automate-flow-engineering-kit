# WP-06 Semantic Hardening RED Record

## Baseline

- Commit: `14dc33857583d84254a89b3f914b8db5cfcd9bf4`
- Production files modified before RED: none
- Private reference projects accessed: no

## Command

```text
node --experimental-strip-types --test tests/rules/wp-06-remediation-adversarial.test.ts
```

## Result

- Exit code: `1`
- Tests: `11`
- Passed controls: `6`
- Failed adversarial tests: `5`

The five failures were the expected missing behaviors:

1. Unrelated source content and absent graph relations did not prevent PASS.
2. A changed contract node byte length did not prevent PASS.
3. Unknown nested save-transaction and request claims did not prevent PASS.
4. Duplicate index `currentFields` and duplicate schema field uses did not
   prevent PASS.
5. HTTP `204` classified as `FOUND` without body proof and fractional status
   `400.5` did not prevent PASS.

Each failure returned no rule diagnostic where the test required the relevant
WP-06 rule ID. This is a behavioral RED, not an environment or test-loader
error.

## Supplemental RED

A focused follow-up proved that `fieldCompatibility.actual` accepted a
contract-undeclared but globally recognized field property:

```text
node --experimental-strip-types --test --test-name-pattern "field compatibility actual body" tests/rules/wp-06-remediation-adversarial.test.ts
```

- Exit code: `1`
- Tests: `1`
- Passed: `0`
- Failed: `1`

The detector returned no `SP-SCHEMA-003` diagnostic before exact property-set
validation was added.
