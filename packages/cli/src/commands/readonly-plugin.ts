import { runReadonlyPlugin } from "@spflow/core/readonly-plugin";

import { createCommandReport, parseCliArgs, type CommandHandler, type ReportFinding } from "../parse-args.ts";

export const readonlyPluginCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "readonly-plugin") throw new Error("readonlyPluginCommand received a different command route.");
    try {
      const data = await runReadonlyPlugin(process.cwd(), parsed.connector === undefined ? { operation: parsed.operation } : { operation: parsed.operation, connector: parsed.connector });
      return createCommandReport("plugin readonly", [], { applicableChecksCompleted: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Read-only plugin operation failed.";
      const code = message.startsWith("READONLY_PLUGIN_FORBIDDEN_OPERATION") ? "READONLY_PLUGIN_FORBIDDEN_OPERATION" : "READONLY_PLUGIN_FAILED";
      const findings: ReportFinding[] = [{ exitCode: 1, ruleId: "PLUGIN-READONLY-001", severity: "error", code, message, artifactPath: "<readonly-plugin>", remediation: "Use only documented read-only operations; no tenant or mutation operation is available." }];
      return createCommandReport("plugin readonly", findings);
    }
  },
};
