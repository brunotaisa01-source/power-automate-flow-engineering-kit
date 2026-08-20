import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, test } from "node:test";

import { validateReadonlyProviderSnapshot } from "../../packages/core/src/provider-readonly.ts";

const ROOT = process.cwd();
const FIXTURE_PATH = resolve(ROOT, "fixtures/provider-readonly/synthetic-readback.json");

describe("provider read-only adapter boundary", () => {
  test("exports the adapter contract without tenant or network dependencies", async () => {
    const source = await readFile(resolve(ROOT, "packages/core/src/provider-readonly.ts"), "utf8");

    assert.doesNotMatch(source, /from ["'](?:@azure|@microsoft|playwright|puppeteer|selenium)/i);
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
    assert.doesNotMatch(source, /\b(?:tenantApi|providerClient|browserAutomation|networkRequest)\b/i);
  });

  test("fixture remains synthetic and contains no tenant or secret material", async () => {
    const fixtureText = await readFile(FIXTURE_PATH, "utf8");
    const fixture = JSON.parse(fixtureText) as Record<string, unknown>;

    assert.equal(validateReadonlyProviderSnapshot(fixture).valid, true);
    assert.doesNotMatch(fixtureText, /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    assert.doesNotMatch(fixtureText, /\bhttps?:\/\//i);
    assert.doesNotMatch(fixtureText, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
    assert.doesNotMatch(fixtureText, /\b(?:bearer|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|credential)\b/i);
    assert.doesNotMatch(fixtureText, /\b(?:raw[_-]?(?:payload|response)|request[_-]?body|response[_-]?body)\b/i);
    assert.match(fixtureText, /synthetic/i);
  });

  test("provider and UAT claims cannot be minted from local synthetic evidence", async () => {
    const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8")) as Record<string, unknown>;
    const evidence = fixture.evidence as Record<string, unknown>;
    evidence.provider = { claimClass: "PROVIDER", status: "PASS" };
    evidence.uat = { claimClass: "UAT", status: "NOT_VERIFIED" };

    const result = validateReadonlyProviderSnapshot(fixture);

    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.some(({ code }) => code === "READONLY_PROVIDER_READBACK_REQUIRED"));
  });
});
