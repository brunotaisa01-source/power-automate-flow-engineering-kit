# WP-11 Fail-Closed Artifact Authority RED Record

## Baseline

- Commit: `da422100f320bd0019adabf8136a42d94c5cc0aa`
- Runtime: Node.js `22.23.1`
- Private source projects: not accessed
- Tenant, network, and publication operations: not run

## RED Command

```powershell
npm run build
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts
```

## Result

The build passed. The initial focused run passed `26/32` tests and failed
`6/32` subtests for the intended authority gaps:

1. The new semantic Save and parameterized OData positive source was not recognized by the WP-10 grammar.
2. The approved parameterized OData control therefore had no evidence.
3. Ambiguous-source cardinality lost its expected derivations because the new frontend shape was not recognized.
4. The compiled fourteen-rule CLI path failed its three frontend rules for the same reason.
5. A complete Choice/Lookup type-specific positive fixture did not produce field authority.
6. A top-level index bypass write still allowed the compiled CLI to return PASS.

The existing non-semantic Save mutation already failed closed. The new REDs
were behavioral assertions against synthetic source, normalized definitions,
native ZIP bytes, exact manifests, and the real built CLI process. They were
not test syntax failures, environment failures, or latency classifications.
