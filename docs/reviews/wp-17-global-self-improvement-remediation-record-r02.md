# WP-17 Global Self-Improvement Remediation Record r02

## Implemented Control Plane

The public kit now has a versioned, connector-agnostic Power Automate/Power
Platform learning registry covering SharePoint, Excel, Power Apps, Dataverse,
Outlook, Graph, HTTP, SQL, approvals, and future connectors. The local-only CLI
provides `learn audit --execute`, `learn capture`, and `learn promote`; offline
`verify` audits the registry automatically when present. A future plugin/read-only
MCP contract exposes only sanitized registry reads and has no write or tenant
operations.

New findings are captured as sanitized candidates with permanent RED, GREEN,
structurally separate positive controls, lifecycle history, schema bindings,
realpath containment, privacy checks, exact review records, and registry SHA-256
digest. Candidates remain blocked until independently approved.

## Verification

- Executable skill TDD uses real frontend fetch/no-fetch, ETag/IF-MATCH,
  status-before-body, semantic readback, and production schema/index/permission/
  evidence rule files.
- AJV schema and semantic lifecycle validation reject unknown fields, invalid
  transitions, reused records, unstructured approvals, digest tampering, encoded
  privacy markers, and unsafe paths.
- Full local suite: `333/333`; build: PASS; audit: `0` vulnerabilities;
  whitespace check: PASS.
- Independent Luna max review r02: `APPROVED` with no blocking findings.

## Open Candidate

The historical WP17 token-only skill-test finding remains documented in
`docs/reviews/wp-17-skill-loophole-review-r01.md` and
`knowledge/self-improvement/candidates/wp-17-skill-tdd-loophole.json`. The
candidate is intentionally not in the approved registry. `spflow learn audit`
returns exit `1` for this open candidate; that is correct fail-closed behavior.

## Claim Boundary

This record proves only local repository behavior against synthetic artifacts. It
does not prove tenant/runtime execution, connector effects, rollback, publication,
MCP deployment, model training, or production readiness.
