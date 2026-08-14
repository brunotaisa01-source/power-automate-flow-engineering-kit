# WP-12 Native Readback And Mutation Controls RED Record

## Baseline

- Commit: `f9539c15f4b45fc212a6e42806442e43a37b01cc`
- Runtime: Node.js `22.23.1`
- Private source projects: not accessed
- Tenant, network, and publication operations: not run

## RED Command

```powershell
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts tests/rules/adapter-boundary-remediation.test.ts
```

## Result

The initial focused run passed `65/74` tests and failed `9/74` for the intended
missing behavior. The failures covered the unsupported hardened frontend
grammar, missing native builder derivations and compiled all-fourteen-rule
evidence, missing Choice/Lookup/DateTime native schema authority, missing
compatible index authority, and the false rejection of a valid HTTP GET by
`PA-CONNECTOR-001`.

The run also preserved positive controls: runtime synthetic pagination rejected
a sibling site prefix before fetch; Save rejected a wrong readback body and a
non-2xx readback before parsing; legacy prefix and unchecked-readback source
did not create authority; malformed and bypass artifacts remained fail closed.
The REDs were behavioral failures, not parser, collection, timeout, private
source, or external-system failures.

## Supplemental RED Cycles

Two focused pagination probes initially failed `0/2`: an empty initial URL and
an empty continuation value were accepted instead of failing closed. One
focused connector probe initially failed `0/1`: a dynamic HTTP `POST` without
mutation controls was not rejected. A final focused connector probe failed
`0/1` because non-read HTTP methods such as `PUT` could pass without mutation
controls. These probes were added before their corresponding implementation
changes and remain in the permanent regression suite.
