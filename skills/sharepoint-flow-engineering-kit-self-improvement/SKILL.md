# SharePoint Flow Engineering Kit Self-Improvement

## Purpose

This skill is the automatic global learning hook for any AI using the SharePoint
Flow Engineering Kit and any Power Automate/Power Platform application. It is
connector-agnostic: apply it to SharePoint, Excel, Power Apps, Dataverse,
Outlook, Graph, HTTP, SQL, approvals, and future connectors. Load it before
planning a new project, after a RED test,
a worker review finding, a scanner finding, or a runtime counterexample. The AI
must run this loop automatically; the user does not need to repeat the lesson.

Self-improvement here means governed, versioned engineering lessons. It does not
mean silent model-weight training, unreviewed rule changes, or tenant mutation.

## Automatic activation

1. Locate the installed `knowledge/self-improvement/registry.json` or obtain the
   same registry through the approved read-only plugin interface.
2. Read the registry revision and exact digest before planning. Apply every
   `APPROVED` lesson whose scope matches the project.
3. Run `spflow learn audit <registry-path> --execute --format json` before using a lesson. It verifies the exact registry SHA-256 sidecar, runs each distinct node-test binding, and checks lifecycle/review/path semantics. A malformed registry, missing bound test, unresolved review, candidate, digest mismatch, or privacy finding is a blocking local gate.
4. Never use a `CANDIDATE`, `BLOCKED`, or `RETIRED` lesson as an instruction.
5. Record the registry revision in the local checkpoint and final report without
   copying private environment values.

If no approved registry is available, report the self-improvement gate as
`NOT_RUN`; do not invent lessons or silently treat an empty cache as current.

## Automatic learning loop

When any new error or review finding appears, do this without waiting for a new
user instruction:

1. Preserve the original RED output and do not delete old evidence.
2. Create a sanitized candidate under
   `knowledge/self-improvement/candidates/<lesson-id>.json` with:
   - stable ID and version;
   - trigger kind and neutral summary;
   - exact invariant and affected domains;
   - permanent RED test binding;
   - required GREEN test binding;
   - structurally independent positive-control binding;
   - local claim boundary;
   - provenance work package/review record;
   - `CANDIDATE` or `BLOCKED` status;
   - synthetic-public privacy classification.
3. Run the privacy scrub before storing the candidate. Remove tenant URLs,
   absolute paths, names, emails, GUIDs, IDs, credentials, raw payloads, and
   proprietary text. Keep only synthetic values and repository-relative paths.
4. Add or update the permanent RED fixture. Implement the smallest fail-closed
   change and add a behaviorally independent GREEN control.
5. Execute the candidate's RED, GREEN, positive-control, mutation, and relevant
   package tests. A phrase, label, parameter, copied projection, or successful
   command alone is not evidence.
6. Ask a fresh independent Luna max reviewer automatically through the review
   gate. A timeout is `PENDING`, not approval or failure.
7. Keep the candidate blocked until the reviewer, privacy/history scanner,
   `spflow learn audit`, and required build/test gates pass.
8. Use the local-only `spflow learn capture <candidate-path>` hook to persist a
   sanitized candidate. After independent approval, use
   `spflow learn promote <candidate-path> --review <path> --reviewer-role <role>`;
   promotion executes the bound tests, checks the lifecycle transition, appends
   the approved lesson, recomputes the registry SHA-256 sidecar, and writes no
   tenant state. Do not promote in memory, in a chat message, or through an MCP
   call. Commit the resulting registry change explicitly.
9. Make the next AI read the new registry revision automatically. Retired lessons
   remain in history and are superseded by a new version, never erased.

## Lesson quality gate

An approved lesson is valid only when all three evidence bindings are real and
repository-relative:

- RED: the old behavior fails or the bypass is detected;
- GREEN: the remediation passes the intended assertion;
- positive control: a structurally independent valid case still passes.

For Power Automate and connector runtime lessons, the evidence must include
executable counterexamples such as zero-request or zero-write rejection, exact
connector/method/endpoint/payload assertions, and connector-specific concurrency
controls. For SharePoint this includes exact endpoint/method/ETag assertions.
Every connector lesson must also prove status-before-body
handling, semantic readback, schema `FOUND/MISSING/FAILED`, index
remove-before-add/`NO_OP`, permission exact-match/effective-mask, and evidence
promotion rejection where applicable. Token-only or canned prose tests are
insufficient.

Every lesson must state its claim boundary. `LOCAL_STATIC`, `LOCAL_RUNTIME`,
`PACKAGE_ARTIFACT`, or `RUNTIME_SYNTHETIC` does not prove tenant execution,
mutation, rollback, publication, or semantic tenant effect.

## Read-only plugin/MCP contract

The future global integration is a read-only interface with these operations only:

```text
getRegistryMetadata()
listApprovedLessons(scope?)
getApprovedLesson(id, version)
listCandidateStatus()
```

The interface returns registry revision/digest, sanitized lessons, lifecycle
state, and candidate status. The CLI and local promotion hook are the only
current automation; the read interface must not expose private deny terms, raw
tenant evidence, credentials,
raw payloads, or hidden paths. It has no create, update, delete, approve, promote,
write, import, enable, trigger, permission, or tenant-mutation operation.

Until a separate plugin/MCP gate approves this interface, the checked-in registry
and this skill are the global source of truth. Do not improvise credentials or
replace the CLI with a write-capable integration.

## Reporting

Every self-improvement checkpoint reports:

```text
registry: <id>@<revision> <digest or NOT_RUN>
new finding: <lesson-id or none>
candidate status: CANDIDATE/BLOCKED/APPROVED/RETIRED
RED: <command and result>
GREEN: <command and result>
positive control: <command and result>
independent review: APPROVED/BLOCKED/PENDING
privacy/history: PASS/NOT_RUN/BLOCKED
claim boundary: <class>
residual gates: <explicit list>
```

Never report a candidate as learned, a local pass as tenant pass, or
`NOT_RUN` as PASS.
