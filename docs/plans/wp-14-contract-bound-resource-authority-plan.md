# WP-14 Contract-Bound Resource Authority Plan

## Objective

Make the frontend adapter fail closed when Save, OData, or pagination receives
a caller-selected origin, site path, list resource, continuation link, or
unsafe ETag. Add a clean public example that proves the local command path
without using tenant data.

## Step-by-Step Plan

1. Record RED evidence from the baseline commit:
   - caller-selected frontend site/list values must not derive authority;
   - Save and OData must reject a wrong list;
   - pagination must reject wrong origin, wrong site, sibling-prefix, and wrong
     list links;
   - Save must reject wildcard, malformed, missing, and mismatched ETags;
   - README commands must fail clearly when no example root exists.
2. Derive the authoritative site URL from the contract environment binding.
3. Derive each allowed REST list resource from the contract list title binding.
4. Require exact source constants and policies to match those derivations.
5. Centralize origin, decoded site-path, and decoded list-resource boundary
   checks. Allow only legitimate descendants under the exact configured list.
6. Make Save read the current item ETag with status 200 before requesting a
   fresh digest or issuing the mutation.
7. Require a quoted concrete ETag and bind the same value to IF-MATCH.
8. Keep failed-response checks, conflict handling, reconcile-before-fail, and
   semantic readback intact.
9. Add permanent runtime and static RED probes for every boundary and ETag
   case, plus same-origin/site/list positive controls.
10. Add a synthetic example contract, frontend bundle, flow definition,
    solution ZIP, and exact manifest hashes.
11. Update README commands to target the example root and document global
    versus required-only scope and unavailable external gates.
12. Run build, focused tests, exact README commands, full tests, diff checks,
    audit, and the public-data scanner. Record unavailable scanner engines as
    NOT_RUN.

## Acceptance Criteria

- Contract validation passes for the public example.
- Global and required-only rule validation pass for the example.
- The declared synthetic ZIP passes package validation and exact manifest
  binding.
- The focused raw-artifact suite passes all positive and negative controls.
- No invalid URL reaches fetch in the boundary probes.
- No wildcard, missing, malformed, or mismatched ETag reaches mutation.
- No private source, tenant value, company identifier, credential, or
  production artifact enters the public tree.
- Local results remain separate from tenant, live-smoke, publication, and
  semantic-effect claims.

## Non-Goals

This work does not connect to SharePoint, Power Automate, Graph, Outlook,
GitHub, a tenant, or any company system. It does not import, rebind, enable,
execute, mutate, publish, or claim a live runtime result.
