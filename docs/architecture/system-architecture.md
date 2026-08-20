# System Architecture

## 1. Purpose

The Power Automate Flow Engineering Kit is an offline-first, connector-neutral engineering and validation system for building browser applications and Power Automate/Power Platform flows across SharePoint, Excel, Power Apps, Dataverse, Outlook, Graph, HTTP, SQL, approvals, and future connectors. SharePoint Lists and Power Automate form the current executable reference profile; they are not the product limit. The system defines how an app reads state, submits commands, applies authorized transitions, packages flows, proves local behavior, and advances through tenant release gates.

The repository is not a tenant administration tool and does not contain environment credentials, exported operational packages, or live tenant data.

## 2. Runtime Baseline

- Node.js: `>=22.0.0 <23.0.0`
- npm: `>=10.0.0 <11.0.0`
- TypeScript: strict mode, ECMAScript modules, target `ES2022`
- Test runner: Node.js built-in `node:test`
- JSON Schema: draft 2020-12 through Ajv
- ZIP reading: lazy entry traversal with size, count, nesting, path, and compression-ratio limits
- Network: forbidden during `spflow verify --offline`

The lockfile is the dependency authority. CI rejects an uncommitted lockfile change.

## 3. Repository Components

| Component | Responsibility | Must not do |
|---|---|---|
| `contracts/` | Machine-readable JSON Schemas | Contain tenant values |
| `rules/catalog/` | One normalized rule document per rule ID | Embed detector implementation |
| `fixtures/rules/` | Synthetic RED and GREEN artifacts plus expected diagnostics | Contain copied private artifacts |
| `packages/core/` | Types, schema loading, canonical JSON, diagnostic aggregation, `ArtifactGraph` | Read network or tenant state |
| `packages/cli/` | `spflow` argument parsing, command dispatch, output, exit code | Implement rule logic |
| `packages/package-adapters/` | Safe ZIP traversal and supported Power Automate profile parsing | Import or execute flows |
| `packages/rules/` | Deterministic detectors over normalized artifacts | Mutate inspected artifacts |
| `templates/` | Synthetic project starters | Claim tenant readiness |
| `examples/` | End-to-end synthetic reference application | Use real identifiers |
| `skills/` | Agent-neutral workflows that call contracts and CLI | Restate rules inconsistently |
| `tests/` | Unit, rule, artifact, integration, mutation, and adversarial tests | Depend on a live tenant for core verification |
| `evidence/` | Local verification records for public toolkit releases | Promote local results to tenant claims |

## 4. ArtifactGraph

All validators project inputs into one immutable graph:

```text
ProjectContract
  -> SharePointSchema
  -> FrontendContract
  -> FlowContract
  -> BuilderSource
  -> GeneratedDefinition
  -> FinalZip
  -> ArtifactManifest
  -> Documentation
  -> EvidenceClaims
```

Every node has:

```ts
interface ArtifactNode {
  id: string;
  kind: ArtifactKind;
  relativePath: string;
  digest: string;
  sourceProfile: string;
  data: unknown;
}

interface ArtifactEdge {
  from: string;
  to: string;
  relation: "declares" | "generates" | "packages" | "hashes" | "documents" | "supports";
}
```

Paths are repository-relative POSIX paths. Absolute paths are never emitted. Nodes are sorted by `(kind, relativePath, id)` before validation and output. A shared value such as a field internal name, state, index, connection reference, action count, package inventory, or digest must agree across every graph projection.

## 5. Application Reference Architecture

### 5.1 Read path

1. The browser uses the existing Microsoft 365 session. It stores no client secret.
2. It requests only fields declared in `readAllowlist`.
3. It URL-encodes OData literals and query parameters.
4. It follows continuation links until exhaustion for complete queries.
5. It accepts an operation-specific collection or continuation URL only when scheme, host, exact contract-bound site path, and exact list resource match the original request; `/fields`, `/items`, extra descendants, sibling prefixes, and resource substitutions fail closed.
6. It treats loaded records as authoritative snapshots with exact ETags.

### 5.2 Default write path: typed command queue

```text
Browser -> append command -> SharePoint command list
        -> Power Automate trigger -> claim command atomically
        -> re-read server identity, capability, scope, target, state, ETag
        -> validate transition -> mutate protected list
        -> append audit -> semantic readback -> complete command
        -> browser reloads authoritative state
```

The browser may provide a requested action and trace correlation ID. It may not provide authoritative actor identity, capability, scope, amount, protected status, ownership, or other protected business values.

### 5.3 Direct patch exception

Direct patch is allowed only when all changed fields are declared `clientEditable: true`. The browser performs explicit Save, obtains a transaction-specific request digest, sends a minimal allowlisted patch using HTTP `POST` with `X-HTTP-Method: MERGE`, supplies exact `IF-MATCH`, handles HTTP 412 as a conflict, and performs semantic GET readback. An ambiguous write is reconciled by GET and is never blindly replayed.

### 5.4 Operation-specific endpoint authority

