# WP-06 Executable Adapters RED Record

## Scope

This record captures the required failing tests before production remediation. The baseline was exact commit `c423a93d737384c45975aefc636a9ef4b6e53eff`; only this plan, adversarial fixture, test additions, and this RED record had been added.

## Command

```text
node --experimental-strip-types --test tests/rules/wp-06-remediation-adversarial.test.ts
```

## Result

- Exit code: `1`
- Tests: `19`
- Passed: `15`
- Failed: `4`

The four expected failures proved that the baseline still allowed:

1. A hand-authored source projection whose facts copied the evidence.
2. An input document to declare a trusted-looking adapter identity.
3. `SP-AUTHZ-001` to pass without its required generated definition or ZIP.
4. `HTTP-SEMANTIC-001` to accept `FOUND` using only parsed/schema-valid boolean flags.

Each failure returned no diagnostic where the test required the corresponding rule ID. No production code was changed before this RED run.

## Supplemental RED

A later self-review isolated a second final-artifact trust gap before changing the
package gate:

```text
node --experimental-strip-types --test --test-name-pattern="required ZIP and manifest nodes reject arbitrary content" tests/rules/wp-06-remediation-adversarial.test.ts
```

- Exit code: `1`
- Tests selected: `1`
- Passed: `0`
- Failed: `1`
- Incorrectly accepted artifact kinds: `zip`, `manifest`

This RED proved that connected package and manifest nodes were accepted without
parsing their content or binding the manifest to the ZIP digest and byte length.

## Safe-Adapter Positive-Control RED

Before the final commit, a positive control for real solution inspection found
that the package gate incorrectly compared an external definition path with the
solution ZIP's internal inventory namespace:

```text
node --experimental-strip-types --test --test-name-pattern="exact safe-adapter package inspection satisfies the ZIP content gate" tests/rules/wp-06-remediation-adversarial.test.ts
```

- Exit code: `1`
- Tests selected: `1`
- Passed: `0`
- Failed: `1`

The correction retained exact package path, SHA-256, byte length, flow IDs, and
adapter inventory equality while removing only the invalid cross-namespace path
comparison. The same focused control then passed `1/1`.
