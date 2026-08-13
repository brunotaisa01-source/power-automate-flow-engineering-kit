import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ArtifactGraph,
  compareProjection,
} from "../../../packages/core/dist/artifact-graph.js";
import {
  createArtifactEdge,
  createArtifactNode,
  type ArtifactNode,
  type ProjectionKey,
} from "../../../packages/core/dist/artifact-node.js";
import { canonicalize } from "../../../packages/core/dist/canonical-json.js";

function node(
  kind: ArtifactNode["kind"],
  relativePath: string,
  sourceProfile: string,
  projections: Partial<Record<ProjectionKey, Readonly<Record<string, unknown>>>>,
): ArtifactNode {
  return createArtifactNode({
    kind,
    relativePath,
    sourceProfile,
    data: { layer: sourceProfile },
    projections,
  });
}

describe("ArtifactGraph", () => {
  test("records physical byte length for exact manifest comparison", () => {
    const node = createArtifactNode({
      kind: "definition",
      relativePath: "definitions/synthetic.json",
      sourceProfile: "normalized-flow-v1",
      data: { synthetic: true },
      bytes: Buffer.from("synthetic-bytes", "utf8"),
    });

    assert.equal(node.byteLength, 15);
  });

  test("deep-freezes nodes, node data, projections, and edges", () => {
    const contract = node("contract", "project.contract.json", "project-contract-v1", {
      states: { "case-state": ["Closed", "Open"] },
    });
    const definition = node("definition", "flows/process/definition.json", "normalized-flow-v1", {
      states: { "case-state": ["Closed", "Open"] },
    });
    const edge = createArtifactEdge({
      from: contract.id,
      to: definition.id,
      relation: "generates",
    });
    const graph = new ArtifactGraph([definition, contract], [edge]);

    assert.equal(Object.isFrozen(graph.nodes), true);
    assert.equal(Object.isFrozen(graph.edges), true);
    assert.equal(Object.isFrozen(contract), true);
    assert.equal(Object.isFrozen(contract.data), true);
    assert.equal(Object.isFrozen(contract.projections), true);
    assert.equal(Object.isFrozen(contract.projections.states), true);
    assert.equal(Object.isFrozen(edge), true);
    assert.throws(() => {
      (contract.data as { layer: string }).layer = "changed";
    }, TypeError);
  });

  test("sorts shuffled inputs into byte-identical deterministic output", () => {
    const contract = node("contract", "project.contract.json", "project-contract-v1", {});
    const definition = node("definition", "flows/process/definition.json", "normalized-flow-v1", {});
    const manifest = node("manifest", "artifacts/manifest.json", "artifact-manifest-v1", {});
    const edges = [
      createArtifactEdge({ from: definition.id, to: manifest.id, relation: "hashes" }),
      createArtifactEdge({ from: contract.id, to: definition.id, relation: "declares" }),
    ];

    const forward = new ArtifactGraph([contract, definition, manifest], edges);
    const reverse = new ArtifactGraph(
      [manifest, definition, contract],
      [...edges].reverse(),
    );

    assert.equal(canonicalize(forward.toJSON()), canonicalize(reverse.toJSON()));
    assert.deepEqual(
      forward.nodes.map(({ kind, relativePath }) => [kind, relativePath]),
      [
        ["contract", "project.contract.json"],
        ["definition", "flows/process/definition.json"],
        ["manifest", "artifacts/manifest.json"],
      ],
    );
  });

  test("compares every cross-layer projection key and emits stable diagnostics", () => {
    const referenceValues: Record<ProjectionKey, unknown> = {
      fields: [{ internalName: "Status", type: "Choice" }],
      indexes: [{ field: "Status", order: 1, required: true }],
      states: ["Closed", "Open"],
      "save-mode": "typed-command-queue",
      "connection-references": ["SHAREPOINT_CONNECTION"],
      "action-budget": 50,
      inventory: ["Workflows/process.json"],
      digests: { "artifacts/package.zip": "a".repeat(64) },
    };
    const contract = node("contract", "project.contract.json", "project-contract-v1", {
      fields: { cases: referenceValues.fields },
      indexes: { cases: referenceValues.indexes },
      states: { "case-state": referenceValues.states },
      "save-mode": { frontend: referenceValues["save-mode"] },
      "connection-references": { process: referenceValues["connection-references"] },
      "action-budget": { process: referenceValues["action-budget"] },
      inventory: { package: referenceValues.inventory },
      digests: { release: referenceValues.digests },
    });
    const drift = node("definition", "flows/process/definition.json", "normalized-flow-v1", {
      fields: { cases: [{ internalName: "CaseStatus", type: "Choice" }] },
      indexes: { cases: [{ field: "CaseStatus", order: 1, required: true }] },
      states: { "case-state": ["Closed", "Open", "Pending"] },
      "save-mode": { frontend: "direct-patch" },
      "connection-references": { process: ["OTHER_CONNECTION"] },
      "action-budget": { process: 40 },
      inventory: { package: ["Workflows/other.json"] },
      digests: { release: { "artifacts/package.zip": "b".repeat(64) } },
    });
    const graph = new ArtifactGraph([drift, contract], []);

    const keys = Object.keys(referenceValues).sort() as ProjectionKey[];
    const diagnostics = keys.flatMap((key) => compareProjection(graph, key));

    assert.deepEqual(
      diagnostics.map(({ code }) => code),
      [
        "META-CONSISTENCY-006",
        "META-CONSISTENCY-005",
        "META-CONSISTENCY-008",
        "META-CONSISTENCY-004",
        "META-CONSISTENCY-003",
        "META-CONSISTENCY-007",
        "META-CONSISTENCY-001",
        "META-CONSISTENCY-002",
      ],
    );
    assert.deepEqual(diagnostics, keys.flatMap((key) => graph.compareProjection(key)));
    assert.ok(diagnostics.every(({ path }) => path.startsWith("flows/process/definition.json#")));
  });

  test("rejects dangling edges and case-colliding artifact paths", () => {
    const contract = node("contract", "Project.contract.json", "project-contract-v1", {});
    const definition = node("definition", "project.contract.json", "normalized-flow-v1", {});

    assert.throws(() => new ArtifactGraph([contract, definition], []), /case collision/i);
    assert.throws(
      () => new ArtifactGraph(
        [contract],
        [createArtifactEdge({ from: contract.id, to: "missing", relation: "declares" })],
      ),
      /unknown node/i,
    );
  });
});
