import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildBuilderArtifact } from "../../../packages/core/dist/graph-builders/builder.js";
import { buildFrontendArtifact } from "../../../packages/core/dist/graph-builders/frontend.js";
import {
  normalizeWp06Evidence,
  normalizeWp06SourceProjection,
} from "../../../packages/core/dist/graph-builders/wp06-evidence.js";
import {
  buildWp06ProjectionArtifact,
  deriveWp06SourceProjection,
  parseWp06PackageArtifact,
  parseWp06PackageManifest,
} from "../../../packages/core/dist/wp06-source-adapters.js";

const validEvidence = {
  evidenceProfile: "wp06-offline-v1",
  contractRevision: 2,
  binding: {
    section: "httpClassifications",
    contractArtifactPath: "project.contract.json",
    contractArtifactSha256: "c".repeat(64),
    contractArtifactBytes: 2048,
    sourceArtifactPath: "synthetic/source.json",
    sourceArtifactSha256: "d".repeat(64),
    sourceArtifactBytes: 512,
    sourceArtifactKind: "builder",
    projectionArtifactPath: ".spflow-derived/wp06/builder/synthetic/source.json.httpClassifications.json",
    projectionArtifactSha256: "e".repeat(64),
    projectionArtifactBytes: 768,
  },
  httpClassifications: [{
    classification: "GET_FAILED",
    error: { messageCategory: "unrelated", platformCode: "INVALID_QUERY" },
    allowCreateMissing404: false,
    requestKind: "initial-get",
    phase: "preflight",
    status: 400,
  }],
} as const;

describe("WP-06 normalized evidence builders", () => {
  test("builder and frontend sources normalize a typed envelope without changing section order", () => {
    const reversed = {
      ...validEvidence,
      httpClassifications: [...validEvidence.httpClassifications].reverse(),
    };
    const builder = buildBuilderArtifact({
      relativePath: "synthetic/builder.json",
      data: reversed,
    });
    const frontend = buildFrontendArtifact({
      relativePath: "synthetic/frontend.json",
      data: reversed,
    });

    assert.equal(builder.sourceProfile, "wp06-evidence-v1");
    assert.equal(frontend.sourceProfile, "wp06-evidence-v1");
    assert.deepEqual(builder.data, frontend.data);
    assert.ok(Object.isFrozen(builder.data));
    assert.ok(Object.isFrozen((builder.data as typeof reversed).httpClassifications));
  });

  test("hand-authored projection input is untrusted while source IR is derived by code", () => {
    const projection = {
      sourceProjectionProfile: "wp06-source-projection-v1",
      projectionRevision: 1,
      contractRevision: 2,
      sourceKind: "builder",
      section: "httpClassifications",
      adapter: { id: "spflow.power-automate-static-v1", version: 1 },
      facts: validEvidence.httpClassifications,
    };
    const untrusted = buildBuilderArtifact({
      relativePath: "synthetic/source-projection.json",
      data: projection,
    });

    assert.equal(untrusted.sourceProfile, "builder-source-v1");
    assert.deepEqual(normalizeWp06SourceProjection(projection), projection);
    assert.equal(normalizeWp06SourceProjection({ ...projection, untrustedClaim: true }), undefined);

    const sourceIr = {
      sourceIrProfile: "spflow.power-automate-source-ir-v1",
      sourceRevision: 1,
      contractRevision: 2,
      section: "httpClassifications",
      model: {
        requests: [{
          status: 400,
          phase: "preflight",
          kind: "initial-get",
          permitInitial404: false,
          error: { code: "INVALID_QUERY", category: "unrelated" },
          result: "GET_FAILED",
        }],
      },
    };
    const source = buildBuilderArtifact({ relativePath: "synthetic/builder-source.json", data: sourceIr });
    const derived = deriveWp06SourceProjection(sourceIr);
    const artifact = buildWp06ProjectionArtifact(source);
    assert.equal(source.sourceProfile, "spflow.power-automate-source-ir-v1");
    assert.equal(derived?.adapter.id, "spflow.power-automate-static-v1");
    assert.equal(artifact?.sourceProfile, "wp06-derived-projection-v1");
    assert.deepEqual(artifact?.data, derived);
  });

  test("unknown, empty, stale-shaped, or caller-decorated values are not normalized", () => {
    for (const data of [
      {},
      { evidenceProfile: "wp06-offline-v1", contractRevision: 2 },
      { ...validEvidence, contractRevision: 0 },
      { ...validEvidence, fixtureProfile: "do-not-trust" },
      { ...validEvidence, httpClassifications: ["arbitrary text"] },
      { ...validEvidence, binding: { ...validEvidence.binding, sourceArtifactBytes: 0 } },
      { ...validEvidence, binding: { ...validEvidence.binding, contractArtifactBytes: 0 } },
      { ...validEvidence, binding: { ...validEvidence.binding, section: "saveTransactions" } },
      {
        ...validEvidence,
        httpClassifications: [{
          ...validEvidence.httpClassifications[0],
          error: { ...validEvidence.httpClassifications[0].error, untrustedClaim: true },
        }],
      },
      { ...validEvidence, saveTransactions: [{}] },
    ]) {
      assert.equal(normalizeWp06Evidence(data), undefined);
    }
  });

  test("package and manifest projections bind exact package content and ZIP identity", () => {
    const zipDigest = "a".repeat(64);
    assert.deepEqual(parseWp06PackageArtifact({
      packageId: "synthetic-package",
      flowIds: ["synthetic-flow"],
      inventory: ["flows/synthetic-flow.json"],
    }), {
      packageId: "synthetic-package",
      flowIds: ["synthetic-flow"],
      inventory: ["flows/synthetic-flow.json"],
    });
    assert.deepEqual(parseWp06PackageManifest({
      packageId: "synthetic-package",
      artifact: { path: "artifacts/synthetic.zip", sha256: zipDigest, bytes: 512 },
    }), {
      packageId: "synthetic-package",
      artifacts: [{ path: "artifacts/synthetic.zip", sha256: zipDigest, bytes: 512 }],
    });

    assert.equal(parseWp06PackageArtifact({
      packageId: "synthetic-package",
      flowIds: ["synthetic-flow", "synthetic-flow"],
      inventory: ["flows/synthetic-flow.json"],
    }), undefined);
    assert.equal(parseWp06PackageManifest({
      packageId: "synthetic-package",
      artifact: { path: "artifacts/synthetic.zip", sha256: "not-a-digest", bytes: 512 },
    }), undefined);
  });
});
