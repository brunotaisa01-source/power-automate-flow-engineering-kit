import {
  parseArgs,
  type ParseArgsOptionsConfig,
} from "node:util";

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type OutputFormat = "json" | "text";
export type CommandRoute =
  | "prepare-flow"
  | "validate-flow"
  | "validate-contract"
  | "validate-rules"
  | "validate-artifact"
  | "validate-evidence"
  | "validate-connector"
  | "readonly-plugin"
  | "scan-public-data"
  | "learn-audit"
  | "learn-capture"
  | "learn-promote"
  | "verify";

export interface CommandDiagnostic {
  ruleId: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  artifactPath: string;
  jsonPointer?: string;
  expected?: unknown;
  actual?: unknown;
  remediation: string;
  residualGate?: string;
}

export interface CommandReport {
  schemaVersion: "1.0";
  command: string;
  result: "PASS" | "FAIL" | "NOT_RUN";
  exitCode: ExitCode;
  diagnostics: CommandDiagnostic[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    notRun: number;
  };
  data?: unknown;
}

export interface ReportFinding extends CommandDiagnostic {
  exitCode: ExitCode;
  notRun?: boolean;
}

export interface CommandHandler {
  run(args: readonly string[]): Promise<CommandReport>;
}

export type CliHandlers = Readonly<Record<CommandRoute, CommandHandler>>;

interface ParsedBase {
  kind: "command";
  route: CommandRoute;
  command: string;
  format: OutputFormat;
}

export type ParsedCliArgs =
  | { kind: "help"; format: OutputFormat }
  | (ParsedBase & { route: "prepare-flow"; definitionPath: string; connectionsPath: string; outputPath?: string })
  | (ParsedBase & { route: "validate-flow"; definitionPath: string; connectionsPath: string })
  | (ParsedBase & { route: "validate-contract"; path: string })
  | (ParsedBase & { route: "validate-rules"; root: string; requiredOnly: boolean })
  | (ParsedBase & {
      route: "validate-artifact";
      path: string;
      contractPath: string;
    })
  | (ParsedBase & { route: "validate-evidence"; path: string })
  | (ParsedBase & { route: "validate-connector"; path: string })
  | (ParsedBase & { route: "readonly-plugin"; operation: string; connector?: string })
  | (ParsedBase & {
      route: "scan-public-data";
      path: string;
      history: boolean;
    })
  | (ParsedBase & { route: "learn-audit"; path: string; executeBindings: boolean })
  | (ParsedBase & { route: "learn-capture"; path: string })
  | (ParsedBase & { route: "learn-promote"; path: string; reviewPath: string; reviewerRole: string })
  | (ParsedBase & { route: "verify"; root: string; offline: true });

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

const EXIT_PRECEDENCE: readonly ExitCode[] = [7, 4, 5, 6, 3, 2, 1, 8, 0];
const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareDiagnostics(left: CommandDiagnostic, right: CommandDiagnostic): number {
  return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || compareText(left.ruleId, right.ruleId)
    || compareText(left.artifactPath, right.artifactPath)
    || compareText(left.jsonPointer ?? "", right.jsonPointer ?? "")
    || compareText(left.code, right.code);
}

export function selectExitCode(exitCodes: readonly ExitCode[]): ExitCode {
  for (const exitCode of EXIT_PRECEDENCE) {
    if (exitCodes.includes(exitCode)) {
      return exitCode;
    }
  }
  return 0;
}

