import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { executeCli, type CommandReport } from "../../packages/cli/src/bin/spflow.ts";

const connections = {
  synthetic_alias: {
    connectionName: "synthetic-connection",
    connectionReferenceLogicalName: "prp_synthetic_reference",
  },
};

function definition() {
  return {
    triggers: { manual: { type: "Request" } },
    actions: {
      Root: {
        type: "OpenApiConnection",
        inputs: {
          host: { connectionName: "synthetic_alias", operationId: "ListRows" },
          parameters: { table: "synthetic_table" },
          authentication: "synthetic-authentication",
        },
      },
      Nested: {
        type: "If",
        actions: {
          Child: {
            type: "OpenApiConnection",
            inputs: {
              host: { connectionName: "synthetic_alias", operationId: "GetRow" },
              authentication: "nested-synthetic-authentication",
            },
          },
        },
      },
    },
  };
}

async function writeInputs() {
  const directory = await mkdtemp(join(tmpdir(), "spflow-task-1-"));
  const definitionPath = join(directory, "definition.json");
  const connectionsPath = join(directory, "connections.json");
  await writeFile(definitionPath, JSON.stringify(definition()), "utf8");
  await writeFile(connectionsPath, JSON.stringify(connections), "utf8");
  return { directory, definitionPath, connectionsPath };
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

test("prepare flow returns a JSON report with nested authentication removed", async () => {
  const { definitionPath, connectionsPath } = await writeInputs();
  const result = await runJson([
    "prepare", "flow", definitionPath, "--connections", connectionsPath, "--format", "json",
  ]);

  assert.equal(result.exitCode, 0);
  assert.equal(result.report.command, "prepare flow");
  assert.equal(result.report.result, "PASS");
  const data = result.report.data as { preparedDefinition: ReturnType<typeof definition> };
  assert.equal(data.preparedDefinition.actions.Root.inputs.host.connectionReferenceName, "prp_synthetic_reference");
  assert.equal(data.preparedDefinition.actions.Nested.actions.Child.inputs.host.connectionReferenceName, "prp_synthetic_reference");
  assert.equal("authentication" in data.preparedDefinition.actions.Root.inputs, false);
  assert.equal("authentication" in data.preparedDefinition.actions.Nested.actions.Child.inputs, false);
});

test("prepare flow text output includes the prepared definition", async () => {
  const { definitionPath, connectionsPath } = await writeInputs();
  const result = await runText([
    "prepare", "flow", definitionPath, "--connections", connectionsPath, "--format", "text",
  ]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Prepared definition:/);
  assert.match(result.stdout, /prp_synthetic_reference/);
});

test("validate flow fails closed for a missing alias with a deterministic exit code", async () => {
  const { definitionPath, connectionsPath } = await writeInputs();
  const broken = JSON.parse(await readFile(definitionPath, "utf8")) as ReturnType<typeof definition>;
  broken.actions.Root.inputs.host.connectionName = "missing_synthetic_alias";
  await writeFile(definitionPath, JSON.stringify(broken), "utf8");

  const result = await runJson([
    "validate", "flow", definitionPath, "--connections", connectionsPath, "--format", "json",
  ]);

  assert.equal(result.exitCode, 1);
  assert.equal(result.report.result, "FAIL");
  assert.equal(result.report.diagnostics[0]?.code, "MISSING_CONNECTION_REFERENCE");
});

test("unreadable inputs retain the route command and use input remediation", async () => {
  const { connectionsPath } = await writeInputs();
  const result = await runJson([
    "prepare", "flow", "missing-definition.json", "--connections", connectionsPath, "--format", "json",
  ]);

  assert.equal(result.exitCode, 2);
  assert.equal(result.report.command, "prepare flow");
  assert.match(result.report.diagnostics[0]?.remediation ?? "", /readable synthetic JSON input/);
});

test("prepare flow never overwrites an input and writes only to explicit output", async () => {
  const { directory, definitionPath, connectionsPath } = await writeInputs();
  const original = await readFile(definitionPath, "utf8");
  const outputPath = join(directory, "prepared.json");
  const result = await runJson([
    "prepare", "flow", definitionPath, "--connections", connectionsPath,
    "--output", outputPath, "--format", "json",
  ]);

  assert.equal(result.exitCode, 0);
  assert.equal(await readFile(definitionPath, "utf8"), original);
  const output = JSON.parse(await readFile(outputPath, "utf8")) as ReturnType<typeof definition>;
  assert.equal(output.actions.Root.inputs.host.connectionReferenceName, "prp_synthetic_reference");
  assert.equal((result.report.data as { outputPath: string }).outputPath, "<redacted-path>");
});

test("unwritable explicit output retains the route and uses output remediation", async () => {
  const { directory, definitionPath, connectionsPath } = await writeInputs();
  const result = await runJson([
    "prepare", "flow", definitionPath, "--connections", connectionsPath, "--output", directory, "--format", "json",
  ]);

  assert.equal(result.exitCode, 2);
  assert.equal(result.report.command, "prepare flow");
  assert.match(result.report.diagnostics[0]?.remediation ?? "", /explicit output path/);
});

test("validate flow reports the local synthetic and provider verification boundary", async () => {
  const { definitionPath, connectionsPath } = await writeInputs();
  const result = await runJson([
    "validate", "flow", definitionPath, "--connections", connectionsPath, "--format", "json",
  ]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report.data, {
    claimClass: "LOCAL_SYNTHETIC",
    providerGate: "NOT_VERIFIED",
    saveReadyLocally: true,
  });
});

test("prepare flow independently handles a solution-envelope definition with a case branch", async () => {
  const { directory, connectionsPath } = await writeInputs();
  const definitionPath = join(directory, "envelope.json");
  const envelope = {
    properties: {
      definition: {
        actions: {
          Switch: {
            type: "Switch",
            cases: {
              SyntheticCase: {
                actions: {
                  CaseAction: {
                    type: "OpenApiConnection",
                    inputs: { host: { connectionName: "synthetic_alias" }, authentication: "case-auth" },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  await writeFile(definitionPath, JSON.stringify(envelope), "utf8");
  const result = await runJson(["prepare", "flow", definitionPath, "--connections", connectionsPath, "--format", "json"]);
  assert.equal(result.exitCode, 0);
  const prepared = (result.report.data as { preparedDefinition: typeof envelope }).preparedDefinition;
  const action = prepared.properties.definition.actions.Switch.cases.SyntheticCase.actions.CaseAction;
  assert.equal(action.inputs.host.connectionReferenceName, "prp_synthetic_reference");
  assert.equal("authentication" in action.inputs, false);
});

test("mutation counterexample rejects a missing logical connection reference", async () => {
  const { definitionPath, connectionsPath } = await writeInputs();
  await writeFile(connectionsPath, JSON.stringify({ synthetic_alias: { connectionName: "synthetic-connection" } }), "utf8");
  const result = await runJson(["prepare", "flow", definitionPath, "--connections", connectionsPath, "--format", "json"]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.diagnostics[0]?.code, "MISSING_CONNECTION_REFERENCE_LOGICAL_NAME");
});

test("prepare flow rejects ambiguous connection-reference matches", async () => {
  const { definitionPath, connectionsPath } = await writeInputs();
  await writeFile(connectionsPath, JSON.stringify({
    first_alias: { connectionName: "synthetic_alias", connectionReferenceLogicalName: "prp_first" },
    second_alias: { connectionName: "synthetic_alias", connectionReferenceLogicalName: "prp_second" },
  }), "utf8");
  const result = await runJson(["prepare", "flow", definitionPath, "--connections", connectionsPath, "--format", "json"]);

  assert.equal(result.exitCode, 1);
  assert.equal(result.report.diagnostics[0]?.code, "MISSING_CONNECTION_REFERENCE");
});

test("prepare flow recursively handles else and default branches", async () => {
  const { directory, connectionsPath } = await writeInputs();
  const definitionPath = join(directory, "branches.json");
  const branches = {
    actions: {
      Condition: {
        type: "If",
        actions: {},
        else: {
          actions: {
            ElseAction: { type: "OpenApiConnection", inputs: { host: { connectionName: "synthetic_alias" }, authentication: "else-auth" } },
          },
        },
        default: {
          actions: {
            DefaultAction: { type: "OpenApiConnection", inputs: { host: { connectionName: "synthetic_alias" }, authentication: "default-auth" } },
          },
        },
      },
    },
  };
  await writeFile(definitionPath, JSON.stringify(branches), "utf8");
  const result = await runJson(["prepare", "flow", definitionPath, "--connections", connectionsPath, "--format", "json"]);
  assert.equal(result.exitCode, 0);
  const prepared = (result.report.data as { preparedDefinition: typeof branches }).preparedDefinition;
  assert.equal(prepared.actions.Condition.else.actions.ElseAction.inputs.host.connectionReferenceName, "prp_synthetic_reference");
  assert.equal(prepared.actions.Condition.default.actions.DefaultAction.inputs.host.connectionReferenceName, "prp_synthetic_reference");
});
