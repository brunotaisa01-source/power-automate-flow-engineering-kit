# WP-06 Source IR

## Purpose

WP-06 rules do not trust hand-authored normalized evidence. They consume a
strict JSON source intermediate representation, run a code-selected adapter,
and compare the deterministic projection with exactly bound evidence.

This IR is the boundary between future parsers and the rule engine. A parser
for frontend source, exported Power Automate definitions, or package contents
must build this IR from the inspected artifact. Supplying an allowed adapter
name inside input JSON has no authority.

## Profiles

- `spflow.frontend-source-ir-v1`: Save transactions, guarded pagination, and OData request construction.
- `spflow.power-automate-source-ir-v1`: Authority order, ACL plans/readbacks, schema operations, HTTP outcomes, and index transactions.

Every document has exact keys:

```json
{
  "sourceIrProfile": "spflow.frontend-source-ir-v1",
  "sourceRevision": 1,
  "contractRevision": 2,
  "section": "saveTransactions",
  "model": {}
}
```

The `model` schema is section-specific. Unknown keys, duplicate semantic
records, invalid types, and a section that does not belong to the selected
profile fail closed. The adapter derives normalized field names and values;
the source model is not a renamed `facts` array.

## Graph Lineage

For each accepted source IR artifact, the core graph builder creates a virtual
`projection` node from canonical JSON bytes. The required lineage is:

```text
derived projection --derives-from--> raw source IR
evidence ----------derives-from----> raw source IR
evidence ----------matches-projection--> derived projection
evidence ----------verifies-contract---> project contract
```

All source, projection, and contract paths, profiles, kinds, SHA-256 digests,
and byte lengths must match. Rule validation re-runs the adapter over the raw
source IR and compares the result with both projection and evidence.

## Frontend Bundle

`spflow.frontend-bundle-v1` is a strict final-artifact manifest containing a
contract revision, entrypoint, exact file inventory, and exact source
path/SHA-256/byte bindings. A required frontend final artifact passes only when
the graph connects the same bound source and contract to this bundle.

## Builder Final Artifacts

A required generated definition must be declared by the project contract,
generated from the bound builder source, and contain non-empty trigger and
action structures. A required package is accepted through one of two explicit
paths:

- the public synthetic package IR has exact `packageId`, unique `flowIds`, and
  unique `inventory` values that cover every contracted flow definition; or
- the safe solution adapter inspected the exact ZIP path, SHA-256, and byte
  length and returned a valid flow inventory matching the package contract.

In both cases, the definition-to-ZIP package edge and contract-to-ZIP declaration
edge are required. The matching manifest must identify the exact ZIP path,
SHA-256, and byte length. A connected node with arbitrary JSON does not satisfy
the final-artifact requirement.

## Current Boundary

The repository currently provides executable IR-to-evidence adapters. It does
not claim arbitrary JavaScript, TypeScript, Power Automate WDL, or native ZIP
parsing into WP-06 semantic source IR. Existing package adapters continue to
inspect supported solution artifacts and can supply exact package evidence to
the WP-06 final-artifact gate. Adding a real-source
parser requires new RED fixtures proving that source changes alter the emitted
IR and downstream rule result.
