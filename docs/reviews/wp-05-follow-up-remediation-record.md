# WP-05 Follow-up Remediation Record

**Status:** ready for coordinator review on local evidence only

## Scope

This remediation addresses three independent-review blockers in the synthetic repository:

1. Idempotency and destructive controls now require path-sensitive value influence. References confined to statically unselected branches, dominated boolean branches, or equal-operand tautologies do not establish runtime dataflow.
2. The WDL parser now uses a closed supported-function catalog with explicit minimum and maximum arity. Unknown names and invalid argument counts produce the existing deterministic `PA-WDL-001` parse error without echoing expression content.
3. Offline `verify` runs local validation before the public-data gate. The deferred scanner remains an explicit exit `8` local `NOT_RUN`; tenant and publication gates remain separate informational `NOT_RUN` entries.

## TDD Evidence

Focused RED commands exited `1` before production changes:

```text
node --experimental-strip-types --test --test-name-pattern="statically irrelevant branches|dominating false conjunct|statically unselected digest branch" tests/rules/adapter-boundary-remediation.test.ts
node --experimental-strip-types --test --test-name-pattern="unknown WDL functions|established supported WDL subset" tests/artifacts/action-graph.test.ts
node --experimental-strip-types --test --test-name-pattern="fixed offline order|unavailable public-data validation" tests/unit/cli/commands.test.ts
node --experimental-strip-types --test --test-name-pattern="built validate rules, validate artifact, and verify execute real offline checks" tests/integration/shipped-validation.test.ts
node --experimental-strip-types --test --test-name-pattern="tautological comparisons|tautological digest comparison" tests/rules/adapter-boundary-remediation.test.ts
```

Observed RED behavior was bounded to the intended defects: missing rule diagnostics, accepted unknown/invalid-arity WDL, omitted scanner execution, lost scanner `NOT_RUN`, and a built `verify` PASS while the scanner was unavailable.

Focused GREEN and independent controls passed after implementation:

```text
node --experimental-strip-types --test --test-name-pattern="statically irrelevant branches|dominating false conjunct|statically unselected digest branch|accepts structurally derived key|accepts structurally derived bounded" tests/rules/adapter-boundary-remediation.test.ts
node --experimental-strip-types --test --test-name-pattern="unknown WDL functions|established supported WDL subset|parses WDL references" tests/artifacts/action-graph.test.ts
node --experimental-strip-types --test --test-name-pattern="fixed offline order|unavailable public-data validation" tests/unit/cli/commands.test.ts
node --experimental-strip-types --test --test-name-pattern="WP-05 follow-up: built validation rejects" tests/integration/shipped-validation.test.ts
npm run build
npm test
```

Final root results:

- Build: exit `0` for core references, package adapters, rules, and CLI.
- Full test suite: exit `0`; `185` passed, `0` failed.
- Shipped built-CLI follow-up matrix: key, destructive, WDL, and verify cases passed.
- Direct built scanner invocation: report exit `8`, result `FAIL`, `notRun` count `1`, and `CLI_VALIDATOR_NOT_RUN`.
- Mutation controls: equal-operand ordering expressions fail closed.
- Positive controls: statically selected runtime branches remain valid and are structurally distinct from the negative cases.

## Evidence Boundary

This record is local build, local runtime test, and synthetic package-artifact evidence only. No network request, tenant operation, import, rebind, enablement, run, mutation, tenant readback, or publication was performed.

The public-data scanner engine remains unavailable. Offline `verify` therefore returns exit `8` and records the scanner as `NOT_RUN`; it does not claim scanner success. Tenant and publication residual gates remain open for separately authorized evidence.
