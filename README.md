# SharePoint Flow Engineering Kit

SharePoint Flow Engineering Kit is a public, synthetic-data toolkit for designing and validating applications built from:

`frontend -> SharePoint lists -> Power Automate -> SharePoint -> frontend`

It gives an AI or engineer a project contract, deterministic artifact inspection, Power Automate and package rules, RED/GREEN fixtures, evidence boundaries, and a local CLI. The repository is designed to prevent common failures before any tenant operation is considered.

## Status

The current implementation contains offline package/flow validation plus WP-06
SharePoint and frontend rules. WP-06 adapters inspect exact frontend source
files, normalize declared Power Automate definitions, verify complete frontend
inventories, and safely inspect native solution ZIP bytes. Repository-authored
evidence, source IR, projections, and JSON stored under a `.zip` name cannot
authorize a production PASS.

WP-15 local hardening recognizes a deliberately narrow executable grammar.
Frontend authority requires a parser-clean, closed module inventory and exact
supported AST shapes whose network calls use the unshadowed
`globalThis.fetch` API. The accepted Save shape rejects empty, unknown, or
undefined patch entries and establishes semantic readback only through a
successful `200` readback status check followed by a field-by-field comparison
of the parsed GET response with the serialized write body. Save, digest, and
OData URLs must be resolved against the configured SharePoint site URL from
the contract binding. The boundary check rejects malformed URLs, credentials,
hashes, arbitrary origins, and sibling site-path prefixes using exact decoded
path segments. A Save obtains `/_api/contextinfo` under that site path and
accepts a digest only from a successful `2xx` response with a non-empty string
value. Pagination parses URLs, enforces the configured site path on exact
decoded segment boundaries, validates a successful `2xx` response and array
body before consuming results, and rejects malformed continuation values. The
accepted OData shape is one allowlisted field equality with escaped
literal data; caller-supplied filter fragments are not accepted. Schema
authority requires a complete contract-bound create payload, including
type-specific Choice, Lookup, and DateTime properties, native SharePoint field
response comparisons, response-bound
FOUND/MISSING/FAILED branches, creation only in MISSING, and post-create GET
readback. Index authority requires a complete
indexed-field read, exact current-state assertion, an approved digest
assertion consumed by the executable plan, serial remove-before-add writes,
per-field ETag reads, exact `POST`/`MERGE`/`IF-MATCH` controls, full
per-step/final readbacks, and a compatible zero-write `NO_OP`. Permission
inheritance is derived only from the accepted executable `break-clear` shape;
grant readback binds principal and role in one assignment, while effective
permissions are checked against native `High`/`Low` masks.
Protected authorization facts are emitted only when Owner and Amount contract
fields are selected by the target GET and consumed by the reachable guard.
  Before any builder section is emitted, every normalized action is inspected;
  an unsupported connector, ambiguous HTTP method, or mutating action outside
  the exact contract-derived action set suppresses the whole builder derivation.
  WP-15 also records control reachability during flow normalization. A
  deterministic `false` condition, including constant contradictions such as
  `equals(1,0)` and nested boolean contradictions, marks its descendant
  actions unreachable; any unreachable action suppresses builder authority.
  Data-dependent conditions remain runtime-conditional and continue through the
  existing structural and lineage checks. Frontend Save authority rejects the
  wildcard ETag and every C0 or DEL header character, including characters
  inside quoted values, before any request is sent.
Unsupported or ambiguous structures produce no trusted derivation. A compiled
CLI process covers the fourteen contract-required WP-06 rules from raw
synthetic files and real ZIP bytes. This is not a release-readiness claim.

`PA-CONNECTOR-001` is method-aware: HTTP GET, HEAD, and OPTIONS actions are
reads and do not require MERGE headers. Recognized item and field updates still
require `POST`, `X-HTTP-Method: MERGE`, and a non-wildcard exact ETag. Unknown
or dynamic HTTP requests and non-read methods fail closed unless they carry the
supported mutation controls.

All results are local evidence only. Tenant import, rebinding, enablement,
execution, mutation, semantic readback, and publication readback are separate
gates and are not performed by this repository.

## Quick Start

Requirements:

- Node.js `22.x`
- npm `10.x`

Install and verify:

```powershell
npm ci
npm run build
npm test
```

The public example is a complete, synthetic project. It contains a
contract-bound frontend, a zero-action flow envelope for package inspection,
and exact bundle/package manifests. It contains no tenant values, credentials,
mailboxes, company identifiers, or production exports.

