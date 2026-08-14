# WP-13 Failed Response And Site Boundary RED Record

## Baseline

The RED run started from the exact WP-12 baseline commit recorded in the
implementation checkpoint. The worktree contained no implementation changes.

## Reproduced Failures

The baseline accepted or consumed all three unsafe behaviors below:

1. A pagination response with HTTP 500 and a spoofed `value` array was treated
   as a valid page.
2. A failed digest response containing `FormDigestValue` authorized the Save
   sequence.
3. OData and Save accepted cross-origin or sibling-prefix URLs because no
   configured-site boundary was enforced.

The RED suite reported `40/43` passing tests and three intended failures. The
additional malformed-body, unexpected-status, digest-shape, and positive-site
controls were then retained as permanent regression coverage.

## Evidence Boundary

All fixtures use reserved synthetic domains, synthetic list names, and fake
responses. No private source project, tenant, company system, or publication
target was accessed.
