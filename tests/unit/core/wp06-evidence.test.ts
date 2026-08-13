import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildBuilderArtifact } from "../../../packages/core/dist/graph-builders/builder.js";
import { buildFrontendArtifact } from "../../../packages/core/dist/graph-builders/frontend.js";
import {
  normalizeWp06Evidence,
  normalizeWp06SourceProjection,
} from "../../../packages/core/dist/graph-builders/wp06-evidence.js";

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

  test("source projection is structurally distinct and strictly normalized", () => {
    const projection = {
      sourceProjectionProfile: "wp06-source-projection-v1",
      projectionRevision: 1,
      contractRevision: 2,
      sourceKind: "builder",
      section: "httpClassifications",
      adapter: { id: "spflow.power-automate-static-v1", version: 1 },
      facts: validEvidence.httpClassifications,
    };
    const builder = buildBuilderArtifact({
      relativePath: "synthetic/source-projection.json",
      data: projection,
    });

    assert.equal(builder.sourceProfile, "wp06-source-projection-v1");
    assert.deepEqual(normalizeWp06SourceProjection(projection), builder.data);
    assert.equal(normalizeWp06SourceProjection({ ...projection, untrustedClaim: true }), undefined);
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
});
