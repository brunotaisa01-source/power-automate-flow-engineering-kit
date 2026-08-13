import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

describe("package adapter public trust boundary", () => {
  test("does not export caller-controlled derivation or trusted graph construction", async () => {
    const packageJson = JSON.parse(
      await readFile("packages/package-adapters/package.json", "utf8"),
    ) as { exports?: Record<string, string> };

    assert.equal(packageJson.exports?.["./trusted-graph"], undefined);
    assert.equal(packageJson.exports?.["./wp06-derivation"], undefined);
    assert.equal(packageJson.exports?.["./rule-evidence"], undefined);

    await assert.rejects(import("@spflow/package-adapters/trusted-graph"));
    await assert.rejects(import("@spflow/package-adapters/wp06-derivation"));
    await assert.rejects(import("@spflow/package-adapters/rule-evidence"));
  });
});
