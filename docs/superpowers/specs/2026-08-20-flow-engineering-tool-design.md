# Flow Engineering Tool MVP Design

**Status:** Approved for implementation by the coordinator after the local kit and cross-platform CI gates passed.

## Goal

Turn the Power Automate Flow Engineering Kit into a portable local tool that can prepare, validate, inspect, and report on raw Power Automate definitions without requiring a tenant connection. The design keeps provider read-only integration as a separate future phase and never promotes local evidence to provider or UAT evidence.

## User outcome

An engineer on macOS, Windows, or Linux can install locked dependencies and run:

```text
npm ci
npm run check
spflow prepare flow <definition.json> --connections <connection-references.json> --format text
spflow validate flow <definition.json> --connections <connection-references.json> --format text
```

The output is deterministic, privacy-safe, and useful before import, rebinding, publication, or execution.

## Scope

### MVP included

- Raw Power Automate definition preparation using the existing `@spflow/core/flow-save` contract.
- Exact connection-reference resolution from an explicit local map.
- Recursive nested action coverage for `actions`, `else`, `default`, and `cases`.
- CLI text and JSON reports with stable exit codes and sanitized paths.
- Synthetic RED, GREEN, independent positive-control, and mutation tests.
- Existing native solution ZIP inspection and connector-profile validation exposed through one portable acceptance command.
- A local evidence report that labels claims as `LOCAL_SYNTHETIC` and keeps provider/UAT gates open.

### Explicitly excluded from the MVP

- Credentials, tenant URLs, raw production exports, mailbox data, or private identifiers.
- Direct tenant import, rebind, enablement, publication, mutation, or execution.
- Automatic selection of ambiguous connections.
- Claiming that a connected physical account proves a logical solution reference is valid.
- Writing to the global self-improvement registry without independent review.

## Architecture

```text
raw definition + explicit connection map
              |
              v
@spflow/core flow-save preparation
              |
              +--> prepared definition (stdout or explicit output file)
              +--> deterministic diagnostics
              v
CLI command report (text/json)
              |
              v
local evidence bundle with LOCAL_SYNTHETIC / NOT_VERIFIED boundaries
```

The core layer owns pure JSON transformations and error codes. The CLI layer owns argument parsing, file I/O, reporters, exit codes, and redaction. The test layer owns fixtures and RED/GREEN proof. No layer opens a tenant connection.

## Command contracts

### `spflow prepare flow`

Inputs:

- exactly one raw definition JSON path;
- `--connections <path>` containing an object keyed by connector alias;
- optional `--output <path>`; without it, the prepared JSON is returned in the report data;
- `--format text|json`.

Behavior:

- clones the input;
- removes only action-level `inputs.authentication`;
- preserves `host.connectionName` as the declared alias;
- sets `host.connectionReferenceName` from the exact declared logical name;
- fails closed on malformed JSON, missing host, missing alias, ambiguity, or missing logical name;
- never overwrites a file unless `--output` is explicitly provided.

### `spflow validate flow`

Runs the same preparation contract without writing an output file and reports whether the definition is save-ready locally. A valid local result still carries `claimClass=LOCAL_SYNTHETIC` and a provider gate of `NOT_VERIFIED`.

## Error model

- `2`: invalid CLI usage or missing input;
- `1`: rule/definition violation;
- `7`: unexpected internal error with redacted details;
- `8`: deferred external validator, never treated as PASS.

Diagnostics use stable rule IDs, relative artifact paths, JSON pointers where available, and remediation text. Raw values from bindings, URLs, email addresses, and identifiers are redacted.

## TDD and evidence contract

Every new behavior requires:

1. RED test that fails for the intended missing behavior;
2. GREEN implementation with the smallest correction;
3. independent positive control with a structurally different topology;
4. mutation/counterexample that restores RED;
5. focused test, full suite, build, `npm run check`, and privacy scan;
6. evidence documentation identifying local, provider, hosted, and UAT boundaries.

## Release gate

The MVP is ready only when the same commit has:

- local `npm run check` green;
- GitHub Actions matrix green on macOS, Ubuntu, and Windows;
- no high-severity dependency audit findings;
- no public-data/privacy violations;
- task reviews and final whole-branch review green;
- no unreviewed worker changes or undocumented handoffs.

## Future phases

1. Read-only tenant adapter that consumes an authenticated connector outside this public core and returns sanitized flow/solution readbacks.
2. Preview-token-bound update adapter with automatic backup, explicit confirmation, and post-save readback.
3. Publication/run/UAT orchestration with separate approvals and audit records.
4. Versioned npm/binary distribution and release artifacts.
