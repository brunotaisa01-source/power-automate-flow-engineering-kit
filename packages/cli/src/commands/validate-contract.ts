import { readFile } from "node:fs/promises";

import { validateProjectContract } from "@spflow/core/schema-loader";

import {
  createCommandReport,
  parseCliArgs,
  type CommandHandler,
  type ReportFinding,
} from "../parse-args.ts";

function invalidInput(code: string, message: string): ReturnType<typeof createCommandReport> {
  return createCommandReport("validate contract", [{
    exitCode: 2,
    ruleId: "CLI-INPUT",
    severity: "error",
    code,
    message,
    artifactPath: "<input>",
    remediation: "Provide a readable JSON project contract.",
  }]);
}

export const validateContractCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "validate-contract") {
      throw new Error("validateContractCommand received a different command route.");
    }

    let value: unknown;
    try {
      value = JSON.parse(await readFile(parsed.path, "utf8")) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) {
        return invalidInput("CLI_JSON_INVALID", "The project contract is not valid JSON.");
      }
      return invalidInput("CLI_INPUT_UNREADABLE", "The project contract could not be read.");
    }

    if (
      value !== null
      && typeof value === "object"
      && "schemaVersion" in value
      && (value as { schemaVersion?: unknown }).schemaVersion !== "1.0"
    ) {
      return createCommandReport("validate contract", [{
        exitCode: 3,
        ruleId: "CONTRACT-PROFILE",
        severity: "error",
        code: "CLI_PROFILE_UNSUPPORTED",
        message: "The project contract schema version is unsupported.",
        artifactPath: "<input>",
        jsonPointer: "/schemaVersion",
        remediation: "Use project contract schema version 1.0.",
      }]);
    }

    const validation = validateProjectContract(value);
    const findings: ReportFinding[] = validation.diagnostics.map((diagnostic) => ({
      exitCode: diagnostic.code === "CONTRACT_BINDING_EXAMPLE_FORBIDDEN" ? 5 : 1,
      ruleId: diagnostic.code,
      severity: "error",
      code: diagnostic.code,
      message: diagnostic.message,
      artifactPath: "<input>",
      ...(diagnostic.path === "" ? {} : { jsonPointer: diagnostic.path }),
      remediation: "Correct the project contract and run validation again.",
    }));
    return createCommandReport("validate contract", findings);
  },
};
