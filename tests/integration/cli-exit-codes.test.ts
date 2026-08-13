import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { executeCli } from "../../packages/cli/src/bin/spflow.ts";
import {
  createCommandReport,
  type CliHandlers,
  type CommandHandler,
  type ExitCode,
  type ReportFinding,
} from "../../packages/cli/src/parse-args.ts";

function finding(exitCode: ExitCode): ReportFinding {
  return {
    exitCode,
    ruleId: `CLI-EXIT-${exitCode}`,
    severity: exitCode === 0 ? "info" : "error",
    code: `CLI_EXIT_${exitCode}`,
    message: `Synthetic exit ${exitCode}.`,
    artifactPath: "fixtures/input.json",
    remediation: "Correct the synthetic fixture.",
  };
}

function handlerFor(exitCode: ExitCode): CommandHandler {
  return {
    async run() {
      return createCommandReport("scan public-data", [finding(exitCode)]);
    },
  };
}

async function run(
  args: readonly string[],
  handlers: Partial<CliHandlers> = {},
  env: NodeJS.ProcessEnv = {},
): Promise<{ exitCode: ExitCode; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const exitCode = await executeCli(args, {
    handlers,
    env,
    stdout(value) {
      stdout += value;
    },
    stderr(value) {
      stderr += value;
    },
  });
  return { exitCode, stdout, stderr };
}

describe("CLI exit statuses", () => {
  const categoryCases = [
    { label: "pass", exitCode: 0 },
    { label: "rule violation", exitCode: 1 },
    { label: "unsafe archive", exitCode: 4 },
    { label: "public-data leakage", exitCode: 5 },
    { label: "evidence violation", exitCode: 6 },
    { label: "external gate unavailable", exitCode: 8 },
  ] as const;

  for (const fixture of categoryCases) {
    test(`CLI exit ${fixture.exitCode}: ${fixture.label}`, async () => {
      const result = await run(
        ["scan", "public-data", ".", "--format", "json"],
        { "scan-public-data": handlerFor(fixture.exitCode) },
      );
      assert.equal(result.exitCode, fixture.exitCode);
      assert.equal(JSON.parse(result.stdout).exitCode, fixture.exitCode);
      assert.equal(result.stderr, "");
    });
  }

  test("CLI exit 2: missing argument is deterministic", async () => {
    const first = await run(["validate", "contract", "--format", "json"]);
    const second = await run(["validate", "contract", "--format", "json"]);
    assert.equal(first.exitCode, 2);
    assert.deepEqual(first, second);
    assert.equal(JSON.parse(first.stdout).diagnostics[0].code, "CLI_ARGUMENT_INVALID");
  });

  test("CLI exit 3: unsupported profile", async () => {
    const handlers: Partial<CliHandlers> = {
      "validate-artifact": handlerFor(3),
    };
    const result = await run(
      [
        "validate",
        "artifact",
        "synthetic.zip",
        "--contract",
        "project.contract.json",
        "--format",
        "json",
      ],
      handlers,
    );
    assert.equal(result.exitCode, 3);
  });

  test("CLI exit 7: internal errors are caught and details are redacted", async () => {
    const privateError = "private-internal-error";
    const throwing: CommandHandler = {
      async run() {
        throw new Error(privateError);
      },
    };
    const result = await run(
      ["scan", "public-data", ".", "--format", "json"],
      { "scan-public-data": throwing },
    );
    assert.equal(result.exitCode, 7);
    assert.equal(result.stdout.includes(privateError), false);
    assert.equal(JSON.parse(result.stdout).diagnostics[0].code, "CLI_INTERNAL_ERROR");
  });

  test("private binding values cannot appear in JSON or text output", async () => {
    const privateValue = "private-binding-value";
    const leaking: CommandHandler = {
      async run() {
        return createCommandReport("scan public-data", [{
          ...finding(5),
          message: `Found ${privateValue}.`,
          expected: { [privateValue]: privateValue },
          actual: privateValue,
        }]);
      },
    };
    const handlers: Partial<CliHandlers> = { "scan-public-data": leaking };
    const env = { SPFLOW_BINDING_SITE_URL: privateValue };
    const json = await run(
      ["scan", "public-data", ".", "--format", "json"],
      handlers,
      env,
    );
    const text = await run(["scan", "public-data", "."], handlers, env);

    assert.equal(`${json.stdout}${text.stdout}`.includes(privateValue), false);
    assert.equal(json.stdout.includes("<redacted>"), true);
    assert.equal(text.stdout.includes("<redacted>"), true);
  });
});
