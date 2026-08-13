# Rule Model Specification

## 1. Purpose

A rule turns one known engineering failure into a deterministic, reusable control. A rule is not complete because its prose exists or its unit function passes. It is complete only when a synthetic RED artifact fails for the exact reason, a GREEN artifact passes, independent controls prevent overfitting, mutation reintroduces the failure, and the final generated/importable artifact is inspected where applicable.

## 2. Locations

```text
rules/catalog/<RULE-ID>.json
fixtures/rules/<RULE-ID>/
  red/
  green/
  controls/positive/
  mutation.json
  expected.json
```

- One catalog file and one canonical fixture directory are REQUIRED per rule ID.
- Artifact filenames under `red/` and `green/` MUST match unless the expected inventory itself is under test.
- Fixtures MUST be synthetic and pass the public-data policy.
- Additional cases use `fixtures/rules/<RULE-ID>/cases/<case-id>/` with the same layout.

## 3. Rule JSON Contract

```ts
interface RuleDefinition {
  schemaVersion: "1.0";
  id: string;
  title: string;
  domain:
    | "application"
    | "sharepoint"
    | "power-automate"
    | "package"
    | "release"
    | "data";
  severity: "error" | "warning";
  description: string;
  rationale: string;
  appliesTo: ArtifactSelector[];
  detector: DetectorContract;
  red: FixtureExpectation;
  green: FixtureExpectation;
  finalArtifact: FinalArtifactRequirement;
  remediation: string[];
  residualGate: ResidualGate;
  supportedEvidence: EvidenceClass[];
  tags: string[];
}

interface ArtifactSelector {
  kind: "contract" | "schema" | "frontend" | "builder" | "definition" | "zip" | "manifest" | "documentation" | "evidence";
  profile?: string;
  pathPattern?: string;
}

interface DetectorContract {
  implementation: string;
  exportName: string;
  input: "artifact-node" | "artifact-graph";
  deterministic: true;
  network: "forbidden";
  parameters: Record<string, string | number | boolean>;
}

interface FixtureExpectation {
  root: string;
  expectedResult: "PASS" | "FAIL";
  expectedDiagnosticCodes: string[];
}

interface FinalArtifactRequirement {
  required: boolean;
  artifactKinds: Array<"generated-definition" | "zip" | "frontend-bundle" | "manifest">;
}

interface ResidualGate {
  required: boolean;
  claimClass?: EvidenceClass;
  description?: string;
}
```

Unknown properties are rejected. `implementation` is a repository-relative module path under `packages/rules/src/`; rule JSON cannot execute arbitrary code.

## 4. Expected Fixture Contract

`expected.json`:

```ts
interface ExpectedFixtureResult {
  schemaVersion: "1.0";
  ruleId: string;
  red: ExpectedRun;
  green: ExpectedRun;
  positiveControl: ExpectedRun;
  mutation: MutationExpectation;
}

interface ExpectedRun {
  result: "PASS" | "FAIL";
  diagnostics: Array<{
    code: string;
    artifactPath: string;
    jsonPointer?: string;
    messageContains: string;
  }>;
}

interface MutationExpectation {
  source: "green";
  recipe: string;
  result: "FAIL";
  diagnosticCode: string;
}
```

`mutation.json` uses a bounded declarative mutation language:

```ts
type MutationOperation =
  | { op: "json-set"; path: string; pointer: string; value: unknown }
  | { op: "json-delete"; path: string; pointer: string }
  | { op: "text-replace"; path: string; exact: string; replacement: string; count: number }
  | { op: "zip-add"; path: string; entry: string; source: string }
  | { op: "zip-delete"; path: string; entry: string };
```

The mutation runner rejects absolute paths, traversal, wildcards, regex replacement, shell commands, network access, and writes outside an isolated temporary directory.

## 5. Mandatory RED -> GREEN -> REFACTOR Cycle

For each rule and each implementation work package:

### RED

1. Add the catalog contract and synthetic RED fixture.
2. Add an exact expected diagnostic and artifact pointer.
3. Run the narrow test and observe failure because the detector is absent or does not detect the RED.
4. Record only the command and normalized result; do not claim tenant behavior.

### GREEN

1. Implement the smallest detector or behavior that satisfies the contract.
2. Require the RED fixture to emit exactly the expected rule diagnostic.
3. Require GREEN and positive-control artifacts to pass.
4. Apply `mutation.json` to GREEN and require the diagnostic to return.
5. Inspect generated definition and final ZIP when `finalArtifact.required` is true.

### REFACTOR

1. Remove duplication and normalize interfaces without weakening the detector.
2. Re-run narrow rule tests and the full offline verification command.
3. Require stable diagnostics, no snapshot churn, and no additional public-data finding.
4. Obtain the work-package review gate before the next package begins.

A test that never demonstrated RED is not accepted as a regression test.

## 6. Rule Acceptance

A rule is accepted only when all are present:

- stable rule ID and catalog record;
- synthetic RED fixture;
- exact expected diagnostic;
- GREEN fixture;
- independent positive control;
- detector mutation test;
- generated-definition test when relevant;
- exact final-ZIP or frontend-bundle test when relevant;
- remediation instructions;
- supported evidence class;
- tenant residual gate where static analysis is insufficient;
- public-data scan over every fixture and generated test artifact.

## 7. Required Public Rule Catalog

### 7.1 Known RED/GREEN rules

