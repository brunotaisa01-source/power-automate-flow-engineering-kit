import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { auditLearningRegistry } from "../../packages/core/src/self-improvement.ts";

const ROOT = process.cwd();
const SKILL_PATH = join(ROOT, "skills/sharepoint-flow-engineering-kit-self-improvement/SKILL.md");
const REGISTRY_PATH = join(ROOT, "knowledge/self-improvement/registry.json");

test("self-improvement skill is global and connector-agnostic", async () => {
  const skill = await readFile(SKILL_PATH, "utf8");
  for (const connector of ["Power Automate", "Power Platform", "SharePoint", "Excel", "Power Apps", "Dataverse", "Outlook", "Graph", "HTTP", "SQL", "approvals"]) {
    assert.match(skill, new RegExp(connector, "i"));
  }
  assert.match(skill, /without waiting for a new\s+user instruction/is);
  assert.match(skill, /learn audit.*--execute/is);
  assert.match(skill, /learn capture.*learn promote/is);
  assert.match(skill, /registry SHA-256|digest/is);
  assert.match(skill, /no create, update, delete, approve, promote,?\s*write/is);
  assert.doesNotMatch(skill, /C:\\Users\\[^`\s]+|OneDrive\s+-|private-project-marker|Você/i);
});

test("global registry consumption is schema/digest checked and blocks open candidates", async () => {
  const result = await auditLearningRegistry(ROOT, REGISTRY_PATH, { executeBindings: false });
  assert.equal(result.registryId, "sharepoint-flow-engineering-kit-global");
  assert.equal(typeof result.revision, "number");
  assert.match(result.digest ?? "", /^[a-f0-9]{64}$/);
  assert.ok(result.diagnostics.some(({ code }) => code === "SELF_LEARNING_CANDIDATE_OPEN"));
  assert.equal(result.diagnostics.some(({ code }) => code === "SELF_LEARNING_SCHEMA_INVALID"), false);
  assert.equal(result.diagnostics.some(({ code }) => code === "SELF_LEARNING_DIGEST_MISMATCH"), false);
});
