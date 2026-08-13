import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildBuilderArtifact } from "../../../packages/core/dist/graph-builders/builder.js";
import { buildFrontendArtifact } from "../../../packages/core/dist/graph-builders/frontend.js";
import { normalizeWp06Evidence } from "../../../packages/core/dist/graph-builders/wp06-evidence.js";

const validEvidence = {
  evidenceProfile: "wp06-offline-v1",
  contractRevision: 2,
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

  test("unknown, empty, stale-shaped, or caller-decorated values are not normalized", () => {
    for (const data of [
      {},
      { evidenceProfile: "wp06-offline-v1", contractRevision: 2 },
      { ...validEvidence, contractRevision: 0 },
      { ...validEvidence, fixtureProfile: "do-not-trust" },
      { ...validEvidence, httpClassifications: ["arbitrary text"] },
    ]) {
      assert.equal(normalizeWp06Evidence(data), undefined);
    }
  });
});
