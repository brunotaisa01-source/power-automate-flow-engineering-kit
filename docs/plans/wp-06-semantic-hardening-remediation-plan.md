# WP-06 Semantic Hardening Remediation Plan

## Scope

This work remediates the five findings raised against commit
`14dc33857583d84254a89b3f914b8db5cfcd9bf4`. It is limited to WP-06 evidence,
artifact-graph relations, Wave-2 detectors, synthetic fixtures, tests, and
supporting documentation.

The private reference projects are out of scope and must not be read or
modified. Tenant import, rebinding, enablement, execution, mutation, live
readback, effective-permission validation, semantic effect, and publication are
external gates and remain `NOT_RUN`.

## TDD Sequence

1. Add focused adversarial tests for semantic source derivation and required
   graph relations, exact contract byte binding, unknown nested claims,
   duplicate semantic values, and HTTP body/status validation.
2. Run the focused tests against the baseline and record the expected RED.
3. Define a strict source-projection contract that is structurally distinct
   from the evidence envelope and deterministically projects one WP-06 section.
4. Require canonical equality between the bound source projection and the
   selected evidence section.
5. Add explicit evidence-to-source and evidence-to-contract graph relations and
   validate exact endpoints and relation names.
6. Add exact contract path, SHA-256, and byte-length binding.
7. Make the evidence, binding, source projection, section, and nested object
   schemas fail closed on unknown keys or invalid types.
8. Enforce uniqueness for semantic arrays and exact ownership collections.
9. Require integer HTTP statuses in `100..599`; preserve existing 400 and 404
   semantics; require strict parsed response-body proof before `FOUND`.
10. Run focused GREEN, positive controls, mutation checks, the compiled CLI
    integration, build, full suite, `git diff --check`, and the public-data scan
    when its engine is available.

## Trust Boundary

The validator verifies deterministic output from a declared source adapter. It
does not infer source-code semantics from a provenance label and does not treat
hand-authored evidence JSON as independent proof. Production adapters remain
responsible for parsing frontend source, Power Automate builder or definition
artifacts, generated packages, or another explicitly declared source into the
strict projection contract.
