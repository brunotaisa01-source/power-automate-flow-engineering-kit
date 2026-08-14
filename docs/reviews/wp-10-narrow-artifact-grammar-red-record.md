# WP-10 Narrow Artifact Grammar RED Record

## Baseline

- Commit: `47c544262f4fab45b9c18cc610908c8ae606ab0a`
- Runtime: Node.js `22.23.1`
- Private source projects: not accessed
- Tenant, network, and publication operations: not run

## RED Command

```powershell
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts
```

## Result

The initial run passed `22/28` tests and failed `6/28` subtests for the intended
authority gaps:

1. A locally shadowed `globalThis`, an unreachable conflict throw, and malformed source still emitted frontend derivations.
2. The new executable index APPLY fixture was rejected because the adapter had no approved-digest assertion grammar.
3. The compiled fourteen-rule CLI path failed the same two index rules.
4. A field create payload missing required and maximum-length properties still emitted schema evidence.
5. The compatible zero-write index fixture was rejected by the old result grammar.
6. A contract declaring inherited permissions passed while the definition executed break-clear.

The failures were behavioral assertions against synthetic raw files, normalized
definitions, native ZIP bytes, and exact manifests. They were not parser errors
in the tests, environment failures, or latency classifications.