| Rule ID | RED condition | GREEN requirement | Residual gate |
|---|---|---|---|
| `PKG-NATIVE-001` | Native envelope missing/extra/misplaced entry | Exact profile-derived ZIP inventory | Disabled tenant import |
| `PA-LIMIT-001` | Action count exceeds contract/profile budget | Bounded graph or separated processor within budget | Platform import |
| `SP-AUTHZ-001` | Client controls protected business value | Processor re-reads server-authoritative values | Live tamper attempt |
| `SP-ACL-001` | Capability has no explicit scope | Active capability plus target scope | Effective-permission test |
| `RELEASE-EVIDENCE-001` | Evidence claims an unsupported class | Claim bounded to exact supported class | Required tenant gates |
| `PA-EXPRESSION-001` | Unsafe quoted JSON interpolation | Structured expression-safe serialization | Controlled special-character run |
| `APP-SAVE-001` | Concurrent saves share a digest or use wildcard ETag | Digest per transaction and exact ETag | Concurrent tenant saves |
| `PA-CONNECTOR-001` | Connector method is `MERGE` | `POST` with `X-HTTP-Method: MERGE` | Controlled tenant mutation |
| `SP-SCHEMA-001` | View uses invalid/unconfirmed field binding | Confirmed internal binding | View readback |
| `SP-SCHEMA-002` | Field/index payload lacks required `SP.Field` metadata | Typed endpoint-compatible payload | Index readback |
| `PA-SCOPE-001` | `Terminate` has loop ancestry | Termination after loop or loop-safe flag path | Import and failure-path run |
| `SP-ODATA-001` | OData literal or query is not encoded | Escaped literal and structured URL construction | Special-character tenant query |
| `SP-SCHEMA-003` | Code assumes internal name from display name | Read and use `EntityPropertyName` | Schema readback |
| `PKG-INTEGRITY-001` | Manifest digest/inventory is stale | Recomputed manifest from exact release bytes | None beyond release review |
| `META-CONSISTENCY-001` | Save mode differs across contract, code, and docs | One explicit Save/direct-patch contract | Browser smoke |
| `META-CONSISTENCY-002` | Status set differs across schema, code, flow, or test | One state-machine projection | Live transition tests |
| `HTTP-SEMANTIC-001` | Any HTTP 400 is treated as missing | Missing-column semantic signature only; other 400 is `GET_FAILED` | Connector response readback |
| `HTTP-SEMANTIC-002` | Preflight 404 tolerance leaks into Apply/readback | Explicit initial Preflight allowance only | Preflight and Apply readback |
| `SP-INDEX-001` | Index add occurs before required removal | Serial remove-before-add plan | Tenant index readback |
| `SP-INDEX-002` | Compatible index state still writes | Exact compatible state is `NO_OP` | Repeated tenant preflight |
| `META-CONSISTENCY-003` | Contract index policy differs from schema/builder/ZIP | ArtifactGraph equality across all projections | Tenant schema readback |
| `RELEASE-EVIDENCE-002` | Local GREEN is promoted to tenant verification | Claim remains local/package only | Authorized tenant operation |
| `FLOW-RETRY-001` | Ambiguous mutation is replayed blindly | GET reconciliation before any safe replay | Fault-injected live run |
| `FLOW-STATUS-001` | Run/connector success occurs without semantic effect | Declared semantic readback before completion | Controlled mutation |
| `APP-PAGINATION-001` | KPI/export/dedupe uses first page only | Exhaust continuation with loop/same-origin guards | Large tenant list |
| `FLOW-DESTRUCTIVE-001` | Destructive mutation lacks bounds or approval | Dry run, plan digest, limits, approval, readback | Authorized canary |
| `SP-AUTHZ-002` | Client actor grants authority | Authenticated server identity only | Separate-user test |
| `DATA-PUBLIC-001` | Public text/artifact contains private data | Synthetic values/placeholders only | Human privacy/IP review |

### 7.2 Required baseline rules

| Rule ID | Condition detected | GREEN requirement |
|---|---|---|
| `PKG-ARCHIVE-001` | Unsafe ZIP path, duplicate, size, count, ratio, encryption, or XML entity | Bounded safe archive |
| `PA-GRAPH-001` | Missing predecessor or transitively unreachable required action | Complete reachable graph |
| `PA-GRAPH-002` | Cycle or unsatisfiable `runAfter` path | Acyclic satisfiable graph |
| `PA-WDL-001` | Invalid WDL syntax/reference | Parsed, path-valid expressions |
| `PA-CONNECTION-001` | Missing, implicit, or inconsistent connection reference | Declared transitive reference set |
| `FLOW-IDEMPOTENCY-001` | Empty key or incomplete `0/1/many` behavior | Deterministic key and explicit cardinality handling |
| `SP-ACL-002` | Browser can update/delete queue or protected state | Least-privilege operation matrix |
| `DATA-PUBLIC-002` | Private data exists in nested archive/history/generated output | Recursive clean scan |

## 8. Diagnostic Requirements

- One primary violation emits one primary diagnostic. Cascading diagnostics are suppressed when a parse failure prevents sound analysis.
- Messages state observed fact, expected contract, and remediation.
- Paths are repository-relative and normalized.
- Actual private values are never echoed; use `<redacted>` plus value category.
- Rules MUST be deterministic under reordered filesystem enumeration and locale changes.

## 9. Test Commands

Narrow rule:

```text
npm test -- --test-name-pattern="<RULE-ID>"
```

Rule corpus:

```text
spflow validate rules --root . --format json
```

Global gate:

```text
spflow verify --root . --offline --format json
```

Expected local exit is `0` only when all applicable rule contracts, fixture controls, generated artifacts, and public-data checks pass. Tenant residual gates remain `NOT_RUN` and are never rewritten as PASS.

