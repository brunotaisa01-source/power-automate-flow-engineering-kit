import { resolve } from "node:path";

import { validateConnectorProfileFile } from "@spflow/core/connector-profile";

import { createCommandReport, parseCliArgs, type CommandHandler, type ReportFinding } from "../parse-args.ts";

export const validateConnectorCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "validate-connector") throw new Error("validateConnectorCommand received a different command route.");
    const profilePath = resolve(parsed.path);
    const result = await validateConnectorProfileFile(profilePath);
    const findings: ReportFinding[] = result.diagnostics.map((diagnostic) => ({
      exitCode: 1,
      ruleId: "CONNECTOR-PROFILE-001",
      severity: "error" as const,
      code: diagnostic.code,
      message: diagnostic.message,
      artifactPath: diagnostic.path,
      remediation: "Fix the connector profile contract, operation semantics, response/readback, concurrency, retry, idempotency, and mutation closure before trusting the synthetic profile.",
    }));
    return createCommandReport("validate connector", findings, { applicableChecksCompleted: true });
  },
};
