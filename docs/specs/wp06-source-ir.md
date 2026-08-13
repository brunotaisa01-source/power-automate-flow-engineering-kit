# WP-06 Trusted Source Adapters

## Purpose

WP-06 rules do not trust repository-authored normalized evidence, source IR,
projection JSON, adapter names, or evidence bindings. Production authority
starts only when `@spflow/package-adapters` parses an actual raw artifact in
the same repository graph and emits an exact adapter derivation.

The legacy profiles `spflow.frontend-source-ir-v1` and
`spflow.power-automate-source-ir-v1` remain non-authoritative fixtures for
demonstrating normalization behavior. They cannot create trusted graph nodes or
authorize a CLI PASS.

## Adapter Profiles

- `spflow.frontend-source-v2`: parses supported JavaScript or TypeScript from a verified frontend inventory.
- `spflow.power-automate-definition-v2`: normalizes the exact declared exported flow definition and derives only structurally supported facts.

Adapter IDs and versions are emitted by executable code. No repository field
can select an adapter or upgrade an ordinary artifact to trusted evidence.

Each successful derivation binds:

```ts
interface Wp06AdapterDerivation {
  adapterId:
    | "spflow.frontend-source-v2"
    | "spflow.power-automate-definition-v2";
  adapterVersion: 2;
  contractRevision: number;
  sourceKind: "frontend" | "builder";
  section: Wp06EvidenceSection;
  sourceArtifactPath: string;
  sourceArtifactSha256: string;
  sourceArtifactBytes: number;
  facts: readonly unknown[];
}
```

## Trusted Graph Lineage

Core repository discovery creates ordinary raw nodes only. After successful
adapter inspection, the CLI adds immutable derived nodes and these exact edges:

```text
adapter projection --derives-from------> parsed raw source
adapter evidence ---derives-from-------> parsed raw source
adapter evidence ---matches-projection-> adapter projection
adapter evidence ---verifies-contract--> project contract
```

The trusted profiles are `wp06-adapter-projection-v2` and
`wp06-adapter-evidence-v2`. Paths, kinds, profiles, SHA-256 values, and byte
lengths must agree. Exactly one adapter derivation may exist for a source kind
and section; multiple parser-accepted sources are ambiguous and fail closed.
Edges named in caller-authored metadata are never created as trust edges.

## Frontend Inventory

The frontend root must contain exactly one strict
`spflow.frontend-bundle-v2` manifest. It declares:

```json
{
  "artifactProfile": "spflow.frontend-bundle-v2",
  "artifactRevision": 2,
  "contractRevision": 2,
  "entrypoint": "index.js",
  "files": [
    { "path": "index.js", "sha256": "<64 lowercase hex>", "bytes": 512 }
  ],
  "sources": ["index.js"]
}
```

Validation enumerates the real directory. The manifest itself is excluded from
the deployable inventory. Every other regular file must appear exactly once,
with the exact relative path, positive byte length, and SHA-256. The entrypoint
must exist, every source must be an inventory member, and missing, extra,
duplicated, escaping, or mismatched entries fail closed.

Only exact source files from a valid inventory are parsed. Supported source
structure currently covers explicit conflict-safe Save, guarded continuation
pagination, and structured OData URL construction. Unsupported source produces
no derivation.

## Definition And Package Authority

Every declared definition is read from its exact repository-relative path,
parsed as JSON, and passed to the existing flow normalizer. A minimal or
unrelated definition does not produce WP-06 derivations. Structural action
roles are checked together with normalized connector type, HTTP method, action
order, successful `runAfter` lineage, and required contract tokens; a role
label or JSON enumeration order alone is insufficient.

A required ZIP is always read as bytes and opened by the safe solution adapter.
The adapter validates archive safety, XML, inventory, workflow JSON, and
normalized actions. JSON text under a `.zip` filename is invalid. Where ZIP is
required, the directly normalized definition and safely inspected packaged flow
must have the same normalized digest. The package manifest binds the real ZIP
path, byte length, and SHA-256.

## HTTP Response Boundary

Static definition parsing can prove response-handling structure and selected
400/404 classification branches. It cannot prove a response value observed in
a tenant. A body object in source IR, projection JSON, or evidence JSON cannot
authorize `FOUND`, even when it looks schema-valid.

`FOUND` requires a future separately authenticated runtime evidence record
bound to an actual response artifact, expected contract schema, target binding,
and change window. Until that adapter exists, offline validation fails closed
for `FOUND` and retains the residual `LIVE_SMOKE` gate.

## Claim Boundary

Adapter-derived GREEN is local evidence only. It does not establish tenant
discovery, import, connection rebinding, enablement, execution, mutation,
semantic readback, effective permissions, or publication. Those gates require
separate authenticated evidence and remain `NOT_RUN` during offline validation.
