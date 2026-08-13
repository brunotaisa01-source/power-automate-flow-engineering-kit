import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { buildArtifactGraph } from "../../packages/core/dist/artifact-graph.js";
import { canonicalize } from "../../packages/core/dist/canonical-json.js";
import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";

const contract = {
  schemaVersion: "1.0",
  project: {
    id: "synthetic-case-workbench",
    displayName: "Synthetic Case Workbench",
    description: "Synthetic graph fixture.",
    contractRevision: 1,
    dataClassification: "synthetic-public",
  },
  sharePoint: {
    siteUrlBinding: "SITE_URL",
    lists: [
      {
        id: "cases",
        fields: [
          {
            logicalName: "status",
            internalName: "Status",
            type: "Choice",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: false,
            sensitive: false,
            choices: ["Open", "Closed"],
          },
        ],
        indexes: [{ field: "Status", order: 1, required: true }],
      },
    ],
  },
  stateMachines: [
    {
      id: "case-state",
      listId: "cases",
      field: "Status",
      initial: "Open",
      terminal: ["Closed"],
      states: ["Open", "Closed"],
      transitions: [],
    },
  ],
  flows: [
    {
      id: "process-case",
      definitionPath: "flows/process-case/definition.json",
      trigger: "sharepoint-created",
      processorForCommandTypes: [],
      connectionReferences: ["SHAREPOINT_CONNECTION"],
      actionBudget: 50,
      concurrency: { enabled: true, degree: 1 },
      packageId: "synthetic-package",
    },
  ],
  packages: [
    {
      id: "synthetic-package",
      path: "artifacts/packages/synthetic-package.zip",
      profile: "power-platform-solution-v1",
      manifestPath: "artifacts/manifest.json",
      flowIds: ["process-case"],
      importMode: "disabled",
      nestedArchives: "forbidden",
    },
  ],
  frontend: {
    root: "frontend",
    protectedWriteModel: "typed-command-queue",
    directPatch: { enabled: false },
  },
} as unknown as ProjectContract;

async function writeJson(root: string, path: string, value: unknown): Promise<void> {
  const target = join(root, ...path.split("/"));
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, canonicalize(value), "utf8");
}

describe("ArtifactGraph cross-layer drift", () => {
  test("builds every declared layer and finds state drift independent of file enumeration", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-wp02-"));
    try {
      await writeJson(root, "project.contract.json", contract);
      await writeJson(root, "frontend/projections.json", {
        projections: { "save-mode": { frontend: "typed-command-queue" } },
      });
      await writeJson(root, "flows/process-case/builder.json", {
        projections: {
          states: { "case-state": ["Closed", "Open"] },
          indexes: { cases: [{ field: "Status", order: 1, required: true }] },
        },
      });
      await writeJson(root, "flows/process-case/definition.json", {
        id: "process-case",
        connectionReferences: ["SHAREPOINT_CONNECTION"],
        actionCount: 50,
        projections: {
          states: { "case-state": ["Closed", "Open", "Pending"] },
          indexes: { cases: [{ field: "Status", order: 1, required: true }] },
        },
      });
      await writeJson(root, "artifacts/packages/synthetic-package.zip", {
        syntheticInspection: true,
        packageId: "synthetic-package",
        flowIds: ["process-case"],
        inventory: ["Workflows/process-case.json"],
      });
      await writeJson(root, "artifacts/manifest.json", {
        schemaVersion: "1.0",
        files: [
          {
            path: "artifacts/packages/synthetic-package.zip",
            sha256: "a".repeat(64),
          },
        ],
      });
      await writeJson(root, "evidence/local-static.json", {
        evidenceId: "local-static",
        artifacts: [
          {
            path: "artifacts/packages/synthetic-package.zip",
            sha256: "a".repeat(64),
          },
        ],
      });
      await mkdir(join(root, "docs"), { recursive: true });
      await writeFile(join(root, "docs", "design.md"), "# Synthetic Design\n", "utf8");

      const first = await buildArtifactGraph(root, contract);
      const second = await buildArtifactGraph(root, structuredClone(contract));

      assert.equal(canonicalize(first.toJSON()), canonicalize(second.toJSON()));
      assert.deepEqual(
        [...new Set(first.nodes.map(({ kind }) => kind))].sort(),
        [
          "builder",
          "contract",
          "definition",
          "documentation",
          "evidence",
          "frontend",
          "manifest",
          "schema",
          "zip",
        ],
      );
      assert.deepEqual(first.compareProjection("indexes"), []);
      assert.deepEqual(first.compareProjection("inventory"), []);
      assert.deepEqual(first.compareProjection("digests"), []);
      assert.deepEqual(
        first.compareProjection("states").map(({ code, path }) => ({ code, path })),
        [
          {
            code: "META-CONSISTENCY-002",
            path: "flows/process-case/definition.json#/projections/states/case-state",
          },
        ],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
