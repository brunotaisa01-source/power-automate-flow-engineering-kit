import { stat } from "node:fs/promises";

import {
  createCommandReport,
  createDeferredCommandReport,
  parseCliArgs,
  type CommandHandler,
} from "../parse-args.ts";

export const scanPublicDataCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "scan-public-data") {
      throw new Error("scanPublicDataCommand received a different command route.");
    }
    try {
      await stat(parsed.path);
    } catch {
      return createCommandReport("scan public-data", [{
        exitCode: 2,
        ruleId: "CLI-INPUT",
        severity: "error",
        code: "CLI_INPUT_UNREADABLE",
        message: "The requested scan path could not be read.",
        artifactPath: "<input>",
        remediation: "Provide a readable file or directory.",
      }]);
    }
    return createDeferredCommandReport("scan public-data", "public-data-scanner");
  },
};
