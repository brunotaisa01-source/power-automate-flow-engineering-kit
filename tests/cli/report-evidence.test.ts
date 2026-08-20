import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { executeCli, type CommandReport } from "../../packages/cli/src/bin/spflow.ts";

async function writeEvidence(value: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "spflow-evidence-task-2-"));
  const path = join(directory, "evidence-input.json");
  await writeFile(path, JSON.stringify(value), "utf8");
  return path;
}

async function runJson(args: readonly string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = await executeCli(args, {
    stdout(value) { stdout += value; },
    stderr(value) { stderr += value; },
    env: {},
  });
  assert.equal(stderr, "");
  return { exitCode, report: JSON.parse(stdout) as CommandReport };
}

async function runText(args: readonly string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = await executeCli(args, {
    stdout(value) { stdout += value; },
    stderr(value) { stderr += value; },
    env: {},
  });
  assert.equal(stderr, "");
  return { exitCode, stdout };
}

function evidenceInput() {
  return {
    preparedDefinition: {
      path: "/Users/synthetic/private/definition.json",
      result: "PASS",
      diagnostics: [
        {
          code: "FLOW-PREPARED",
          severity: "info",
          message: "Synthetic flow prepared locally for alice@example.com.",
          path: "/actions/Root",
        },
      ],
    },
    localArtifacts: [
      {
        kind: "flow",
        path: "flows/synthetic.json",
        result: "PASS",
        diagnostics: [],
      },
      {
        kind: "zip",
        path: "artifacts/synthetic.zip",
        result: "PASS",
        diagnostics: [],
      },
    ],
  };
}

test("report evidence returns a local synthetic JSON report with open provider and UAT gates", async () => {
  const path = await writeEvidence(evidenceInput());
  const result = await runJson(["report", "evidence", path, "--format", "json"]);

  assert.equal(result.exitCode, 0);
  assert.equal(result.report.command, "report evidence");
  assert.equal(result.report.result, "PASS");
  const data = result.report.data as {
    claimClass: string;
    providerGate: string;
    uatGate: string;
    claims: Array<{ claimClass: string }>;
  };
  assert.equal(data.claimClass, "LOCAL_SYNTHETIC");
  assert.equal(data.providerGate, "NOT_VERIFIED");
  assert.equal(data.uatGate, "NOT_VERIFIED");
  assert.ok(data.claims.every(({ claimClass }) => claimClass === "LOCAL_SYNTHETIC"));
  assert.ok(result.report.diagnostics.some(({ code }) => code === "PROVIDER_NOT_VERIFIED"));
  assert.ok(result.report.diagnostics.some(({ code }) => code === "UAT_NOT_VERIFIED"));
  assert.doesNotMatch(JSON.stringify(result.report), /alice@example\.com/);
  assert.doesNotMatch(JSON.stringify(result.report), /\/Users\/synthetic\/private/);
});

