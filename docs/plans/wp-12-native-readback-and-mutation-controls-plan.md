# WP-12 Native Readback And Mutation Controls Plan

## Objective

Close the independent blockers at baseline
`f9539c15f4b45fc212a6e42806442e43a37b01cc` using only public-safe synthetic
artifacts. The adapters must authorize only executable behavior bound to native
SharePoint response shapes and exact mutation controls.

## Sequence

1. Preserve sibling-prefix pagination and failed Save readback cases as RED regressions.
2. Require exact path-segment boundaries, explicit continuation types, and fail-closed URL parsing.
3. Require successful Save readback status before JSON parsing and exact field/value comparison before return.
4. Separate contract metadata from native SharePoint field properties, resolve Lookup list IDs through an executable GET, and compare exact native readbacks.
5. Bind permission grant evidence to one assignment object and validate effective permissions through native `High`/`Low` masks.
6. Require field pre-read ETags plus exact `POST`, `MERGE`, `IF-MATCH`, digest, and readback controls for index updates.
7. Make the general connector rule method-aware so valid GET reads are not classified as mutations.
8. Preserve all-fourteen-rule compiled CLI coverage, dynamic `LIVE_SMOKE NOT_RUN` gates, exact ZIP/manifest/lineage binding, and public-data boundaries.
9. Run Node 22 build, focused tests, full tests, diff check, dependency audit, official scanner attempt, and supplemental public-safety checks.

## Claim Boundary

WP-12 can establish local static and synthetic package-artifact evidence only.
It cannot establish tenant discovery, Preflight, Apply, import, rebinding,
enablement, execution, mutation, live smoke, semantic or effective-permission
readback, tenant verification, publication, or publication readback.
