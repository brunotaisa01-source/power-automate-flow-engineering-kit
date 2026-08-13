# Contributing

## Before Opening a Change

1. Read the relevant specification, plan, and review record.
2. Add or update a synthetic RED fixture before changing production behavior.
3. Implement the smallest change that turns the RED into GREEN.
4. Add an independent positive control and a mutation or counterexample test.
5. Run the Node 22 build and the complete test suite.
6. Run the source-only privacy and capability scans.

## Public Data Rules

Never commit tenant URLs, company or organization names, employee or customer data, email addresses, mailbox content, credentials, private identifiers, exported production packages, raw payloads, screenshots, or private source code. Use placeholders such as `{SITE_URL}`, `{LIST_TITLE}`, and `{CONNECTION_REFERENCE}`.

## Evidence Rules

Local static and package evidence must not be promoted to tenant evidence. Keep import, rebind, enablement, execution, mutation, semantic readback, and publication readback as explicit external gates.

## Test Language

Rule tests must be deterministic. A positive control must have a structurally independent topology. A mutation must change behaviorally relevant evidence, not only a label or identifier.