Validate the example project contract:

```powershell
node packages/cli/dist/bin/spflow.js validate contract examples/minimal-public-app/project.contract.json --format text
```

Validate every shipped local rule against the example (global scope):

```powershell
node packages/cli/dist/bin/spflow.js validate rules --root examples/minimal-public-app --format text
```

Validate only the exact rule IDs declared by the example contract (required-only
scope):

```powershell
node packages/cli/dist/bin/spflow.js validate rules --root examples/minimal-public-app --required-only --format text
```

Global validation evaluates the shipped rule registry. The required-only
command is a bounded contract rule-set check and must never be reported as a
global validation pass.

Validate the example Power Platform solution artifact against its contract:

```powershell
node packages/cli/dist/bin/spflow.js validate artifact examples/minimal-public-app/artifacts/example-solution.zip --contract examples/minimal-public-app/project.contract.json --format text
```

Run the example offline verification command:

```powershell
node packages/cli/dist/bin/spflow.js verify --root examples/minimal-public-app --offline --format text
```

Offline verification must not be interpreted as tenant verification. In an
environment without the official public-data scanner, this command is
expected to return exit `8` with `NOT_RUN=public-data-scanner`; unavailable
engines are never promoted to PASS. Tenant import, rebinding, enablement,
execution, mutation, semantic readback, publication readback, and rule-specific
`LIVE_SMOKE` checks remain explicit `NOT_RUN` gates. Rule-specific
`LIVE_SMOKE NOT_RUN` entries are derived from the required rule IDs and their
shipped catalog metadata; they are not runtime observations.

## Repository Map

- `contracts/`: strict project, SharePoint, flow, package, rule, and evidence schemas.
- `packages/core/`: contracts, canonical data, artifact graph, diagnostics, and evidence types.
- `packages/package-adapters/`: safe archive/XML inspection and normalized flow evidence.
- `packages/rules/`: deterministic package and Power Automate rule detectors.
- `packages/cli/`: the `spflow` command-line interface and reporters.
- `examples/minimal-public-app/`: the synthetic contract, frontend, flow definition,
  package ZIP, and exact manifests used by the README commands.
- `fixtures/`: synthetic RED, GREEN, positive-control, and mutation fixtures.
- `tests/`: unit, integration, adapter-boundary, and shipped-CLI verification tests.
- `docs/specs/`: contracts and evidence model.
- `docs/architecture/`: product boundary, architecture, threat model, and source-derived patterns.
- `docs/plans/`: implementation and remediation plans.
- `docs/reviews/`: review records and acceptance gates.

## Engineering Model

The default protected-write model is a typed command queue. The frontend submits an allowlisted intent; a flow re-reads identity, capability, scope, state, and ETag; validates the transition; writes the authoritative state; records an audit event; performs semantic readback; and lets the frontend reload authoritative state.

Direct SharePoint patching is an explicit exception. It requires an explicit save, allowlisted fields, a fresh request digest, exact ETag handling, `412` conflict handling, retry-safe reconciliation, and semantic readback.

Rules are evidence-bound. Every public rule should have a rule ID, synthetic RED fixture, GREEN fixture, independent positive control, mutation test, deterministic diagnostic, remediation guidance, and an explicit external evidence gate where applicable.

WP-06 normalized evidence cannot prove itself. A code-selected adapter derives
a canonical projection from an exact frontend file or declared normalized flow
definition. The evidence must match that projection and bind to the exact raw
artifact, project contract, and required bundle/definition/ZIP graph. See
[WP-06 Source IR](docs/specs/wp06-source-ir.md).

The contract-bound runtime profile for frontend Save, OData, and pagination is
defined in [WP-14 Contract-Bound Runtime Authority](docs/specs/wp14-contract-bound-runtime.md).
Its RED/GREEN evidence is recorded in
[the WP-14 review record](docs/reviews/wp-14-contract-bound-resource-authority-red-green-record.md).

## Privacy Boundary

The public repository must contain only synthetic data, placeholders, and public documentation. Do not add tenant URLs, company names, employee or customer data, mailbox contents, private identifiers, exported production packages, screenshots, raw payloads, credentials, or internal source code.

The three source projects used to derive anonymous patterns are not part of this repository and are not modified by the toolkit.

See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the [sanitization policy](docs/specs/sanitization-policy.md).
