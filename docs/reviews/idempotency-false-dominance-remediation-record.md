# Idempotency False-Dominance Remediation Record

**Status:** ready for review on local evidence only

## Scope

This remediation closes a fail-open path in the idempotency predicate flattener. A statically false enclosing predicate no longer contributes usable non-empty-key or zero, one, or many cardinality leaves. A statically true predicate contributes no leaves, and a statically unknown disjunction remains fail-closed.

The change is limited to the existing static-expression evaluation and structural predicate path. It does not use labels or fixture metadata as proof, and it preserves the existing deterministic `FLOW-IDEMPOTENCY-001` diagnostic.

## RED Evidence

Before the production change, this focused Node 22 command exited `1`:

```text
npx --yes node@22.22.0 --experimental-strip-types --test --test-name-pattern="FLOW-IDEMPOTENCY-001 (rejects (non-empty key behind a dominating statically false conjunct|zero cardinality behind a dominating false conjunct|one cardinality behind a dominating false conjunct|many cardinality behind a dominating false conjunct)|accepts (key fields in statically selected runtime branches|runtime predicates with neutral true conjuncts))" tests/rules/adapter-boundary-remediation.test.ts
```

The result was `6` selected tests: `2` positive controls passed and `4` counterexamples failed. Each failure showed that the detector returned no diagnostic for a false-dominated predicate that still contained a valid-looking guard or cardinality leaf.

## GREEN Evidence

After the production change:

- The identical focused command exited `0`; `6/6` passed.
- All focused `FLOW-IDEMPOTENCY-001` adapter-boundary tests exited `0`; `13/13` passed.
- The statically unknown disjunction control remained fail-closed.
- The statically selected runtime-branch and neutral-true-conjunct controls remained GREEN.
- The direct built-CLI counterexample exited `0`; `1/1` passed and observed only `FLOW-IDEMPOTENCY-001`.

The focused and built-CLI commands were:

```text
npx --yes node@22.22.0 --experimental-strip-types --test --test-name-pattern="FLOW-IDEMPOTENCY-001" tests/rules/adapter-boundary-remediation.test.ts
npx --yes node@22.22.0 --experimental-strip-types --test --test-name-pattern="idempotency false-dominance: built validation rejects a statically false non-empty guard" tests/integration/shipped-validation.test.ts
```

The root build and full suite used Node `v22.22.0` and npm `10.9.4`. The build exited `0` for the root references, package adapters, rules, and CLI. The full suite exited `0` with `192` passed across `15` suites and `0` failed, cancelled, skipped, or todo.

```powershell
$node22 = (npx --yes --package=node@22.22.0 --package=npm@10.9.4 node -p "process.execPath").Trim()
$nodeModules = Split-Path (Split-Path (Split-Path $node22 -Parent) -Parent) -Parent
$npmCli = Join-Path $nodeModules 'npm/bin/npm-cli.js'
$env:PATH = "$(Split-Path $node22 -Parent);$env:PATH"
& $node22 $npmCli run build
& $node22 $npmCli test
```

`git diff --check` exited `0` on the final scoped working tree.

## Evidence Boundary

This record covers local source inspection, local compilation, local automated tests, and temporary synthetic built-CLI inputs only. No external environment access, import, enablement, execution, mutation, readback, deployment, or publication was performed. External-environment and publication evidence gates remain `NOT_RUN` and require separate authorization.
