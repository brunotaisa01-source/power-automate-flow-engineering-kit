import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();
const README_PATH = join(ROOT, "README.md");
const CONTRIBUTING_PATH = join(ROOT, "CONTRIBUTING.md");
const SKILL_PATH = join(ROOT, "skills", "power-automate-flow-engineering-kit-dataverse", "SKILL.md");
const PROFILE_PATH = join(ROOT, "examples", "minimal-public-app", "connectors", "dataverse.red-green.json");
const DOC_PATH = join(ROOT, "docs", "connectors", "dataverse-red-green.md");
const RELEASE_CHECKLIST_PATH = join(ROOT, "docs", "release", "mvp-release-checklist.md");
const REQUIRED_RELEASE_EVIDENCE_LINKS = [
  "evidence/task-1-worker-handoff.md",
  "evidence/task-1-independent-review.md",
  "evidence/task-2-worker-handoff.md",
  "evidence/task-2-independent-review.md",
  "evidence/task-3-worker-handoff.md",
  "evidence/task-3-independent-review.md",
  "evidence/task-4-worker-handoff.md",
  "evidence/task-4-independent-review.md",
];

type ScenarioProfile = {
  evidenceClass?: unknown;
  scenarios?: Array<Record<string, unknown>>;
};

function runOfflineCatalogConsistency(profile: ScenarioProfile): string {
  assert.ok(Array.isArray(profile.scenarios));
  return profile.scenarios
    .map((scenario) => {
      const id = scenario.id;
      const red = scenario.red as Record<string, unknown> | undefined;
      const green = scenario.green as Record<string, unknown> | undefined;
      if (typeof id !== "string") throw new Error("CATALOG_ID_REQUIRED");
      if (!red || typeof red !== "object" || Array.isArray(red)) throw new Error("CATALOG_RED_SHAPE_REQUIRED");
      if (!green || typeof green !== "object" || Array.isArray(green)) throw new Error("CATALOG_GREEN_SHAPE_REQUIRED");
      if (typeof red.failure !== "string" || red.failure.trim().length === 0) throw new Error("CATALOG_RED_FAILURE_REQUIRED");
      if (typeof green.correction !== "string" || green.correction.trim().length === 0) throw new Error("CATALOG_GREEN_CORRECTION_REQUIRED");
      return `${id}|RED=${red.failure}|GREEN=${green.correction}`;
    })
    .sort()
    .join("\n");
}

const INDEPENDENT_POSITIVE_CONTROL: ScenarioProfile = {
  evidenceClass: "LOCAL_SYNTHETIC",
  scenarios: [
    {
      id: "DV-POSITIVE-ALPHA",
      title: "Independent branch-inspection control",
      invariant: "A catalog entry with a distinct topology remains locally valid.",
      red: { failure: "A branch-inspection record omits its required failure explanation." },
      green: { correction: "The branch-inspection record supplies a stable failure explanation and correction." },
      providerGate: "NOT_VERIFIED",
      uatGate: "NOT_VERIFIED",
      topology: { kind: "branch-inspection", order: ["red", "green"] },
    },
    {
      id: "DV-POSITIVE-BETA",
      title: "Independent payload-boundary control",
      invariant: "A second catalog topology remains locally valid without tenant data.",
      red: { failure: "A payload-boundary record omits its correction contract." },
      green: { correction: "The payload-boundary record retains a deterministic correction contract." },
      providerGate: "NOT_VERIFIED",
      uatGate: "NOT_VERIFIED",
      topology: { kind: "payload-boundary", fields: ["failure", "correction"] },
    },
  ],
};

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
    ...REQUIRED_RELEASE_EVIDENCE_LINKS,
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

