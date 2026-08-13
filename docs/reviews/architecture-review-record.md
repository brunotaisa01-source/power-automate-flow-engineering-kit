# Architecture Review Record

## Decision

`APPROVED_FOR_IMPLEMENTATION`

This decision approves the local implementation of the SharePoint Flow Engineering Kit described by the architecture and specification set in this directory.

It does not authorize:

- access to any tenant, mailbox, SharePoint site, or Power Automate environment;
- import, rebind, enablement, triggering, mutation, deletion, or live smoke testing;
- publication of private source, operational exports, identities, URLs, payloads, or internal hashes;
- write-capable MCP development;
- public GitHub publication before the public-data, artifact, independent-review, and publication-readback gates pass.

## Review Inputs

- Three read-only project reviews covering a transactional command-queue application, a mailbox-ingestion case workbench, and a SharePoint/Power Automate query workbench.
- One independent Sol xhigh architecture decision comparing documentation-only, skills plus deterministic CLI/plugin, and skills plus CLI plus MCP.
- The 13 English architecture/specification/plan documents in this repository.

## Accepted Product Boundary

The selected product is an agent-neutral knowledge and enforcement system:

1. Normative contracts and schemas define the solution before implementation.
2. A deterministic offline TypeScript CLI validates contracts, definitions, packages, rules, evidence, and public-data safety.
3. Synthetic RED/GREEN fixtures encode known failure patterns without private source or data.
4. Model-neutral skills instruct an AI to use the contracts and CLI rather than inventing parallel rules.
5. A Codex plugin is optional and follows the validated core.
6. Authenticated read-only MCP is deferred to a separate phase.

## Blocking Review Conditions

Implementation workers must stop at their package gate if any of the following is true:

- the test did not demonstrate the expected RED before implementation;
- the detector passes the canonical RED, a mutation, or a non-equivalent positive control;
- source, definition, final ZIP, manifest, documentation, or evidence disagree;
- client-supplied identity or business values are treated as authority;
- a flow can complete without semantic readback;
- a retry can replay an ambiguous mutation without GET reconciliation;
- a local result is presented as tenant verification;
- a public-data scan finds a private identifier, endpoint, payload, or artifact;
- the worker lacks a checkpoint, exact changed-file list, and final command evidence.

## Next Gate

Start only `WP-01` from the implementation plan. The coordinator must independently inspect its diff and rerun its acceptance commands before assigning a new worker to the next package.