export function createCommandReport(
  command: string,
  findings: readonly ReportFinding[],
  options: { applicableChecksCompleted?: boolean; data?: unknown } = {},
): CommandReport {
  const exitCode = selectExitCode(findings.map((finding) => finding.exitCode));
  const diagnostics = findings.map(({ exitCode: _exitCode, notRun: _notRun, ...diagnostic }) =>
    diagnostic
  ).sort(compareDiagnostics);
  const summary = {
    errors: diagnostics.filter(({ severity }) => severity === "error").length,
    warnings: diagnostics.filter(({ severity }) => severity === "warning").length,
    info: diagnostics.filter(({ severity }) => severity === "info").length,
    notRun: findings.filter(({ notRun }) => notRun === true).length,
  };

  return {
    schemaVersion: "1.0",
    command,
    result: exitCode !== 0
      ? "FAIL"
      : options.applicableChecksCompleted !== true
          && findings.length > 0
          && findings.every(({ notRun }) => notRun === true)
      ? "NOT_RUN"
      : "PASS",
    exitCode,
    diagnostics,
    summary,
    ...(options.data === undefined ? {} : { data: options.data }),
  };
}

export function createDeferredCommandReport(
  command: string,
  residualGate: string,
): CommandReport {
  return createCommandReport(command, [{
    exitCode: 8,
    ruleId: "CLI-VALIDATOR",
    severity: "error",
    code: "CLI_VALIDATOR_NOT_RUN",
    message: "The requested local validation was not run because its engine is unavailable.",
    artifactPath: "<input>",
    remediation: "Keep this check open until its bounded validator package is implemented.",
    residualGate,
    notRun: true,
  }]);
}