test("release checklist binds immutable heads and separates handoffs from reviews", async () => {
  const checklist = await readFile(RELEASE_CHECKLIST_PATH, "utf8");
  const requiredEntries = [
    "Immutable Task 4 review head: `eaf31f8`",
    "Task 4 implementation commit: `2c269c2`",
    "final-head GitHub Actions matrix: `NOT_RUN` / `PENDING`",
    "existing prior CI run",
    "Worker handoffs",
    "Independent review reports",
    ...REQUIRED_RELEASE_EVIDENCE_LINKS,
  ];
  for (const requiredEntry of requiredEntries) {
    assert.ok(checklist.includes(requiredEntry), `missing release traceability: ${requiredEntry}`);
  }
  assert.doesNotMatch(checklist, /final-head[^\n]*https?:\/\//i);
  assert.doesNotMatch(checklist, /\.superpowers\/sdd\//i);
});

test("release checklist evidence links resolve to tracked public records", async () => {
  const checklist = await readFile(RELEASE_CHECKLIST_PATH, "utf8");
  const links = [...checklist.matchAll(/\[[^\]]+\]\(([^)#?]+)(?:#[^)]*)?\)/g)]
    .map((match) => match[1])
    .filter((target) => target.startsWith("evidence/"))
    .sort();

  assert.deepEqual(links, [...REQUIRED_RELEASE_EVIDENCE_LINKS].sort());
  for (const link of links) {
    const absoluteTarget = resolve(dirname(RELEASE_CHECKLIST_PATH), link);
    const repositoryRelativeTarget = relative(ROOT, absoluteTarget).replaceAll("\\", "/");
    assert.equal(repositoryRelativeTarget.startsWith("../"), false);
    assert.equal(existsSync(absoluteTarget), true, `missing release evidence: ${link}`);
    const trackedPath = execFileSync("git", ["ls-files", "--error-unmatch", "--", repositoryRelativeTarget], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    assert.equal(trackedPath, repositoryRelativeTarget, `release evidence is not tracked: ${link}`);
  }
});

test("public docs name all three offline APIs and their evidence boundary", async () => {
  const checklist = await readFile(RELEASE_CHECKLIST_PATH, "utf8");
  const publicGuidance = (
    await Promise.all([
      readFile(README_PATH, "utf8"),
      readFile(CONTRIBUTING_PATH, "utf8"),
      readFile(SKILL_PATH, "utf8"),
      readFile(DOC_PATH, "utf8"),
      readFile(RELEASE_CHECKLIST_PATH, "utf8"),
    ])
  ).join("\n");

  for (const apiReference of [
    "preparePowerAutomateDefinition",
    "@spflow/core/flow-save",
    "createLocalEvidenceReport(input): LocalEvidenceReport",
    "@spflow/core/evidence-report",
    "validateReadonlyProviderSnapshot(snapshot)",
    "@spflow/core/provider-readonly",
  ]) {
    assert.ok(publicGuidance.includes(apiReference), `missing public API reference: ${apiReference}`);
    assert.ok(checklist.includes(apiReference), `missing checklist API reference: ${apiReference}`);
  }
  for (const evidenceLabel of ["LOCAL_SYNTHETIC", "PROVIDER", "UAT", "NOT_VERIFIED"]) {
    assert.match(publicGuidance, new RegExp(evidenceLabel, "i"));
  }
});

test("deterministic offline Dataverse catalog consistency requires RED and GREEN fields", async () => {
  const profile = JSON.parse(await readFile(PROFILE_PATH, "utf8")) as ScenarioProfile;
  const documentation = await readFile(DOC_PATH, "utf8");
  const firstRun = runOfflineCatalogConsistency(profile);
  const reversedRun = runOfflineCatalogConsistency({
    ...profile,
    scenarios: [...(profile.scenarios ?? [])].reverse(),
  });

  assert.equal(firstRun, reversedRun);
  assert.equal(firstRun.split("\n").length, 9);
  assert.match(documentation, /sanitized scenario catalog/i);
  assert.match(documentation, /deterministic offline Dataverse catalog consistency harness/i);
  assert.match(documentation, /node --experimental-strip-types --test --test-name-pattern="deterministic offline Dataverse catalog consistency" tests\/skills\/dataverse-flow-engineering-kit-skill\.test\.ts/);
  assert.match(documentation, /does not execute live connector/i);
});

test("Task 4 catalog positive-control is structurally independent and locally GREEN", async () => {
  const checklist = await readFile(RELEASE_CHECKLIST_PATH, "utf8");
  const profile = JSON.parse(await readFile(PROFILE_PATH, "utf8")) as ScenarioProfile;
  const positiveControl = runOfflineCatalogConsistency(INDEPENDENT_POSITIVE_CONTROL);
  const shippedCatalog = runOfflineCatalogConsistency(profile);

  assert.notEqual(positiveControl, shippedCatalog);
  assert.match(positiveControl, /DV-POSITIVE-ALPHA/);
  assert.equal(positiveControl.split("\n").length, 2);
  assert.match(checklist, /Task 4 catalog positive-control/);
});

test("Task 4 catalog mutation\/RED fails closed for missing RED evidence", async () => {
  const checklist = await readFile(RELEASE_CHECKLIST_PATH, "utf8");
  const profile = JSON.parse(await readFile(PROFILE_PATH, "utf8")) as ScenarioProfile;
  const mutatedProfile = {
    ...profile,
    scenarios: profile.scenarios?.map((scenario, index) =>
      index === 0 ? { ...scenario, red: { ...(scenario.red as Record<string, unknown>), failure: "" } } : scenario,
    ),
  };

  assert.throws(() => runOfflineCatalogConsistency(mutatedProfile), /CATALOG_RED_FAILURE_REQUIRED/);
  assert.match(checklist, /Task 4 catalog mutation\/RED/);
});
