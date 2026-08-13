import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createCommandReport,
  parseCliArgs,
  type CommandHandler,
} from "../parse-args.ts";
import {
  contractRoot,
  loadOfflineValidationContext,
  validateOfflineContext,
} from "./offline-validation.ts";

export const validateArtifactCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "validate-artifact") {
      throw new Error("validateArtifactCommand received a different command route.");
    }

    const root = contractRoot(parsed.contractPath);
    const loaded = await loadOfflineValidationContext(
      root,
      parsed.contractPath,
      "validate artifact",
    );
    if (loaded.kind === "failure") {
      return loaded.report;
    }

    let requestedPath: string;
    try {
      requestedPath = await realpath(resolve(parsed.path));
    } catch {
      return createCommandReport("validate artifact", [{
        exitCode: 2,
        ruleId: "CLI-INPUT",
        severity: "error",
        code: "CLI_INPUT_UNREADABLE",
        message: "The requested package artifact could not be read.",
        artifactPath: "<input>",
        remediation: "Provide a readable package declared by the project contract.",
      }]);
    }
    const declared = await Promise.all(loaded.context.contract.packages.map(async ({ path }) => {
      try {
        return await realpath(resolve(root, ...path.split("/")));
      } catch {
        return undefined;
      }
    }));
    if (!declared.includes(requestedPath)) {
      return createCommandReport("validate artifact", [{
        exitCode: 2,
        ruleId: "CLI-INPUT",
        severity: "error",
        code: "CLI_ARTIFACT_UNDECLARED",
        message: "The requested package is not declared by the project contract.",
        artifactPath: "<input>",
        remediation: "Validate a package path declared by the project contract.",
      }]);
    }

    return validateOfflineContext("validate artifact", loaded.context);
  },
};
