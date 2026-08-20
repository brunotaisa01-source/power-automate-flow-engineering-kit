import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();
const README_PATH = join(ROOT, "README.md");
const CONTRIBUTING_PATH = join(ROOT, "CONTRIBUTING.md");
const SKILL_PATH = join(ROOT, "skills", "power-automate-flow-engineering-kit-dataverse", "SKILL.md");
const PROFILE_PATH = join(ROOT, "examples", "minimal-public-app", "connectors", "dataverse.red-green.json");
const DOC_PATH = join(ROOT, "docs", "connectors", "dataverse-red-green.md");
const RELEASE_CHECKLIST_PATH = join(ROOT, "docs", "release", "mvp-release-checklist.md");

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
    providerGate?: string;
    uatGate?: string;
    scenarios?: Array<Record<string, unknown>>;
  };
  assert.equal(profile.evidenceClass, "LOCAL_SYNTHETIC");
  assert.equal(profile.providerGate, "NOT_VERIFIED");
  assert.equal(profile.uatGate, "NOT_VERIFIED");
  assert.ok((profile.scenarios?.length ?? 0) >= 8);
  for (const scenario of profile.scenarios ?? []) {
    assert.match(String(scenario.id), /^DV-[A-Z0-9-]+$/);
    assert.ok(scenario.red && typeof scenario.red === "object");
    assert.ok(scenario.green && typeof scenario.green === "object");
    assert.equal(typeof scenario.invariant, "string");
    assert.equal(scenario.providerGate, "NOT_VERIFIED");
    assert.equal(scenario.uatGate, "NOT_VERIFIED");
  }
});

test("public guidance explains portable setup, RED/GREEN evidence, and live limitations", async () => {
  const [readme, contributing, skill, documentation] = await Promise.all([
    readFile(README_PATH, "utf8"),
    readFile(CONTRIBUTING_PATH, "utf8"),
    readFile(SKILL_PATH, "utf8"),
    readFile(DOC_PATH, "utf8"),
  ]);
  const publicGuidance = `${readme}\n${contributing}\n${skill}\n${documentation}`;

  for (const platform of ["macOS", "Linux", "Windows"]) {
    assert.match(publicGuidance, new RegExp(platform, "i"));
  }
  for (const command of ["npm ci", "npm test", "npm run check", "npm run build"]) {
    assert.ok(publicGuidance.includes(command), `missing portable command: ${command}`);
  }
  assert.match(publicGuidance, /RED means/i);
  assert.match(publicGuidance, /GREEN means/i);
  assert.match(publicGuidance, /read-only provider contract/i);
  for (const evidenceLabel of ["LOCAL_SYNTHETIC", "PROVIDER", "UAT", "NOT_VERIFIED"]) {
    assert.match(publicGuidance, new RegExp(evidenceLabel, "i"));
  }
  assert.match(publicGuidance, /live limitations/i);
});

test("MVP release checklist records reproducible evidence and explicit blockers", async () => {
  const checklist = await readFile(RELEASE_CHECKLIST_PATH, "utf8").catch(() => "");

  for (const requiredText of [
    "# MVP Release Checklist",
    "npm ci",
    "npm run build",
    "npm test",
    "npm run check",
    "git diff --check",
    "node packages/cli/dist/bin/spflow.js scan public-data . --history --format json",
    "Task 1",
    "Task 2",
    "Task 3",
    "task-1-rereview-2.md",
    "task-2-final-rereview.md",
    "task-3-rereview.md",
    "previous GitHub Actions matrix evidence",
    "final-head CI still pending",
    "live provider auth",
    "rebind",
    "readback",
    "UAT",
    "final GitHub Actions matrix",
  ]) {
    assert.ok(checklist.toLowerCase().includes(requiredText.toLowerCase()), `missing checklist entry: ${requiredText}`);
  }
  assert.match(checklist, /LOCAL|PROVIDER|HOSTED|UAT/);
  assert.match(checklist, /NOT_VERIFIED|NOT_RUN/);
});

test("public Dataverse training content rejects private marker classes", async () => {
  const publicPaths = [SKILL_PATH, DOC_PATH, PROFILE_PATH];
  const publicText = (await Promise.all(publicPaths.map((path) => readFile(path, "utf8")))).join("\n");

  assert.doesNotMatch(publicText, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?!invalid\b|test\b)[A-Za-z]{2,}\b/i);
  assert.doesNotMatch(publicText, /\bhttps?:\/\/(?!example\.(?:invalid|test|com)\b)[^\s"'<>`]+/i);
  assert.doesNotMatch(publicText, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
  assert.doesNotMatch(publicText, /\b(?:bearer\s+[A-Za-z0-9._-]{12,}|access[_-]?token\s*[:=]|refresh[_-]?token\s*[:=]|client[_-]?secret\s*[:=]|password\s*[:=])\b/i);
  assert.doesNotMatch(publicText, /\b(?:raw[_-]?(?:payload|response)|request[_-]?body|response[_-]?body)\b/i);
  assert.doesNotMatch(publicText, /["'](?:rawPayload|rawResponse|requestBody|responseBody|access_token|refresh_token|client_secret)["']\s*:/i);
});
