import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  aggregateWorkspaceResults,
  validateWorkspaceManifest,
  type WorkspaceManifest,
  type WorkspaceProjectResult,
  type WorkspaceRegistryAudit,
} from "../../../packages/core/src/workspace-control.ts";

function validManifest(): WorkspaceManifest {
  return {
    schemaVersion: "1.0",
    workspaceId: "synthetic-project-workspace",
    registryPath: "./knowledge/self-improvement/registry.json",
    projects: [
      { id: "procurement", root: "./procurement", check: "npm run check", required: true },
      { id: "expenses", root: "./expenses", check: "npm run check", required: true },
    ],
  };
}

function registryAudit(audit: WorkspaceRegistryAudit["audit"] = "PASS"): WorkspaceRegistryAudit {
  return { revision: 1, digest: "[SANITIZED_DIGEST]", audit };
}

function projectResult(
  id: string,
  required: boolean,
  result: WorkspaceProjectResult["result"],
  exitCode: number,
): WorkspaceProjectResult {
  return { id, required, result, exitCode, evidenceClass: "LOCAL_SYNTHETIC" };
}

describe("workspace control-plane core contracts", () => {
  test("accepts a valid two-project manifest", () => {
    assert.deepEqual(validateWorkspaceManifest(validManifest()), []);
  });

  test("rejects duplicate IDs and roots, unsafe paths, and non-portable checks", () => {
    const diagnostics = validateWorkspaceManifest({
      ...validManifest(),
      projects: [
        { id: "same", root: "./projects/one", check: "npm run check", required: true },
        { id: "same", root: "projects/one", check: "npm run build", required: false },
        { id: "outside", root: "../outside", check: "npm run check", required: true },
        { id: "absolute", root: "/private/project", check: "npm run check", required: true },
      ],
    });
    const codes = diagnostics.map(({ code }) => code);

    assert.ok(codes.includes("WORKSPACE_PROJECT_ID_DUPLICATE"));
    assert.ok(codes.includes("WORKSPACE_PROJECT_ROOT_DUPLICATE"));
    assert.ok(codes.includes("WORKSPACE_PATH_INVALID"));
    assert.ok(codes.includes("WORKSPACE_CHECK_UNSUPPORTED"));
  });

  test("sorts project results by ID and fails when a required project is RED", () => {
    const aggregate = aggregateWorkspaceResults(
      validManifest(),
      registryAudit(),
      [
        projectResult("procurement", true, "PASS", 0),
        projectResult("expenses", true, "FAIL", 1),
      ],
    );

    assert.deepEqual(aggregate.projects.map(({ id }) => id), ["expenses", "procurement"]);
    assert.equal(aggregate.result, "FAIL");
    assert.deepEqual(aggregate.summary, { total: 2, passed: 1, failed: 1, notRun: 0, blocked: 0 });
    assert.equal(aggregate.registry.audit, "PASS");
    assert.equal(Object.isFrozen(aggregate), true);
    assert.equal(Object.isFrozen(aggregate.projects), true);
  });

  test("keeps an optional NOT_RUN project visible without failing required GREEN", () => {
    const manifest = validManifest();
    const aggregate = aggregateWorkspaceResults(
      {
        ...manifest,
        projects: manifest.projects.map((project) =>
          project.id === "expenses" ? { ...project, required: false } : project
        ),
      },
      registryAudit(),
      [
        projectResult("procurement", true, "PASS", 0),
        projectResult("expenses", false, "NOT_RUN", 8),
      ],
    );

    assert.equal(aggregate.result, "PASS");
    assert.deepEqual(aggregate.summary, { total: 2, passed: 1, failed: 0, notRun: 1, blocked: 0 });
  });

  test("fails closed and reports a required project with no result", () => {
    const aggregate = aggregateWorkspaceResults(
      validManifest(),
      registryAudit(),
      [projectResult("procurement", true, "PASS", 0)],
    );

    assert.equal(aggregate.result, "FAIL");
    assert.deepEqual(aggregate.projects, [
      projectResult("expenses", true, "NOT_RUN", 8),
      projectResult("procurement", true, "PASS", 0),
    ]);
    assert.deepEqual(aggregate.summary, { total: 2, passed: 1, failed: 0, notRun: 1, blocked: 0 });
  });
});
