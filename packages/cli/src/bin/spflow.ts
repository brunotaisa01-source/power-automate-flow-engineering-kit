#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { learnAuditCommand, learnCaptureCommand, learnPromoteCommand } from "../commands/learn.ts";
import { scanPublicDataCommand } from "../commands/scan-public-data.ts";
import { validateArtifactCommand } from "../commands/validate-artifact.ts";
import { validateContractCommand } from "../commands/validate-contract.ts";
import { validateEvidenceCommand } from "../commands/validate-evidence.ts";
import { validateRulesCommand } from "../commands/validate-rules.ts";
import { verifyCommand } from "../commands/verify.ts";
import {
  CliUsageError,
  createCommandReport,
  parseCliArgs,
  redactCommandReport,
  requestedOutputFormat,
  type CliHandlers,
  type CommandReport,
  type ExitCode,
} from "../parse-args.ts";
import { formatJsonReport } from "../reporters/json.ts";
import { formatTextReport } from "../reporters/text.ts";

export const HELP_TEXT = [
  "Usage: spflow <command> [options]",
  "",
  "Commands:",
  "  validate contract <path> [--format text|json]",
  "  validate rules --root <repository> [--required-only] [--format text|json]",
  "  validate artifact <path> --contract <path> [--format text|json]",
  "  evidence validate <path> [--format text|json]",
  "  scan public-data <path> [--history] [--format text|json]",
  "  learn audit <registry-path> [--execute] [--format text|json]",
  "  learn capture <candidate-path> [--format text|json]",
  "  learn promote <candidate-path> --review <path> --reviewer-role <role> [--format text|json]",
  "  verify --root <repository> --offline [--format text|json]",
  "",
].join("\n");

const DEFAULT_HANDLERS: CliHandlers = {
  "validate-contract": validateContractCommand,
  "validate-rules": validateRulesCommand,
  "validate-artifact": validateArtifactCommand,
  "validate-evidence": validateEvidenceCommand,
  "scan-public-data": scanPublicDataCommand,
  "learn-audit": learnAuditCommand,
  "learn-capture": learnCaptureCommand,
  "learn-promote": learnPromoteCommand,
  verify: verifyCommand,
};

export interface CliIo {
  stdout(value: string): void;
  stderr(value: string): void;
}

export interface ExecuteCliOptions extends CliIo {
  handlers?: Partial<CliHandlers>;
  env?: NodeJS.ProcessEnv;
}

function bindingValues(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(([key, value]) => key.startsWith("SPFLOW_BINDING_") && value !== undefined)
    .map(([, value]) => value ?? "")
    .filter(Boolean);
}

function argumentErrorReport(message: string): CommandReport {
  return createCommandReport("argument parsing", [{
    exitCode: 2,
    ruleId: "CLI-ARGUMENT",
    severity: "error",
    code: "CLI_ARGUMENT_INVALID",
    message,
    artifactPath: "<command-line>",
    remediation: "Run 'spflow help' and correct the command arguments.",
  }]);
}

function internalErrorReport(): CommandReport {
  return createCommandReport("internal error", [{
    exitCode: 7,
    ruleId: "CLI-INTERNAL",
    severity: "error",
    code: "CLI_INTERNAL_ERROR",
    message: "The CLI encountered an internal error; details were redacted.",
    artifactPath: "<internal>",
    remediation: "Run the command again with synthetic inputs and report the stable error code.",
  }]);
}

function writeReport(report: CommandReport, format: "json" | "text", io: CliIo): void {
  io.stdout(format === "json" ? formatJsonReport(report) : formatTextReport(report));
}

export async function executeCli(
  args: readonly string[],
  options: ExecuteCliOptions,
): Promise<ExitCode> {
  const env = options.env ?? process.env;
  const sensitiveValues = bindingValues(env);
  const format = requestedOutputFormat(args);
  try {
    const parsed = parseCliArgs(args);
    if (parsed.kind === "help") {
      options.stdout(HELP_TEXT);
      return 0;
    }
    const handlers: CliHandlers = { ...DEFAULT_HANDLERS, ...options.handlers };
    const report = await handlers[parsed.route].run(args);
    const redacted = redactCommandReport(report, sensitiveValues);
    writeReport(redacted, parsed.format, options);
    return redacted.exitCode;
  } catch (error) {
    const report = error instanceof CliUsageError
      ? argumentErrorReport(error.message)
      : internalErrorReport();
    const redacted = redactCommandReport(report, sensitiveValues);
    writeReport(redacted, format, options);
    return redacted.exitCode;
  }
}

async function main(): Promise<void> {
  process.exitCode = await executeCli(process.argv.slice(2), {
    stdout(value) {
      process.stdout.write(value);
    },
    stderr(value) {
      process.stderr.write(value);
    },
  });
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  await main();
}
