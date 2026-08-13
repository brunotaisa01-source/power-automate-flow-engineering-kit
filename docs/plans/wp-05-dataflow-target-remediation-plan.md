# WP-05 Dataflow and Target-Binding Remediation Plan

**Status:** required before Wave 1 acceptance

## Scope

This plan addresses the four additional fail-open cases found by the independent adversarial review:

1. Semantic completion can use a readback from an unrelated resource.
2. Idempotency handling can describe an unrelated mutation instead of the protected command mutation.
3. Destructive controls can be accepted from constant text predicates rather than runtime-derived evidence.
4. Undeclared source definitions can be omitted from artifact inventory.

## RED

Add built-CLI counterexamples that fail before implementation:

- A successful readback from an unrelated list or resource with otherwise matching assertion facts.
- A zero-match branch that audits successfully while the protected mutation is outside the idempotency decision.
- Constant expressions containing gate keywords with no runtime inputs or control relationship.
- An undeclared definition file in the source tree, including a definition whose flow is not in the contract.

Each case must assert the exact diagnostic rule and sanitize all identifiers.

## GREEN

- Bind every semantic readback proof to the command's target list/resource, target identifier, connector operation, and contract assertion.
- Bind idempotency zero/one/many outcomes to the actual command mutation using normalized operation identity, target list, target identifier, and branch dataflow. A generic audit/write action is not sufficient.
- Require destructive gates to be runtime-derived and structurally connected to the mutation and failure/compensation paths. Constant text or metadata labels cannot establish evidence.
- Discover all relevant source definitions before contract projection and fail on undeclared definitions, duplicate flow identities, or definitions outside the declared package inventory.
- Preserve deterministic diagnostics, redaction, local fail-closed behavior, and explicit tenant-only `NOT_RUN` gates.

## REFACTOR

Run the Node 22 root build, all new counterexamples, the complete suite, deterministic report checks, and bounded source scans. Confirm no network, tenant, import, rebind, enablement, run, mutation, or publication capability is introduced.

## Acceptance

Wave 1 remains `BLOCKED` until a fresh read-only reviewer reproduces these counterexamples through the built CLI and recommends `APPROVED` or `APPROVED_WITH_RESIDUAL_RISK`.

Local build and test evidence never implies tenant or publication evidence.
