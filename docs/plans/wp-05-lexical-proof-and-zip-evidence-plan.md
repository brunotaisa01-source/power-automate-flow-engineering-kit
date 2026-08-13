# WP-05 Lexical Proof and ZIP Evidence Plan

**Status:** required before Wave 1 acceptance

## Scope

This plan addresses the latest independent clean-checkout findings:

1. Destructive and idempotency predicates accept constant or tautological safety evidence when an irrelevant runtime reference is present.
2. Package integrity can pass when the required ZIP artifact node is absent.

## RED

Add direct and built-CLI counterexamples that fail before implementation:

- A destructive gate whose expression contains the expected keyword and an unrelated runtime reference but is constant or tautological.
- An idempotency guard whose expression references an unrelated runtime value but does not derive the command key or lookup cardinality.
- A package rule context with adapter evidence and manifest data but no ZIP artifact evidence.

Each test must assert the intended rule code and must not rely on unrelated diagnostics.

## GREEN

- Require destructive gates to be parsed runtime predicates whose referenced values derive from the relevant command target, plan, approval, limit, or state. Constant text, labels, and irrelevant references do not count.
- Require idempotency key and cardinality predicates to reference the normalized command key or lookup result and connect to the protected mutation. Irrelevant references and tautologies do not count.
- Require `PKG-INTEGRITY-001` to fail closed when any required package artifact node or exact artifact evidence is absent, even if adapter evidence exists.
- Preserve diagnostics redaction, deterministic ordering, existing positive controls, and tenant-only `NOT_RUN` gates.

## REFACTOR

Run Node 22 build and full suite, the complete built-CLI counterexample matrix, deterministic output checks, source-only capability scan, bounded public-data scan, and a clean immutable revision check.

## Acceptance

Wave 1 remains `BLOCKED` until a fresh independent reviewer reproduces the new counterexamples and confirms the required scans against an immutable revision.
