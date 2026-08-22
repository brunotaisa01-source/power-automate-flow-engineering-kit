# WP-17 Skill TDD Loophole Independent Review r03

Decision: BLOCKED

Reviewer role: independent-luna-max-reviewer

Review evidence: RED/GREEN/positive-control were executed as `LOCAL_SYNTHETIC` only. RED: `node --experimental-strip-types --test --test-name-pattern='^pressure scenario without the skill is an executable RED$' tests/skills/sharepoint-flow-engineering-kit-skill.test.ts` — exit 0, 1/1 pass. GREEN: `node --experimental-strip-types --test --test-name-pattern='^skill procedure rejects endpoint attacks before any fetch$' tests/skills/sharepoint-flow-engineering-kit-skill.test.ts` — exit 0, 1/1 pass, including zero intercepted fetches. Positive-control: `node --experimental-strip-types --test --test-name-pattern='^an approved connector-neutral lesson with independent controls is GREEN$' tests/unit/core/self-improvement.test.ts` — exit 0, 1/1 pass. Limitation: the bound positive-control creates three temporary `node:test` files whose bodies are empty no-op tests; it validates binding/audit plumbing, not an independent valid behavioral control. Additional ETag/IF-MATCH/readback and schema/index/permission/evidence tests are present but are not the candidate's bound positive-control and were not executed because this review was limited to exactly the three bindings. Next step: bind and execute a non-no-op, behaviorally independent positive control, then rerun the required promotion gates and obtain a fresh independent review.

## Basis

- The RED binding is executable and preserves the historical endpoint-prefix
  bypass: the naive helper accepts the `/fields` descendant.
- The GREEN binding imports the synthetic frontend, rejects adversarial Save and
  collection endpoints, and asserts that no `globalThis.fetch` call occurs.
- The candidate remains `CANDIDATE`; the registry is unchanged at revision 1 and
  its SHA-256 sidecar matches the checked-in registry.
- The candidate and reviewed records are `synthetic-public`, use repository-
  relative paths and `example.test`, and require no tenant, credentials, live
  flow, provider readback, or write-capable integration. No tenant evidence is
  claimed.
- Full promotion gates were not run: `spflow learn audit --execute`, build,
  full suite, package/example validation, privacy/history scanner, and other
  release gates remain `NOT_RUN`. No formal Wave close or tenant approval is
  asserted.

worker status: retired
