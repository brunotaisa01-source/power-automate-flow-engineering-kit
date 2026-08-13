# WP-06 Semantic Hardening Remediation Record

## Decision

`READY_FOR_INDEPENDENT_REVIEW`

This decision is local and provisional. It is not independent acceptance and
does not establish package, tenant, runtime, semantic-effect, or publication
claims.

## Baseline and Scope

- Baseline commit: `14dc33857583d84254a89b3f914b8db5cfcd9bf4`.
- Private reference projects accessed: no.
- Wave-1 rule implementation changed: no.
- Changed files: 59.
- File groups: 42 canonical WP-06 fixture graphs, one adversarial fixture, five
  documentation files, four core files, three Wave-2 rule files, and four test
  files.

## Remediation

- Added the strict `wp06-source-projection-v1` adapter-output contract.
- Required canonical equality between one projected source-fact section and
  one normalized evidence section.
- Added exact evidence `derives-from` source and `verifies-contract` graph
  relations and validated their endpoints and cardinality.
- Bound source and contract by distinct path, SHA-256, and byte length.
- Added exact-key schemas for the envelope, binding, projection, every section
  object, and every nested object.
- Rejected duplicate semantic arrays and repeated list, field, command,
  permission, request, and plan ownership.
- Required integer HTTP status in `100..599`; retained semantic 400/404
  classification; required strict parsed object-body proof for `FOUND`.
- Required exact contract property ownership in field compatibility readback.

The validator verifies deterministic adapter output. It does not treat an
adapter label as proof that source code has the claimed semantics. Production
adapters must derive projections from an actual declared frontend, builder,
definition, package, or other source. Adapter trust and final artifact
inspection remain separate gates.

## TDD Evidence

### Initial RED

- Command: focused WP-06 remediation adversarial suite.
- Exit code: `1`.
- Result: `6/11` passed and the five required adversarial tests failed for the
  expected missing diagnostics.

### Supplemental RED

- Command: focused field-compatibility actual-body test.
- Exit code: `1`.
- Result: `0/1` passed; the contract-undeclared property produced no diagnostic.

### Focused GREEN and Mutation

- WP-06 core, Wave-2, built CLI, and initial adversarial matrix: `48/48` passed.
- Expanded adversarial matrix: `15/15` passed.
- Canonical RED/GREEN, independent positive controls, structural mutations,
  source/evidence co-mutations, missing-edge mutations, strict-key mutations,
  duplicate-value mutations, HTTP body mutations, and compiled CLI paths were
  exercised.

### Build and Full Suite

```text
npm run build
npm test
git diff --check
```

- Build: exit `0`.
- Full suite: `244/244` tests passed in 19 suites.
- Diff check: exit `0`; Git emitted line-ending conversion warnings only.

## Public-Data Gate

The official command reported `exitCode: 8`, `notRun: 1`, and residual gate
`public-data-scanner` because its engine is unavailable. This is `NOT_RUN`, not
a code RED and not a PASS.

An auxiliary versionable-file scan found no private marker, tenant domain,
synchronized-folder marker, binary/archive, or non-synthetic identity. Its
remaining matches were public dependency/schema URLs and explicit synthetic
rejection vectors. This auxiliary result does not replace the official gate.

## External Gates

The following remain `NOT_RUN`:

- final package generation and ZIP inspection;
- tenant discovery and preflight;
- tenant apply or controlled mutation;
- import and connection rebinding;
- enablement and authenticated execution;
- effective-permission and semantic live readback;
- publication.

No local result in this record may be promoted to those claim classes.
