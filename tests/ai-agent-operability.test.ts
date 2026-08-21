import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();

async function readContract(relativePath: string): Promise<string> {
  try {
    return await readFile(join(ROOT, relativePath), "utf8");
  } catch {
    return "";
  }
}

function assertHasAll(text: string, required: readonly string[], label: string): void {
  for (const requirement of required) {
    assert.match(text, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${label} is missing: ${requirement}`);
  }
}

test("clean-context AI contract exposes onboarding, map, and portable gates", async () => {
  const agents = await readContract("AGENTS.md");
  const workflow = await readContract("docs/AI_AGENT_WORKFLOW.md");
  const contract = `${agents}\n${workflow}`;

  assert.ok(agents.length > 0, "AGENTS.md must exist and be readable");
  assert.ok(workflow.length > 0, "docs/AI_AGENT_WORKFLOW.md must exist and be readable");
  assertHasAll(contract, [
    "AI Agent Operating Contract",
    "Start Here",
    "Repository Map",
    "Portable Commands",
    "TDD",
    "RED",
    "GREEN",
    "Evidence Classes",
    "Safety and Privacy Boundaries",
    "Git/GitHub Safety",
    "Worker Handoff and Retirement",
    "Stop Conditions",
  ], "AI operability contract");

  assertHasAll(contract, [
    "packages/",
    "tests/",
    "fixtures/",
    "skills/",
    "docs/",
    "examples/",
    "node --version",
    "npm --version",
    "npm ci",
    "npm run build",
    "node --experimental-strip-types --test tests/ai-agent-operability.test.ts",
    "npm test",
    "npm run check",
    "git diff --check",
  ], "portable onboarding");
});

test("clean-context AI contract names connector scope and evidence boundaries", async () => {
  const contract = `${await readContract("AGENTS.md")}\n${await readContract("docs/AI_AGENT_WORKFLOW.md")}`;

  assertHasAll(contract, [
    "SharePoint",
    "Excel",
    "Power Apps",
    "Dataverse",
    "Outlook",
    "Graph",
    "HTTP",
    "SQL",
    "approvals",
    "LOCAL_SYNTHETIC",
    "PROVIDER_TENANT",
    "HOSTED",
    "UAT",
    "local evidence",
    "provider/tenant evidence",
    "hosted evidence",
    "UAT evidence",
  ], "connector and evidence contract");

  assertHasAll(contract, [
    "synthetic",
    "no real email",
    ".invalid",
    "MFA",
    "password",
    "credentials",
    "tenant",
    "do not",
    "pause",
  ], "privacy and authentication boundary");
});

test("clean-context AI contract defines safe Git, handoff, retirement, and stops", async () => {
  const contract = `${await readContract("AGENTS.md")}\n${await readContract("docs/AI_AGENT_WORKFLOW.md")}`;

  assertHasAll(contract, [
    "git status --short",
    "git diff",
    "branch",
    "pull request",
    "secret",
    "force-push",
    "handoff",
    "exact work",
    "retire",
    "worker",
    "STOP",
    "ambiguous",
    "destructive",
    "provider gate",
    "real data",
    "MFA",
  ], "safe worker contract");
});
