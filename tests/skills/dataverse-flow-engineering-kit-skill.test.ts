import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();
const SKILL_PATH = join(ROOT, "skills", "power-automate-flow-engineering-kit-dataverse", "SKILL.md");
const PROFILE_PATH = join(ROOT, "examples", "minimal-public-app", "connectors", "dataverse.red-green.json");
const DOC_PATH = join(ROOT, "docs", "connectors", "dataverse-red-green.md");

test("Dataverse training skill is present, searchable, and provider-boundary explicit", async () => {
  const skill = await readFile(SKILL_PATH, "utf8");
  const documentation = await readFile(DOC_PATH, "utf8");
  for (const keyword of [
    "Dataverse",
    "connectionReferenceName",
    "inputs.authentication",
    "@odata.bind",
    "synthetic",
    "readback",
    "idempotency",
    "NOT_VERIFIED",
  ]) {
    assert.match(`${skill}\n${documentation}`, new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(`${skill}\n${documentation}`, /onmicrosoft|bruno\.dev|Procurement Portal|be2cfafc|13dc586a/i);
  assert.doesNotMatch(`${skill}\n${documentation}`, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?!invalid\b)[A-Za-z]{2,}/i);
});

test("Dataverse RED/GREEN profile is synthetic and every scenario has an executable boundary", async () => {
  const profile = JSON.parse(await readFile(PROFILE_PATH, "utf8")) as {
    evidenceClass?: string;
    scenarios?: Array<Record<string, unknown>>;
  };
  assert.equal(profile.evidenceClass, "LOCAL_SYNTHETIC");
  assert.ok((profile.scenarios?.length ?? 0) >= 8);
  for (const scenario of profile.scenarios ?? []) {
    assert.match(String(scenario.id), /^DV-[A-Z0-9-]+$/);
    assert.ok(scenario.red && typeof scenario.red === "object");
    assert.ok(scenario.green && typeof scenario.green === "object");
    assert.equal(typeof scenario.invariant, "string");
    assert.equal(scenario.providerGate, "NOT_VERIFIED");
  }
});
