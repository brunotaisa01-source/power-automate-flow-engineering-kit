# WP-09 Fail-Closed Executable Authority RED Record

## Baseline

- Commit: `f3b5fde20e334c3262f550c60063a1c7bc8ffd0b`
- Runtime: Node.js `22.23.1`
- Private source projects: not accessed
- Tenant, network, and publication operations: not run

## Initial RED

```powershell
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts tests/unit/cli/commands.test.ts
```

Result: `23/28` passed and `5/28` failed. The intended failures reproduced:

1. A shadowed no-op `fetch` and unreachable loop behavior still emitted frontend facts.
2. GET-then-POST schema actions without response branches or post-write readback emitted field facts.
3. A required-only index read with no removal support emitted index facts.
4. Authorization emitted Owner and Amount authority without reading those fields.
5. Verification emitted only one hard-coded `LIVE_SMOKE NOT_RUN` gate.

## Index Grammar RED

After replacing the synthetic fixture with complete APPLY and NO_OP shapes, the
focused index run passed `2/4` tests. The old adapter emitted neither the new
APPLY plan nor the compatible zero-write NO_OP plan. Both failures were caused
by missing production behavior, not test syntax or environment latency.

All artifacts and values in these tests are synthetic and public-safe.

## Additional Branch-Closure RED

An additional independent review of the implementation found that an
unlabelled POST could be inserted beside the recognized schema or index
actions. The permanent regression initially passed `0/1`: the adapter still
emitted the affected section. Production was then changed to require exact
direct child action sets for every trusted positive branch.
