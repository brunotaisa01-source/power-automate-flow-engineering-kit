# Global Self-Improvement Specification

## Status

WP-17 defines the local, public, connector-agnostic self-improvement control
plane. It covers Power Automate and Power Platform applications regardless of
whether a flow uses SharePoint, Excel, Power Apps, Dataverse, Outlook, Graph,
HTTP, SQL, approvals, or another supported connector. It does not implement a
write-capable MCP or model-weight training.

## Purpose

A new RED, adversarial counterexample, scanner finding, or independent review
finding must become a reusable lesson for future AIs without requiring a person
to repeat the instruction. The lesson is global because the approved registry is
installed with the skill and read at every new-project/review activation.

## State machine

```text
FINDING
  -> SANITIZED_CANDIDATE
  -> RED_PERMANENT
  -> GREEN_AND_POSITIVE_CONTROL
  -> INDEPENDENT_REVIEW
  -> PRIVACY_HISTORY_AUDIT
  -> APPROVED_REGISTRY
  -> CONSUMED_BY_NEXT_AI
```

A failed review creates `BLOCKED`; a superseded approved lesson becomes
`RETIRED` and remains in history. Only `APPROVED` registry lessons can affect
future AI planning. Candidates never close runtime, tenant, publication, or
rollback gates.

## Automatic capture

The coordinator/CI review hook automatically captures:

- original command and RED result;
- neutral summary without private values;
- affected connector/platform domains;
- invariant and threat class;
- repository-relative RED, GREEN, and positive-control test bindings;
- work package, source record, claim boundary, and status.

The privacy scrub runs before the candidate is stored. It rejects absolute paths,
real URLs/emails/GUIDs/IDs, company or private project markers, credentials, raw
payloads, screenshots, and proprietary text. Synthetic placeholders and
repository-relative paths are allowed.

## Promotion gate

Promotion requires all of the following:

1. The original RED remains permanent.
2. GREEN proves the intended behavior, not just a label or phrase.
3. A structurally independent positive control passes.
4. Connector-specific adversarial cases pass. For example, a Power Automate
   connector lesson must test method/endpoint/payload, status-before-body,
   retries/idempotency, and semantic readback. A SharePoint lesson additionally
   tests exact ETag/IF-MATCH and list/site authority.
5. Schema, index, permission, evidence, and mutation assertions are executable
   when the lesson covers them.
6. A fresh independent Luna max reviewer returns `APPROVED`.
7. `spflow learn audit` passes with no open candidate and no private finding.
8. Build, full suite, package/example validation, privacy/history scan, and
   required release gates pass.

A phrase in a skill, a reviewer statement, a successful local command, or an
AI-generated explanation cannot replace the executable bindings.

## Registry contract

The public registry is `knowledge/self-improvement/registry.json` and follows
`contracts/self-improvement.schema.json`. Every lesson includes a stable ID and
version, connector/platform scope, invariant, RED/GREEN/positive-control
bindings, provenance, independent review, claim boundary, and
`synthetic-public` classification. The auditor verifies that bound paths and test
names exist and that review records contain `APPROVED`.

Open candidates live under
`knowledge/self-improvement/candidates/`. The auditor reports every non-approved
candidate as `SELF_LEARNING_CANDIDATE_OPEN` with exit `1`. This makes incomplete
learning visible and prevents silent global drift.

## CLI and integrations

```text
spflow learn audit knowledge/self-improvement/registry.json --execute --format json
spflow learn capture knowledge/self-improvement/candidates/<lesson>.json
spflow learn promote knowledge/self-improvement/candidates/<lesson>.json --review <path> --reviewer-role <role>
```

Audit verifies the registry SHA-256 sidecar and executes distinct node-test
bindings. Capture and promotion write only local sanitized lesson files; promotion
requires executable evidence, a valid lifecycle transition, and independent
APPROVED review before recomputing the sidecar. Offline `spflow verify` runs this
audit automatically when the registry exists. The audit command is read-only;
capture and promotion never read or mutate a tenant, import or enable a flow,
trigger a run, change a connector, assign permission, or modify production.

A future plugin or read-only MCP may expose only:

```text
getRegistryMetadata
listApprovedLessons(scope?)
getApprovedLesson(id, version)
listCandidateStatus
```

It must return sanitized data and must not create, update, approve, promote,
write, import, enable, trigger, change permissions, or mutate a tenant. The
plugin/MCP remains deferred until a separate stability, privacy, and security
review.

## Evidence boundary

Self-improvement evidence is `LOCAL_STATIC`, `LOCAL_RUNTIME`,
`PACKAGE_ARTIFACT`, or `RUNTIME_SYNTHETIC` only. It never proves tenant import,
rebind, enablement, execution, mutation, semantic tenant effect, rollback,
publication, or publication readback.