Save, OData, and pagination use separate exact endpoint grammars derived from the
contract origin, site path, and list path. Raw and encoded traversal/separators
are rejected before URL normalization. The static frontend adapter accepts only
the closed source inventory whose AST proves those same helpers, and the bundle
manifest binds the real source digest and byte length.

## 6. CLI Boundary

The CLI is read-only with respect to inspected artifacts and all tenants.

```text
spflow validate contract <project.contract.json>
spflow validate rules --root <repository>
spflow validate artifact <path> --contract <project.contract.json>
spflow evidence validate <evidence.json>
spflow scan public-data <path> [--history]
spflow learn audit <registry-path>
spflow verify --root <repository> --offline
```

All commands support `--format text|json`; CI uses JSON. The global command validates contracts, rule catalog, fixtures, detector mutation controls, generated definitions, final ZIPs, manifests, public-data policy, documentation consistency, and evidence claims.

### 6.1 Global self-improvement gate

`spflow learn audit` is read-only. It validates the versioned connector-agnostic
lesson registry, binds RED/GREEN/positive-control tests and independent review
records to real repository files, rejects private markers and open candidates,
and never writes a lesson or tenant. Offline `verify` runs the audit automatically
when the repository contains `knowledge/self-improvement/registry.json`.

A future plugin or read-only MCP may expose registry metadata and approved lessons
only. It has no create, update, approve, promote, import, enable, trigger,
permission, or tenant-mutation operation.

### 6.2 Diagnostic contract

```ts
interface Diagnostic {
  ruleId: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  artifactPath: string;
  jsonPointer?: string;
  expected?: unknown;
  actual?: unknown;
  remediation: string;
  residualGate?: string;
}

interface CommandReport {
  schemaVersion: "1.0";
  command: string;
  result: "PASS" | "FAIL" | "NOT_RUN";
  exitCode: number;
  diagnostics: Diagnostic[];
  summary: { errors: number; warnings: number; info: number; notRun: number };
}
```

Diagnostics are sorted by `(severity, ruleId, artifactPath, jsonPointer, code)`. Timestamps, random IDs, machine names, absolute paths, and environment values are excluded from deterministic output.

### 6.3 Exit statuses

| Code | Meaning |
|---:|---|
| `0` | All requested applicable checks passed |
| `1` | One or more rule or consistency violations |
| `2` | Invalid command, missing required argument, or unreadable configuration |
| `3` | Unsupported contract or package profile |
| `4` | Unsafe archive shape, traversal, size, count, nesting, or compression ratio |
| `5` | Public-data or secret policy violation |
| `6` | Invalid or unsupported evidence claim |
| `7` | Internal CLI error |
| `8` | An explicitly requested external gate was unavailable or unauthorized |

`--offline` reports tenant residual gates as `NOT_RUN` without returning `8`. Code `8` is used only when the caller explicitly requests an external operation. If multiple categories occur, precedence is `7, 4, 5, 6, 3, 2, 1, 8, 0`.

## 7. Determinism and Safety

- No network, clock, locale, or machine-specific input may affect offline validation.
- JSON is canonicalized with UTF-8, sorted object keys, stable arrays where order is not semantic, and LF endings.
- ZIP entry names are normalized before use; absolute paths, drive prefixes, `..`, NUL, links, devices, and duplicate normalized paths are rejected.
- Nested archives are scanned recursively within fixed limits.
- Inspectors open final artifacts read-only and never repair them in place.
- Environment bindings are loaded only from an explicitly supplied file outside the repository or from named environment variables. Values are redacted from output.

## 8. Trust Boundaries

1. **Public repository boundary:** only synthetic content may cross into Git history or release artifacts.
2. **Browser boundary:** the browser is untrusted for identity and protected business authority.
3. **SharePoint boundary:** list schema, ETag, system identity, and effective permissions require authenticated readback.
4. **Flow boundary:** a saved definition or successful run status does not prove semantic effect.
5. **Package boundary:** builder source and generated definition do not prove final ZIP content.
6. **Tenant boundary:** local verification cannot assert import, rebind, enablement, execution, mutation, or readback.

## 9. Extension Boundaries

### Codex plugin

The plugin may expose validated skills and local CLI commands. It receives no tenant credentials and adds no alternate validators.

### Read-only MCP

A future MCP may expose schema discovery, flow metadata, run metadata, and semantic readback. It must use minimum scopes, return redacted structured data, maintain an operation allowlist, and have no create, update, delete, import, enable, trigger, or permission-changing tools.

## 10. Architecture Completion Criteria

The core architecture is implemented only when:

- `spflow verify --root . --offline --format json` is the single global verification entry point;
- every supported rule has RED, GREEN, expected diagnostics, mutation control, and final-artifact coverage;
- the final ZIP is independently parsed and compared to its contract and manifest;
- public-data scanning covers the working tree, nested archives, generated output, release artifacts, and Git history;
- evidence validation rejects every unsupported claim promotion;
- a clean-context AI can build the synthetic reference app and diagnose seeded failures without private context.

