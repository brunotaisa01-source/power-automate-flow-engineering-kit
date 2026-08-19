# WP-16 Remediation Record

## Fix

The public frontend now has separate `saveItemUrl`, `odataListUrl`, and
`paginationCollectionUrl` helpers. They all use the contract-derived origin,
site path, and list path, then enforce their operation-specific pathname shape.
Raw and encoded traversal/separator markers are rejected before URL parsing.
The trusted AST recognizer mirrors the same fixed helper order and exact
conditions. The synthetic frontend manifest was updated from the real file.

## Local Evidence

- Runtime: Node `v22.23.1`; build: PASS.
- Focused raw-artifact suite: `54/54` subtests passed after the fix.
- Focused plus unit/integration command: `92/92` tests passed.
- Full repository suite: `316/316` tests passed across `21` suites.
- README contract, global rules, required-only rules, and artifact commands:
  PASS with exit `0`.
- README offline verify: exit `8`, with `CLI_VALIDATOR_NOT_RUN` for the
  unavailable public-data scanner and explicit tenant/live/publication
  `NOT_RUN` gates; this is not a PASS.
- `git diff --check`: PASS.
- `npm audit --audit-level=low`: PASS; `0` vulnerabilities.
- Official history-aware `scan public-data . --history --format json`: attempted,
  scanner exit `8`, `CLI_VALIDATOR_NOT_RUN`; status is `NOT_RUN`, never PASS.
- Supplemental tracked-text and extension scan: no company markers, credentials,
  unexpected private data, or denied binary extensions. The path/email/GUID hits
  are documented synthetic negative fixtures, and the only ZIP is the declared
  synthetic example artifact. This supplemental check does not replace the
  unavailable official scanner or history evidence.

## Independent Review

A fresh independent Luna max review returned `APPROVED` with no P0, P1, P2,
or P3 findings. The reviewer checked the operation-specific grammars, contract
binding, traversal defenses, no-fetch rejection behavior, static authority
recognizer, manifest binding, tests, and claim boundaries.

## Claim Boundary

This record proves only local repository behavior against synthetic fixtures.
It does not prove SharePoint import, Power Automate execution, tenant
permissions, live-smoke behavior, mutation effect, GitHub publication, or
production readiness.
