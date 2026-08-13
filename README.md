# SharePoint Flow Engineering Kit

SharePoint Flow Engineering Kit is a public, synthetic-data toolkit for designing and validating applications built from:

`frontend -> SharePoint lists -> Power Automate -> SharePoint -> frontend`

It gives an AI or engineer a project contract, deterministic artifact inspection, Power Automate and package rules, RED/GREEN fixtures, evidence boundaries, and a local CLI. The repository is designed to prevent common failures before any tenant operation is considered.

## Status

The current implementation contains offline package/flow validation plus WP-06
SharePoint and frontend rules. WP-06 uses executable adapters over strict JSON
source IR, deterministic derived projections, exact graph lineage, and required
final-artifact gates. Arbitrary JavaScript, TypeScript, exported WDL, and native
solution ZIP parsing into the WP-06 IR remain future adapter work.

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

Validate a project contract:

```powershell
node packages/cli/dist/bin/spflow.js validate contract project.contract.json --format text
```

Validate a Power Platform solution artifact against a contract:

```powershell
node packages/cli/dist/bin/spflow.js validate artifact artifacts/solution.zip --contract project.contract.json --format text
```

Run the offline verification command:

```powershell
node packages/cli/dist/bin/spflow.js verify --root . --offline --format text
```

Offline verification must not be interpreted as tenant verification. External gates are explicit `NOT_RUN` evidence when their prerequisites are unavailable.

## Repository Map

- `contracts/`: strict project, SharePoint, flow, package, rule, and evidence schemas.
- `packages/core/`: contracts, canonical data, artifact graph, diagnostics, and evidence types.
- `packages/package-adapters/`: safe archive/XML inspection and normalized flow evidence.
- `packages/rules/`: deterministic package and Power Automate rule detectors.
- `packages/cli/`: the `spflow` command-line interface and reporters.
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
a canonical projection from a strict frontend or Power Automate source IR. The
evidence must match that projection and bind to the exact source, project
contract, and required bundle/definition/ZIP graph. See
[WP-06 Source IR](docs/specs/wp06-source-ir.md).

## Privacy Boundary

The public repository must contain only synthetic data, placeholders, and public documentation. Do not add tenant URLs, company names, employee or customer data, mailbox contents, private identifiers, exported production packages, screenshots, raw payloads, credentials, or internal source code.

The three source projects used to derive anonymous patterns are not part of this repository and are not modified by the toolkit.

See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the [sanitization policy](docs/specs/sanitization-policy.md).