test("report evidence text output exposes the boundary labels without provider PASS", async () => {
  const path = await writeEvidence(evidenceInput());
  const result = await runText(["report", "evidence", path, "--format", "text"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /spflow report evidence: PASS/);
  assert.match(result.stdout, /LOCAL_SYNTHETIC/);
  assert.match(result.stdout, /PROVIDER_NOT_VERIFIED/);
  assert.match(result.stdout, /UAT_NOT_VERIFIED/);
  assert.doesNotMatch(result.stdout, /provider.*PASS/i);
});

test("report evidence returns deterministic NOT_RUN for present but incomplete evidence", async () => {
  const path = await writeEvidence({
    preparedDefinition: {},
    localArtifacts: [{}, null],
  });
  const result = await runJson(["report", "evidence", path, "--format", "json"]);

  assert.equal(result.exitCode, 8);
  assert.equal(result.report.result, "FAIL");
  assert.ok(result.report.diagnostics.some(({ code }) => code === "LOCAL_DEFINITION_EVIDENCE_INCOMPLETE"));
  assert.ok(result.report.diagnostics.some(({ code }) => code === "LOCAL_ARTIFACT_ENTRY_INVALID"));
  assert.equal((result.report.data as { result: string }).result, "NOT_RUN");
  assert.doesNotMatch(JSON.stringify(result.report.data), /"result"\s*:\s*"PASS"/);
});

test("report evidence handles malformed optional diagnostic fields without an internal error", async () => {
  const input = evidenceInput();
  input.preparedDefinition.diagnostics[0]!.jsonPointer = null;
  input.preparedDefinition.diagnostics[0]!.remediation = 123;
  const path = await writeEvidence(input);
  const result = await runJson(["report", "evidence", path, "--format", "json"]);

  assert.equal(result.exitCode, 8);
  assert.equal(result.report.result, "FAIL");
  assert.notEqual(result.report.diagnostics[0]?.code, "CLI_INTERNAL_ERROR");
  assert.ok(result.report.diagnostics.some(({ code }) => code === "LOCAL_DIAGNOSTIC_ENTRY_INVALID"));
  assert.equal((result.report.data as { result: string }).result, "NOT_RUN");
});

test("report evidence preserves valid JSON-safe expected and actual values", async () => {
  const input = evidenceInput();
  input.preparedDefinition.diagnostics[0]!.expected = { nested: ["first", { value: 2 }] };
  input.preparedDefinition.diagnostics[0]!.actual = [true, null, { value: "observed" }];
  const path = await writeEvidence(input);
  const result = await runJson(["report", "evidence", path, "--format", "json"]);

  assert.equal(result.exitCode, 0);
  const data = result.report.data as {
    result: string;
    claims: Array<{ subject: string; diagnostics: Array<{ expected?: unknown; actual?: unknown }> }>;
  };
  assert.equal(data.result, "PASS");
  const diagnostic = data.claims.find(({ subject }) => subject === "prepared-definition")?.diagnostics[0];
  assert.deepEqual(diagnostic?.expected, { nested: ["first", { value: 2 }] });
  assert.deepEqual(diagnostic?.actual, [true, null, { value: "observed" }]);
});

test("report evidence sanitizes unsafe unreadable input paths in JSON and text", async () => {
  const unsafePaths = [
    "../../tenant/private.json",
    "/opt/private/tenant.json",
    "file:///Users/private/tenant.json",
    "C:\\Users\\private\\x",
    "\\\\server\\share\\x",
  ];

  for (const unsafePath of unsafePaths) {
    const jsonResult = await runJson(["report", "evidence", unsafePath, "--format", "json"]);
    const textResult = await runText(["report", "evidence", unsafePath, "--format", "text"]);

    assert.equal(jsonResult.exitCode, 2);
    assert.equal(textResult.exitCode, 2);
    assert.doesNotMatch(JSON.stringify(jsonResult.report), new RegExp(unsafePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(textResult.stdout, new RegExp(unsafePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(JSON.stringify(jsonResult.report), /<redacted-path>|<redacted-url>/);
    assert.match(textResult.stdout, /<redacted-path>|<redacted-url>/);
  }
});

test("report evidence fails closed for an unreadable local evidence path", async () => {
  const result = await runJson([
    "report", "evidence", "/private/tmp/missing-synthetic-evidence.json", "--format", "json",
  ]);

  assert.equal(result.exitCode, 2);
  assert.equal(result.report.command, "report evidence");
  assert.equal(result.report.diagnostics[0]?.code, "CLI_INPUT_UNREADABLE");
});

test("report evidence preserves a local FAIL mutation and never turns it into provider PASS", async () => {
  const input = evidenceInput();
  input.localArtifacts[0]!.result = "FAIL";
  input.localArtifacts[0]!.diagnostics = [{
    code: "FLOW-MUTATION",
    severity: "error",
    message: "Synthetic counterexample failed locally.",
    path: "/actions/Root",
  }];
  const path = await writeEvidence(input);
  const result = await runJson(["report", "evidence", path, "--format", "json"]);

  assert.equal(result.exitCode, 1);
  assert.equal(result.report.result, "FAIL");
  const data = result.report.data as { result: string; providerGate: string; uatGate: string };
  assert.equal(data.result, "FAIL");
  assert.equal(data.providerGate, "NOT_VERIFIED");
  assert.equal(data.uatGate, "NOT_VERIFIED");
});
