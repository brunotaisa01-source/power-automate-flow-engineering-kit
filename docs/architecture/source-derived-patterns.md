# Source-Derived Engineering Patterns

## Purpose

This document records the reusable engineering patterns distilled from three private, read-only workbench implementations. It is a design input for this public kit, not a copy of any source project or operational evidence.

All examples in this repository are synthetic. The private implementations remain the authority for their own environments and are not published here.

## Pattern 1: Server-Owned State Transitions

The browser may read an authorized view and submit a typed intent, but it must not directly change protected business state. A Power Automate processor re-reads identity, capability, scope, current state, and ETag before applying one declared transition. The processor writes an audit record and verifies the semantic result before marking the intent complete.

This pattern prevents client-controlled status, amount, owner, approval, or actor fields from becoming authority.

## Pattern 2: Explicit Direct-Patch Exception

Some workbenches need an explicit Save for a small set of user-editable fields. The exception is safe only when the contract declares the allowlist, the browser computes a minimal patch, each transaction obtains its own request digest, the update uses exact IF-MATCH, conflicts are visible, retries reconcile by GET, and post-write state is read back.

Autosave and explicit Save are different contracts. A project must choose one and keep product specification, frontend, flow, tests, and evidence aligned.

## Pattern 3: Deterministic Ingestion and Idempotency

Mailbox or external-event ingestion derives a stable key, performs a GET before creation, and handles cardinality zero, one, and many explicitly. An empty key, multiple matches, or an ambiguous mutation blocks silent creation. A retry after an uncertain write is a reconciliation GET, never an automatic replay of the original mutation.

Raw message bodies, recipients, attachments, and sensitive content do not belong in generic SharePoint operational state or public fixtures.

## Pattern 4: Artifact-Level Power Automate Validation

Flow safety is structural as well as behavioral. The final definition and ZIP must be reopened and checked for native envelope shape, connector operation shape, connection references, transitive action reachability, WDL syntax, URL encoding, loop placement, concurrency, action budgets, retries, idempotency, and semantic completion gates.

Source or builder tests alone are insufficient. The test target is the exact generated definition and final import candidate.

## Pattern 5: Schema and Index Discipline

SharePoint fields are identified by authoritative internal metadata. Existing fields are compared property by property; a single successful GET does not prove compatibility. Views are created only after required fields exist. Index changes are bounded, serialized, remove-before-add, ETag-gated, read back after each mutation, and idempotent no-ops when the desired state already holds.

HTTP errors are classified by phase and semantic signature. A missing-column 400 is not equivalent to an arbitrary 400, and an allowed initial preflight 404 is not equivalent to a failed Apply readback.

## Pattern 6: Evidence Is a Separate Contract

Local static validation, local synthetic runtime, package validation, import, rebind, enablement, live smoke, tenant verification, and publication are separate claim classes. A saved flow, successful run, synchronized folder, or local green suite cannot promote a project to tenant verified.

Every claim points to the exact artifact, command, timestamp/change window, and required residual gate.

## Pattern 7: RED/GREEN as a Permanent Failure Library

Each failure becomes a stable rule with a synthetic RED fixture, exact diagnostic, independent positive control, mutation test, final-artifact assertion, remediation, and residual external gate. The rule corpus is reused by future projects through contracts and profiles rather than by copying private code or data.

## Pattern 8: Public Release Safety

Public material uses placeholders, reserved example domains, deterministic fake IDs, synthetic messages, and generated artifacts built from public inputs. Recursive scans cover source, documentation, archives, generated output, and Git history. Private data is removed before publication, not after a public push.

## Non-Goals

- This document does not prove any tenant state.
- It does not publish private flow packages, schemas, screenshots, workbooks, identities, URLs, hashes, or payloads.
- It does not provide a write-capable tenant connector.
- It does not replace authenticated discovery or environment-specific approval.
