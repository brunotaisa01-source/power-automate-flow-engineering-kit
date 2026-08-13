# WP-07 Semantic Authority RED Record

## Baseline

- Commit: `bf42ebaa9215f8b6bf8dadf2ce566debbca5c293`
- Worktree before test edits: clean
- Runtime: Node.js `22.23.1`, npm `10.9.4`
- Private source projects: not accessed
- Network and tenant operations: not run

## Command

```powershell
npm run build
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts tests/unit/cli/commands.test.ts tests/unit/package-adapters/public-trust-boundary.test.ts
```

## Result

- Build: PASS
- Test exit code: `1`
- Tests: `15`
- Passed: `10`
- Failed: `5`

The five intended failures reproduced the independent release blockers:

1. Unreachable frontend statements still emitted all three frontend derivations.
2. The builder emitted four sections from no-op URIs plus inert contract tokens.
3. The real adapter path emitted only four of six builder sections.
4. Caller-controlled trusted graph and derivation modules remained public package exports.
5. Offline verification did not emit `HTTP_SEMANTIC_001_LIVE_SMOKE_NOT_RUN`.

No production file was changed before this RED run. The exact probes remain in
the focused test files and are supplemented by a fabricated/rebound
`adapterEvidence` regression test.

An additional contract-shape regression was added during implementation. A
schema-valid contract with no index operations initially suppressed all six
builder derivations instead of only the non-applicable `indexPlans` section.
The focused suite reproduced that behavior as `10/11` PASS before the adapter
was changed to distinguish a valid empty index plan from invalid index input.
