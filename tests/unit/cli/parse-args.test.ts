import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  CliUsageError,
  parseCliArgs,
} from "../../../packages/cli/src/parse-args.ts";

describe("CLI argument parsing", () => {
  const commandCases = [
    {
      args: ["validate", "contract", "project.contract.json", "--format", "json"],
      expected: {
        kind: "command",
        route: "validate-contract",
        command: "validate contract",
        format: "json",
        path: "project.contract.json",
      },
    },
    {
      args: ["validate", "rules", "--root", "."],
      expected: {
        kind: "command",
        route: "validate-rules",
        command: "validate rules",
        format: "text",
        root: ".",
        requiredOnly: false,
      },
    },
    {
      args: ["validate", "rules", "--root", ".", "--required-only", "--format", "json"],
      expected: {
        kind: "command",
        route: "validate-rules",
        command: "validate rules",
        format: "json",
        root: ".",
        requiredOnly: true,
      },
    },
    {
      args: [
        "validate",
        "artifact",
        "artifacts/package.zip",
        "--contract",
        "project.contract.json",
      ],
      expected: {
        kind: "command",
        route: "validate-artifact",
        command: "validate artifact",
        format: "text",
        path: "artifacts/package.zip",
        contractPath: "project.contract.json",
      },
    },
    {
      args: ["evidence", "validate", "evidence/local.json"],
      expected: {
        kind: "command",
        route: "validate-evidence",
        command: "evidence validate",
        format: "text",
        path: "evidence/local.json",
      },
    },
    {
      args: ["scan", "public-data", ".", "--history"],
      expected: {
        kind: "command",
        route: "scan-public-data",
        command: "scan public-data",
        format: "text",
        path: ".",
        history: true,
      },
    },
    {
      args: ["verify", "--root", ".", "--offline", "--format=json"],
      expected: {
        kind: "command",
        route: "verify",
        command: "verify",
        format: "json",
        root: ".",
        offline: true,
      },
    },
  ] as const;

  for (const fixture of commandCases) {
    test(`parses ${fixture.expected.command}`, () => {
      assert.deepEqual(parseCliArgs(fixture.args), fixture.expected);
    });
  }

  test("returns deterministic help for an empty command or explicit help", () => {
    assert.deepEqual(parseCliArgs([]), { kind: "help", format: "text" });
    assert.deepEqual(parseCliArgs(["help"]), { kind: "help", format: "text" });
    assert.deepEqual(parseCliArgs(["--help"]), { kind: "help", format: "text" });
  });

  const invalidCases = [
    { args: ["unknown"], message: "Unknown command. Run 'spflow help' for usage." },
    {
      args: ["validate", "contract"],
      message: "validate contract requires exactly one project contract path.",
    },
    {
      args: ["validate", "rules"],
      message: "validate rules requires --root <repository>.",
    },
    {
      args: ["validate", "artifact", "package.zip"],
      message: "validate artifact requires --contract <project contract>.",
    },
    {
      args: ["verify", "--root", "."],
      message: "verify requires --offline; no online verifier is available.",
    },
    {
      args: ["scan", "public-data", ".", "--offline"],
      message: "Invalid options for scan public-data. Run 'spflow help' for usage.",
    },
    {
      args: ["verify", "--root", ".", "--offline", "--format", "yaml"],
      message: "--format must be 'text' or 'json'.",
    },
  ] as const;

  for (const fixture of invalidCases) {
    test(`rejects ${fixture.args.join(" ")}`, () => {
      assert.throws(
        () => parseCliArgs(fixture.args),
        (error: unknown) =>
          error instanceof CliUsageError && error.message === fixture.message,
      );
    });
  }
});
