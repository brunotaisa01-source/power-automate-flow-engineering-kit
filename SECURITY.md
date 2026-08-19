# Security Policy

## Scope

This repository validates synthetic SharePoint and Power Automate project artifacts offline. It does not connect to a SharePoint tenant, import a solution, rebind a connection, enable a flow, execute a flow, mutate tenant data, or publish an artifact.

## Reporting

Please report security issues through a private GitHub security advisory or a private maintainer channel. Do not open a public issue containing credentials, tenant URLs, personal data, mailbox content, exported production packages, or raw connector payloads.

## Required Controls

- Keep credentials and tenant-specific bindings outside the repository.
- Use synthetic values in contracts, fixtures, examples, and test output.
- Treat local validation, package inspection, runtime evidence, tenant evidence, and publication evidence as separate claim classes.
- Treat downloaded packages and XML as untrusted input. Apply archive limits, path safety, duplicate checks, XML safety, and deterministic diagnostics.
- Never infer tenant success from a local build, a successful import, a flow run, or a synchronized folder alone.
- Keep destructive operations dry-run by default and require an explicit plan, bounded writes, approval, stop-on-unexpected behavior, audit, compensation, and semantic readback.
- No public CLI command, skill, plugin, or current integration changes a tenant, list, flow, permission, or production artifact. A write-capable MCP is out of scope.
- Treat operation-specific Save, OData, and pagination endpoint grammars as separate contract-bound boundaries; reject traversal, substitutions, and wrong resources before network I/O.
- Treat `FOUND`, `MISSING`, and `FAILED` as response-bound states. A status/body token, contract metadata, or native-looking projection is not a runtime observation.
- Require exact ETag/`IF-MATCH`, status checks before body parsing, and semantic readback for writes. Index changes require remove-before-add or zero-write `NO_OP`; permission claims require assignment and effective-permission readback.
- Treat self-improvement as a versioned connector-agnostic Power Automate/Power Platform registry. Candidates are sanitized and blocked; only executable RED/GREEN/positive-control evidence with independent approval may become global instructions. Verify the registry digest and never promote a lesson through an MCP.

## Evidence and release gates

The repository separates `LOCAL_STATIC`, `LOCAL_PACKAGE`, `COMPILED_CLI`,
`RUNTIME_SYNTHETIC`, tenant read-only/preflight/import/rebind/enable/execute/readback
states, `TENANT_MUTATED`, `PUBLISHED`, and `PUBLISHED_READBACK`. Local or package
GREEN never promotes to tenant or publication GREEN. Missing runtime, tenant,
publication, rollback, or scanner evidence remains `NOT_RUN`; it is never renamed
PASS.

Before public release, run the history-aware public-data scanner when available,
perform a human privacy/IP review, inspect the exact final artifacts, and keep
all tenant evidence in an approved private evidence store. A controlled tenant
test requires explicit authorization, discovery/read-only preflight first, a
synthetic target, explicit rebind/enable/readback, and documented rollback.
