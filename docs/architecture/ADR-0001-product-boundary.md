# ADR-0001: Product Boundary

- Status: Proposed for architecture review
- Date: 2026-08-12
- Decision owners: Project maintainer and independent architecture reviewer
- Scope: Public SharePoint Flow Engineering Kit

## Context

AI-assisted SharePoint and Power Automate projects repeatedly fail at the same boundaries: browser authority, SharePoint concurrency, package shape, Power Automate action graphs, connector syntax, idempotency, pagination, evidence promotion, and tenant release. Documentation alone does not prevent these failures. A tenant-connected tool introduced too early would add authentication, permission, and mutation risk before the offline contracts are proven.

The public product must be useful to any AI or engineer without access to a private tenant, private source project, exported operational package, or production data. It must turn known failure patterns into executable, synthetic RED/GREEN rules and provide a complete contract for building a new app from zero.

## Decision

Build an agent-neutral **SharePoint Flow Engineering Kit** with the following phased boundary:

1. **Core:** normative contracts, JSON schemas, a deterministic TypeScript CLI named `spflow`, package adapters, synthetic fixtures, templates, tests, CI, and model-neutral skills.
2. **Optional Codex plugin:** packaging for the validated skills and CLI. It may be added only after the core global verification and independent review gates pass.
3. **Optional read-only MCP:** a separately approved authenticated adapter for discovery and readback. It is deferred until after an authorized tenant pilot.
4. **Write-capable MCP:** out of scope. Tenant mutation remains an explicit human-authorized release activity using reviewed artifacts and runbooks.

The core is authoritative. Skills and plugins invoke the same contracts and CLI; they do not duplicate or weaken rules.

## Required Product Properties

- Works offline for contract, rule, fixture, generated-definition, ZIP, manifest, public-data, and evidence validation.
- Uses only synthetic fixtures and placeholders.
- Defaults to a typed command queue. The browser cannot directly mutate protected domain state.
- Permits direct SharePoint patching only for fields declared `clientEditable` in the project contract.
- Models local and tenant evidence as different claim classes.
- Reopens and validates the final ZIP; source or builder validation is insufficient.
- Emits deterministic machine-readable diagnostics with stable rule IDs and exit statuses.
- Requires RED, GREEN, and REFACTOR evidence for every implementation work package.
- Never requires a particular AI vendor or agent runtime.

## Rejected Alternatives

### Documentation and skills only

Rejected because advisory text cannot detect package drift, unsafe action graphs, stale manifests, private-data leakage, or unsupported evidence claims.

### MCP-first product

Rejected because tenant authentication and permissions would become prerequisites for basic validation. It would also create pressure to mix read and write authority in one tool.

### Publishing an existing application repository

Rejected because operational repositories can contain private identifiers, exported packages, evidence, screenshots, message data, and environment assumptions. Public artifacts must be reconstructed from synthetic contracts and fixtures in a new repository.

## Consequences

### Positive

- A clean-context AI can learn the required engineering process from one repository.
- Known failures become enforceable rules rather than historical anecdotes.
- Offline claims remain reproducible and cannot be confused with tenant verification.
- Tenant permissions and mutation authority remain outside the public core.

### Costs

- Package adapters must understand supported native export profiles precisely.
- Synthetic RED/GREEN fixtures must be maintained as first-class artifacts.
- A tenant pilot still requires human authorization, environment bindings, and authenticated readback.
- Public release is blocked until license and publication authority are approved at review gate `R0`.

## Acceptance Criteria

This decision is accepted only when reviewers confirm:

- the core can be implemented and verified without a tenant connection;
- every tenant-only assertion is explicitly marked as a residual external gate;
- the CLI never mutates a tenant;
- no public artifact contains environment-specific or private data;
- optional plugin and MCP phases cannot bypass core validation;
- no write-capable MCP is present in the roadmap.

