import {
  parseCliArgs,
  type CommandHandler,
} from "../parse-args.ts";
import { validateOfflineRepository } from "./offline-validation.ts";

export const validateRulesCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "validate-rules") {
      throw new Error("validateRulesCommand received a different command route.");
    }

    return validateOfflineRepository(parsed.root, "validate rules");
  },
};
