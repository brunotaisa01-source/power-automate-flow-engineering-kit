# WP-17 Skill Loophole Review r01

## Decision

`BLOCKED`

The independent reviewer found that the first documentation TDD used token-only
regex checks and canned prose. It did not prove AI behavior, fail-closed endpoint
rejection, no-fetch behavior, ETag/IF-MATCH, semantic readback, schema/index/
permission handling, or evidence-promotion rejection.

## Required Remediation

Replace the canned pressure GREEN with an executable harness containing a real
synthetic frontend import, adversarial endpoint inputs with zero-fetch assertions,
independent Save/OData/pagination positive controls, response-status/readback
counterexamples, schema state classification, index NO_OP/remove-before-add,
permission exact-match/effective-mask checks, and local-to-tenant evidence
promotion rejection. Keep the RED lesson permanent and promote it only after a
fresh independent review.

## Residual Gates

The skill remediation was local and synthetic only. Build, full suite, official
scanner/history scan, publication, tenant/runtime evidence, rollback, and final
independent approval remain open.
