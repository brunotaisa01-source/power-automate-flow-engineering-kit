import { readFile } from "node:fs/promises";

import {
  createCommandReport,
  createDeferredCommandReport,
  parseCliArgs,
  type CommandHandler,
} from "../parse-args.ts";

export const validateEvidenceCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "validate-evidence") {
      throw new Error("validateEvidenceCommand received a different command route.");
    }

    let evidence: unknown;
    try {
      evidence = JSON.parse(await readFile(parsed.path, "utf8")) as unknown;
    } catch {
      return createCommandReport("evidence validate", [{
        exitCode: 2,
        ruleId: "CLI-INPUT",
        severity: "error",
        code: "CLI_INPUT_UNREADABLE",
        message: "The evidence record could not be read as JSON.",
        artifactPath: "<input>",
        remediation: "Provide a readable JSON evidence record.",
      }]);
    }

    if (
      evidence !== null
      && typeof evidence === "object"
      && "schemaVersion" in evidence
      && (evidence as { schemaVersion?: unknown }).schemaVersion !== "1.0"
    ) {
      return createCommandReport("evidence validate", [{
        exitCode: 3,
        ruleId: "RELEASE-EVIDENCE",
        severity: "error",
        code: "CLI_PROFILE_UNSUPPORTED",
        message: "The evidence schema version is unsupported.",
        artifactPath: "<input>",
        remediation: "Use evidence schema version 1.0.",
      }]);
    }
    return createDeferredCommandReport("evidence validate", "evidence-validator");
  },
};
