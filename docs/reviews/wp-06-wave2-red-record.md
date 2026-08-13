# WP-06 Wave 2 RED Record

## Scope

- Work package: WP-06 Wave 2 SharePoint and application rules
- Rule count: 14
- Evidence class: `LOCAL_STATIC`
- Network mode: offline
- Source data: public synthetic fixtures only

## RED Command

```text
node.exe --experimental-strip-types --test --test-name-pattern="WP-06 Wave 2 RED contracts" tests/rules/wp-06-wave2-rules.test.ts
```

- Runtime: Node.js `v22.23.1`
- Exit code: `1`
- Tests: 14
- Passed: 0
- Failed: 14
- Expected failure reason: every stable Wave-2 rule catalog and canonical RED fixture existed, but its detector was not registered.

## Boundary

This record proves only that the focused tests were capable of failing before production detector implementation. It does not prove detector correctness, package behavior, tenant import, rebind, enablement, execution, mutation, semantic readback, effective permissions, schema state, index state, or publication.

The public-data scanner was not executed during this RED command and remains `NOT_RUN` for this checkpoint.
