# Multi-project control plane

The multi-project control plane runs one fixed, local check for each declared
synthetic project. It does not authenticate, import, publish, enable, run, or
modify a Power Automate or Power Platform tenant.

## First use

Start from the fixture manifest:

```text
examples/multi-project-workspace/workspace.manifest.json
```

The manifest is intentionally inside the workspace so its paths have one
unambiguous root. Its registry path must be exactly
`knowledge/self-improvement/registry.json`; project roots are relative to the
same directory. Run the compiled controller from the repository root:

```text
node packages/cli/dist/bin/spflow.js workspace check --manifest examples/multi-project-workspace/workspace.manifest.json --format json
```

The checked-in example has two required GREEN projects, `green-a` and
`green-b`. Their dependency-free `npm run check` commands provide only
`LOCAL_SYNTHETIC` evidence.

## Read the result

The report contains one registry result, an independently reported result for
each project, and an aggregate summary.

- `PASS`: the registry audit passed and the project's fixed check exited zero.
- `FAIL`: that project's fixed check exited non-zero. Other projects still run
  and remain visible; a GREEN project never masks a required RED project.
- `NOT_RUN`: the project root is unavailable, or the registry gate blocked all
  checks. Optional `NOT_RUN` projects remain visible without failing a passing
  required set.
- Registry `FAIL`: the controller fail-closes before project checks. Resolve
  the registry audit and rerun; do not treat prior project results as current.

The aggregate is PASS only when the registry audit passes and every required
project passes. A workspace run never upgrades its evidence to
`PROVIDER_TENANT`, `HOSTED`, or `UAT`.

## Govern shared lessons

The fixture registry is revision 1, has a digest sidecar, and contains no
candidates. It is a self-contained example of the canonical registry layout.
The repository-wide registry remains independently governed; an unresolved
candidate there intentionally blocks the controller before any project check
starts.

Capture a new reusable finding only as sanitized synthetic-public evidence:

```text
RED -> candidate -> GREEN -> positive control -> independent review -> promotion
```

Do not copy project-private paths, tenant values, credentials, mailboxes, or
provider output into a candidate. Only an independently approved lesson may
be consumed as a global instruction. Provider, hosted, and UAT evidence stays
with the originating project and must be captured through that project's own
authorized workflow.
