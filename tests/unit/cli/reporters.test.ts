import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createCommandReport,
  redactCommandReport,
  type ExitCode,
  type ReportFinding,
} from "../../../packages/cli/src/parse-args.ts";
import { formatJsonReport } from "../../../packages/cli/src/reporters/json.ts";
import { formatTextReport } from "../../../packages/cli/src/reporters/text.ts";

function finding(exitCode: ExitCode, code: string): ReportFinding {
  return {
    exitCode,
    ruleId: code,
    severity: exitCode === 0 ? "info" : "error",
    code,
    message: `Synthetic ${code} diagnostic.`,
    artifactPath: "fixtures/input.json",
    remediation: "Correct the synthetic fixture.",
  };
}

describe("CLI reporters", () => {
  const precedenceCases = [
    { exits: [0], expected: 0 },
    { exits: [8, 1], expected: 1 },
    { exits: [1, 2, 3], expected: 3 },
    { exits: [3, 6, 5], expected: 5 },
    { exits: [5, 4], expected: 4 },
    { exits: [4, 7], expected: 7 },
    { exits: [8], expected: 8 },
  ] as const;

  for (const fixture of precedenceCases) {
    test(`applies exit precedence to ${fixture.exits.join(",")}`, () => {
      const report = createCommandReport(
        "verify",
        fixture.exits.map((exitCode) => finding(exitCode, `EXIT-${exitCode}`)),
      );

      assert.equal(report.exitCode, fixture.expected);
      assert.equal(report.result, fixture.expected === 0 ? "PASS" : "FAIL");
    });
  }

  test("creates the exact deterministic CommandReport shape", () => {
    const report = createCommandReport("validate rules", [
      {
        ...finding(0, "RULE-INFO"),
        severity: "info",
        residualGate: "tenant-readback",
        notRun: true,
      },
      { ...finding(1, "RULE-ERROR"), severity: "error" },
      { ...finding(0, "RULE-WARNING"), severity: "warning" },
    ]);

    assert.deepEqual(report, {
      schemaVersion: "1.0",
      command: "validate rules",
      result: "FAIL",
      exitCode: 1,
      diagnostics: [
        {
          ruleId: "RULE-ERROR",
          severity: "error",
          code: "RULE-ERROR",
          message: "Synthetic RULE-ERROR diagnostic.",
          artifactPath: "fixtures/input.json",
          remediation: "Correct the synthetic fixture.",
        },
        {
          ruleId: "RULE-WARNING",
          severity: "warning",
          code: "RULE-WARNING",
          message: "Synthetic RULE-WARNING diagnostic.",
          artifactPath: "fixtures/input.json",
          remediation: "Correct the synthetic fixture.",
        },
        {
          ruleId: "RULE-INFO",
          severity: "info",
          code: "RULE-INFO",
          message: "Synthetic RULE-INFO diagnostic.",
          artifactPath: "fixtures/input.json",
          remediation: "Correct the synthetic fixture.",
          residualGate: "tenant-readback",
        },
      ],
      summary: { errors: 1, warnings: 1, info: 1, notRun: 1 },
    });
  });

  test("reports NOT_RUN when every requested check is explicitly deferred", () => {
    const report = createCommandReport("validate rules", [{
      ...finding(0, "CLI_VALIDATOR_NOT_RUN"),
      severity: "info",
      notRun: true,
    }]);

    assert.equal(report.result, "NOT_RUN");
    assert.equal(report.exitCode, 0);
    assert.equal(report.summary.notRun, 1);
  });

  test("renders byte-stable canonical JSON and generic text", () => {
    const report = createCommandReport("verify", []);

    const first = formatJsonReport(report);
    const second = formatJsonReport(structuredClone(report));
    assert.equal(first, second);
    assert.equal(
      first,
      [
        "{",
        '  "command": "verify",',
        '  "diagnostics": [],',
        '  "exitCode": 0,',
        '  "result": "PASS",',
        '  "schemaVersion": "1.0",',
        '  "summary": {',
        '    "errors": 0,',
        '    "info": 0,',
        '    "notRun": 0,',
        '    "warnings": 0',
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    assert.equal(
      formatTextReport(report),
      "spflow verify: PASS (exit 0)\nerrors=0 warnings=0 info=0 notRun=0\n",
    );
  });

  test("redacts binding values from every output field including object keys", () => {
    const privateValue = "private-binding-value";
    const report = createCommandReport("verify", [
      {
        exitCode: 5,
        ruleId: "DATA-PUBLIC-001",
        severity: "error",
        code: "DATA-PUBLIC-001",
        message: `Found ${privateValue}.`,
        artifactPath: `fixtures/${privateValue}.json`,
        expected: { [privateValue]: `expected-${privateValue}` },
        actual: [privateValue],
        remediation: `Remove ${privateValue}.`,
      },
    ]);

    const redacted = redactCommandReport(report, [privateValue]);
    const output = `${formatJsonReport(redacted)}${formatTextReport(redacted)}`;
    assert.equal(output.includes(privateValue), false);
    assert.equal(output.includes("<redacted>"), true);
  });

  test("redacts machine-specific absolute paths without hiding JSON pointers", () => {
    const posixPath = ["", "home", "operator", "private", "input.json"].join("/");
    const windowsPath = ["C:", "workspace", "private", "input.json"].join("\\");
    const networkPath = ["", "", "server", "private", "input.json"].join("\\");
    const report = createCommandReport("validate contract", [{
      exitCode: 2,
      ruleId: "CLI-INPUT",
      severity: "error",
      code: "CLI_INPUT_UNREADABLE",
      message: `Could not read ${posixPath}.`,
      artifactPath: windowsPath,
      jsonPointer: "/sharePoint/lists/0",
      remediation: `Move the input from ${networkPath}.`,
    }]);

    const output = formatJsonReport(redactCommandReport(report, []));
    assert.equal(output.includes(posixPath), false);
    assert.equal(output.includes(windowsPath), false);
    assert.equal(output.includes(networkPath), false);
    assert.equal(output.includes("/sharePoint/lists/0"), true);
  });
});
