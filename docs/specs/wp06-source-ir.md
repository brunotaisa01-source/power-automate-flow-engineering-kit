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
pagination, and structured OData URL construction. Network calls must use the
explicit global form `globalThis.fetch`; an identifier named `fetch`, including
a locally shadowed function, is unsupported. Pagination and OData recognition
accept only the documented direct statement sequence, so inserted branches,
breaks, returns, or alternate data flow fail closed. The recognizer is not a
general JavaScript control-flow proof. Unsupported source produces no
derivation.

## Definition And Package Authority

Every declared definition is read from its exact repository-relative path,
parsed as JSON, and passed to the existing flow normalizer. A minimal or
unrelated definition does not produce WP-06 derivations. Structural action
roles select candidates but never authorize them. The adapter checks normalized
connector method, concrete SharePoint REST URI, connector parameters, request
payload metadata, non-wildcard ETag source, guard expression, successful
`runAfter`, and true-branch dominance. Security-relevant endpoints must be
relative canonical `/_api/` paths with exact query identities; absolute,
suffixed, duplicate-query, encoded-separator, and no-op wrapper forms fail
closed. Contract values are comparison targets. A role label, unrelated
property, parameter-only claim, no-op URI, or JSON enumeration order is
insufficient.

The executable builder profile emits all six sections: `authorityChecks`,
`permissionModels`, `permissionProbes`, `fieldOperations`,
`httpClassifications`, and `indexPlans`. Field operations require a GET whose
status feeds explicit FOUND and MISSING conditions. FOUND performs exact
property comparisons and never creates. MISSING alone may create, and that path
must perform a post-write GET plus exact readback assertion. Every other status
terminates failed. The current profile emits the bounded MISSING/create case as
local structural evidence; it does not claim a tenant response was observed.

Index plans read the complete `Indexed eq true` set, assert an exact sorted
current state, and bind that response plus the required set into the plan
digest. APPLY plans execute sorted removals before contract-ordered additions,
use serial writes, and assert the complete index set after each operation and
at completion. A compatible current set emits `NO_OP` with zero writes. Role
labels and parameter declarations cannot supply current state. Permission
models require principal and role
resolution, an executable `addroleassignment` call, role-assignment readback,
and a fail-closed dependent assertion. Permission probes require the
effective-permission request and a fail-closed dependent assertion over the
four operation booleans. HTTP facts require a response-dependent 400/404
decision tree with explicit result actions; literal tautologies are rejected.

The current authorization grammar requires target fields with logical names
`owner` and `amount`. Their internal names must be included in
`command.serverReadFields`, selected by the exact target GET, and consumed by
the reachable authorization guard. The adapter does not mint owner or amount
authority for absent or unread fields.

The compiled CLI supports two scopes. `validate rules --root <repository>`
validates every shipped local rule. Adding `--required-only` validates only the
exact IDs in `verification.requiredRuleIds`; that bounded result is not a
global rule-catalog PASS.

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
and change window. Offline verification reads the target contract's required
rule IDs and the shipped rule catalogs. Every required catalog whose residual
claim class is `LIVE_SMOKE` produces a rule-specific `LIVE_SMOKE_NOT_RUN` gate.
These entries record missing runtime evidence; they do not convert local static
evidence into runtime evidence.

## Public Trust API

The package does not export the derivation module, evidence-inspector factory,
or graph attachment module. Public CLI loading calls
`inspectTrustedProjectArtifacts(root, contract)`, which performs the complete
raw-artifact inspection, derivation, and attachment sequence internally. It
does not accept caller-supplied `adapterEvidence`.

## Claim Boundary

Adapter-derived GREEN is local evidence only. It does not establish tenant
discovery, import, connection rebinding, enablement, execution, mutation,
semantic readback, effective permissions, or publication. Those gates require
separate authenticated evidence and remain `NOT_RUN` during offline validation.
