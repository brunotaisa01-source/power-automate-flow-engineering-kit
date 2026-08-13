import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { canonicalize } from "../../../packages/core/src/canonical-json.ts";
import {
  assertNoPathCaseCollisions,
  normalizeRepositoryPath,
} from "../../../packages/core/src/path-policy.ts";

describe("canonical JSON", () => {
  test("sorts object keys and emits exactly one LF terminator", () => {
    const actual = canonicalize({
      zebra: 2,
      alpha: { second: true, first: "line\r\nbreak" },
    });

    assert.equal(
      actual,
      '{"alpha":{"first":"line\\r\\nbreak","second":true},"zebra":2}\n',
    );
    assert.equal(Buffer.from(actual, "utf8").toString("utf8"), actual);
    assert.equal(actual.includes("\r"), false);
  });

  test("preserves ordered arrays and sorts only arrays declared as semantic sets", () => {
    const actual = canonicalize(
      {
        stages: ["validate", "package"],
        tags: ["zip", "contract"],
        flows: [
          { id: "second", references: ["BETA", "ALPHA"] },
          { id: "first", references: ["DELTA", "CHARLIE"] },
        ],
      },
      {
        arrayPolicies: {
          "/tags": "set",
          "/flows/*/references": "set",
        },
      },
    );

    assert.equal(
      actual,
      '{"flows":[{"id":"second","references":["ALPHA","BETA"]},{"id":"first","references":["CHARLIE","DELTA"]}],"stages":["validate","package"],"tags":["contract","zip"]}\n',
    );
  });

  test("rejects values that JSON cannot represent deterministically", () => {
    assert.throws(() => canonicalize({ invalid: Number.NaN }), /finite number/);
    assert.throws(() => canonicalize({ invalid: undefined }), /undefined/);
    assert.throws(() => canonicalize({ invalid: 1n }), /bigint/);
  });
});

describe("repository path policy", () => {
  test("normalizes safe relative paths to POSIX form", () => {
    assert.equal(
      normalizeRepositoryPath("flows\\synthetic-flow\\definition.json"),
      "flows/synthetic-flow/definition.json",
    );
    assert.equal(
      normalizeRepositoryPath("./flows//synthetic-flow/definition.json"),
      "flows/synthetic-flow/definition.json",
    );
  });

  test("rejects absolute, traversal, empty, and control-character paths", () => {
    for (const path of [
      `/${["absolute", "file.json"].join("/")}`,
      ["C:", "absolute", "file.json"].join("\\"),
      `\\\\${["server", "share", "file.json"].join("\\")}`,
      "safe/../../escape.json",
      "safe/../escape.json",
      "",
      "safe/\0file.json",
    ]) {
      assert.throws(() => normalizeRepositoryPath(path), undefined, path);
    }
  });

  test("rejects case-colliding paths after normalization", () => {
    assert.throws(
      () => assertNoPathCaseCollisions([
        "Flows/Synthetic/definition.json",
        "flows/synthetic/definition.json",
      ]),
      /case collision/i,
    );
  });
});
