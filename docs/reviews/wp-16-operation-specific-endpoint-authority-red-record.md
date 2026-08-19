# WP-16 RED Record

## Baseline

- Baseline commit: `bfb42a0627f41f663632af7336bca629bd0be293`
- Scope: synthetic public fixture only
- Runtime: Node 22

## Initial Probe

The permanent RED probe supplied the configured list resource followed by
`/fields` to Save, OData, and pagination. The baseline shared-prefix behavior
accepted the non-item endpoint, so the probe observed unauthorized fetch
attempts instead of a fail-closed endpoint rejection.

Result before the fix: `53/54` subtests passed and the new WP-16 subtest failed
as intended. This established the missing behavior without modifying private
projects or contacting an external system.

## Expanded RED Matrix

The negative matrix then added wrong collection/item forms, malformed URLs,
resource substitutions, raw traversal, encoded traversal, encoded separators,
and query misuse. One encoded traversal candidate was normalized by URL
parsing into an apparently valid item path, confirming that a pre-parse raw
candidate guard was required.

The implementation was deliberately held to the smallest fail-closed change:
three exact helpers, each independently bound to the contract-derived path.
