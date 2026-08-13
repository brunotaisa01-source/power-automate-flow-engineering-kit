# WP-08 Executable Semantics RED Record

## Baseline

- Commit: `01dcca29064cf4c4d7fd2b1aa73f9e9f046943b7`
- Tree: `893fccc71e18d2a9ee08cef7a72847d2e65eb2f1`
- Runtime: Node.js `22.23.1`
- Private projects and external systems: not accessed

## Initial RED

```powershell
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts
```

Result: `11/16` passed and `5/16` failed for the intended reasons:

1. An unconditional `if (true) return` still authorized all frontend sections.
2. Canonical endpoint text hidden inside `/_api/noop?claimed=...` authorized all
   six builder sections.
3. Permission claims without an executable grant assignment authorized ACL
   evidence.
4. A tautological HTTP condition authorized static classifications.
5. Index values supplied only through action parameters authorized an index
   plan.

## Compiled CLI RED

The first real CLI-process test showed that the existing `validate rules`
command validates the full registry. Adding the intended bounded
`--required-only` option initially returned `CLI_ARGUMENT_INVALID`, exit code
`2`. This preserved the global default and provided the RED for an explicit
contract-required rule scope.
