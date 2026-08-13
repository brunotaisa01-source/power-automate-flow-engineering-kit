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
