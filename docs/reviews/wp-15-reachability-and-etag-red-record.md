# WP-15 RED Record

## Baseline

- Baseline commit: 8066393bf66bc880d3d490c25e4de8174bb23f09
- Scope: synthetic public repository only
- External systems: not accessed

## Intended Failures

The RED test run used Node 22.23.1 and the WP-15 test-name filter:

`text
node --experimental-strip-types --test --test-name-pattern=WP15 tests/rules/wp-06-raw-artifact-authority.test.ts
`

Result: 1/4 passed and 3/4 failed as intended.

- A full valid builder flow wrapped in @equals(1,0) still emitted trusted
  builder evidence and the compiled CLI did not fail closed.
- A nested deterministic false branch still emitted trusted builder evidence.
- The reachable builder positive control passed.
- A quoted newline ETag reached etag-mismatch after a request instead of
  being rejected as invalid-etag before the request.

These failures established that the tests exercised the missing behavior and
were not false positives caused by test setup.