function replaceSensitiveText(input: string, sensitiveValues: readonly string[]): string {
  let output = input;
  for (const value of [...sensitiveValues].filter(Boolean).sort((left, right) =>
    right.length - left.length || compareText(left, right)
  )) {
    output = output.replaceAll(value, "<redacted>");
  }

  return output
    .replace(/\b[A-Za-z]:[\\/][^\s"']+/g, "<redacted-path>")
    .replace(/\\\\[^\\\s]+\\[^\s"']+/g, "<redacted-path>")
    .replace(/(^|[\s(])\/(?:home|Users|tmp|var|private)\/[^\s"']+/g, "$1<redacted-path>")
    .replace(/\bhttps?:\/\/(?![^\s/]*\.example\.test\b)[^\s"']+/g, "<redacted-url>")
    .replace(/\b(?!user@example\.test\b)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<redacted-email>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "<redacted-id>");
}

function redactValue(value: unknown, sensitiveValues: readonly string[]): unknown {
  if (typeof value === "string") {
    return replaceSensitiveText(value, sensitiveValues);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, sensitiveValues));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        replaceSensitiveText(key, sensitiveValues),
        redactValue(item, sensitiveValues),
      ]),
    );
  }
  return value;
}

export function redactCommandReport(
  report: CommandReport,
  sensitiveValues: readonly string[],
): CommandReport {
  return redactValue(report, sensitiveValues) as CommandReport;
}

function parseFormat(value: string | undefined): OutputFormat {
  if (value === undefined) {
    return "text";
  }
  if (value === "json" || value === "text") {
    return value;
  }
  throw new CliUsageError("--format must be 'text' or 'json'.");
}

function requiredOption(value: string | undefined, message: string): string {
  if (value === undefined || value.length === 0) {
    throw new CliUsageError(message);
  }
  return value;
}

function parseOptions<const T extends ParseArgsOptionsConfig>(
  args: readonly string[],
  options: T,
  command: string,
) {
  try {
    return parseArgs({
      args: [...args],
      options,
      allowPositionals: true,
      strict: true,
    } as const);
  } catch (error) {
    if (error instanceof CliUsageError) {
      throw error;
    }
    throw new CliUsageError(
      `Invalid options for ${command}. Run 'spflow help' for usage.`,
    );
  }
}

export function requestedOutputFormat(args: readonly string[]): OutputFormat {
  const equalsValue = args.find((arg) => arg.startsWith("--format="))?.slice("--format=".length);
  if (equalsValue === "json") {
    return "json";
  }
  const index = args.lastIndexOf("--format");
  return index >= 0 && args[index + 1] === "json" ? "json" : "text";
}

export function parseCliArgs(args: readonly string[]): ParsedCliArgs {
  if (
    args.length === 0
    || (args.length === 1 && ["help", "--help", "-h"].includes(args[0] ?? ""))
  ) {
    return { kind: "help", format: "text" };
  }

  const first = args[0];
  const second = args[1];
  if (first === "prepare" && second === "flow") {
    const parsed = parseOptions(args.slice(2), { connections: { type: "string" }, output: { type: "string" }, format: { type: "string" } }, "prepare flow");
    if (parsed.positionals.length !== 1) throw new CliUsageError("prepare flow requires exactly one definition path.");
    const outputPath = typeof parsed.values.output === "string" ? parsed.values.output : undefined;
    return {
      kind: "command", route: "prepare-flow", command: "prepare flow", format: parseFormat(parsed.values.format),
      definitionPath: parsed.positionals[0] ?? "",
      connectionsPath: requiredOption(parsed.values.connections, "prepare flow requires --connections <path>."),
      ...(outputPath === undefined ? {} : { outputPath }),
    };
  }
  if (first === "validate" && second === "flow") {
    const parsed = parseOptions(args.slice(2), { connections: { type: "string" }, format: { type: "string" } }, "validate flow");
    if (parsed.positionals.length !== 1) throw new CliUsageError("validate flow requires exactly one definition path.");
    return {
      kind: "command", route: "validate-flow", command: "validate flow", format: parseFormat(parsed.values.format),
      definitionPath: parsed.positionals[0] ?? "",
      connectionsPath: requiredOption(parsed.values.connections, "validate flow requires --connections <path>."),
    };
  }
  if (first === "validate" && second === "contract") {
    const parsed = parseOptions(args.slice(2), { format: { type: "string" } }, "validate contract");
    if (parsed.positionals.length !== 1) {
      throw new CliUsageError("validate contract requires exactly one project contract path.");
    }
    return {
      kind: "command",
      route: "validate-contract",
      command: "validate contract",
      format: parseFormat(parsed.values.format),
      path: parsed.positionals[0] ?? "",
    };
  }
  if (first === "validate" && second === "rules") {
    const parsed = parseOptions(
      args.slice(2),
      {
        root: { type: "string" },
        "required-only": { type: "boolean" },
        format: { type: "string" },
      },
      "validate rules",
    );
    if (parsed.positionals.length !== 0) {
      throw new CliUsageError("validate rules accepts no positional arguments.");
    }
    return {
      kind: "command",
      route: "validate-rules",
      command: "validate rules",
      format: parseFormat(parsed.values.format),
      root: requiredOption(parsed.values.root, "validate rules requires --root <repository>."),
      requiredOnly: parsed.values["required-only"] ?? false,
    };
  }
  if (first === "validate" && second === "artifact") {
    const parsed = parseOptions(
      args.slice(2),
      { contract: { type: "string" }, format: { type: "string" } },
      "validate artifact",
    );
    if (parsed.positionals.length !== 1) {
      throw new CliUsageError("validate artifact requires exactly one artifact path.");
    }
    return {
      kind: "command",
      route: "validate-artifact",
      command: "validate artifact",
      format: parseFormat(parsed.values.format),
      path: parsed.positionals[0] ?? "",
      contractPath: requiredOption(
        parsed.values.contract,
        "validate artifact requires --contract <project contract>.",
      ),
    };
  }
  if (first === "evidence" && second === "validate") {
    const parsed = parseOptions(args.slice(2), { format: { type: "string" } }, "evidence validate");
    if (parsed.positionals.length !== 1) {
      throw new CliUsageError("evidence validate requires exactly one evidence path.");
    }
    return {
      kind: "command",
      route: "validate-evidence",
      command: "evidence validate",
      format: parseFormat(parsed.values.format),
      path: parsed.positionals[0] ?? "",
    };
  }
  if (first === "validate" && second === "connector") {
    const parsed = parseOptions(args.slice(2), { format: { type: "string" } }, "validate connector");
    if (parsed.positionals.length !== 1) throw new CliUsageError("validate connector requires exactly one profile path.");
    return { kind: "command", route: "validate-connector", command: "validate connector", format: parseFormat(parsed.values.format), path: parsed.positionals[0] ?? "" };
  }
  if (first === "plugin" && second === "readonly") {
    const parsed = parseOptions(args.slice(2), { connector: { type: "string" }, format: { type: "string" } }, "plugin readonly");
    if (parsed.positionals.length !== 1) throw new CliUsageError("plugin readonly requires exactly one operation.");
    const connector = typeof parsed.values.connector === "string" ? parsed.values.connector : undefined;
    return connector === undefined
      ? { kind: "command", route: "readonly-plugin", command: "plugin readonly", format: parseFormat(parsed.values.format), operation: parsed.positionals[0] ?? "" }
      : { kind: "command", route: "readonly-plugin", command: "plugin readonly", format: parseFormat(parsed.values.format), operation: parsed.positionals[0] ?? "", connector };
  }
  if (first === "scan" && second === "public-data") {
    const parsed = parseOptions(
      args.slice(2),
      { history: { type: "boolean" }, format: { type: "string" } },
      "scan public-data",
    );
    if (parsed.positionals.length !== 1) {
      throw new CliUsageError("scan public-data requires exactly one path.");
    }
    return {
      kind: "command",
      route: "scan-public-data",
      command: "scan public-data",
      format: parseFormat(parsed.values.format),
      path: parsed.positionals[0] ?? "",
      history: parsed.values.history ?? false,
    };
  }
  if (first === "learn" && second === "audit") {
    const parsed = parseOptions(args.slice(2), { execute: { type: "boolean" }, format: { type: "string" } }, "learn audit");
    if (parsed.positionals.length !== 1) {
      throw new CliUsageError("learn audit requires exactly one registry path.");
    }
    return {
      kind: "command",
      route: "learn-audit",
      command: "learn audit",
      format: parseFormat(parsed.values.format),
      path: parsed.positionals[0] ?? "",
      executeBindings: parsed.values.execute ?? false,
    };
  }
  if (first === "learn" && second === "capture") {
    const parsed = parseOptions(args.slice(2), { format: { type: "string" } }, "learn capture");
    if (parsed.positionals.length !== 1) throw new CliUsageError("learn capture requires exactly one candidate path.");
    return { kind: "command", route: "learn-capture", command: "learn capture", format: parseFormat(parsed.values.format), path: parsed.positionals[0] ?? "" };
  }
  if (first === "learn" && second === "promote") {
    const parsed = parseOptions(args.slice(2), { review: { type: "string" }, "reviewer-role": { type: "string" }, format: { type: "string" } }, "learn promote");
    if (parsed.positionals.length !== 1) throw new CliUsageError("learn promote requires exactly one candidate path.");
    if (typeof parsed.values.review !== "string" || typeof parsed.values["reviewer-role"] !== "string") throw new CliUsageError("learn promote requires --review <path> and --reviewer-role <role>.");
    return { kind: "command", route: "learn-promote", command: "learn promote", format: parseFormat(parsed.values.format), path: parsed.positionals[0] ?? "", reviewPath: parsed.values.review, reviewerRole: parsed.values["reviewer-role"] };
  }
  if (first === "verify") {
    const parsed = parseOptions(
      args.slice(1),
      {
        root: { type: "string" },
        offline: { type: "boolean" },
        format: { type: "string" },
      },
      "verify",
    );
    if (parsed.positionals.length !== 0) {
      throw new CliUsageError("verify accepts no positional arguments.");
    }
    if (parsed.values.offline !== true) {
      throw new CliUsageError("verify requires --offline; no online verifier is available.");
    }
    return {
      kind: "command",
      route: "verify",
      command: "verify",
      format: parseFormat(parsed.values.format),
      root: requiredOption(parsed.values.root, "verify requires --root <repository>."),
      offline: true,
    };
  }

  throw new CliUsageError("Unknown command. Run 'spflow help' for usage.");
}
