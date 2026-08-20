import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { FlowDefinitionPreparationError, preparePowerAutomateDefinition } from "@spflow/core/flow-save";
import { createCommandReport, parseCliArgs, type CommandHandler, type CommandReport, type ReportFinding } from "../parse-args.ts";

function inputFailure(command: string, code: string, message: string, artifactPath: string): CommandReport {
  return createCommandReport(command, [{
    exitCode: 2, ruleId: "CLI-INPUT", severity: "error", code, message, artifactPath,
    remediation: "Provide readable synthetic JSON input files and run the command again.",
  }]);
}

async function readJson(path: string, label: string): Promise<{ value?: unknown; report?: CommandReport }> {
  let source: string;
  try { source = await readFile(resolve(path), "utf8"); }
  catch { return { report: inputFailure(label, "CLI_INPUT_UNREADABLE", `The ${label} input could not be read.`, path) }; }
  try { return { value: JSON.parse(source) as unknown }; }
  catch { return { report: inputFailure(label, "CLI_JSON_INVALID", `The ${label} input is not valid JSON.`, path) }; }
}

function preparationFailure(command: string, path: string, error: FlowDefinitionPreparationError): CommandReport {
  const finding: ReportFinding = {
    exitCode: 1, ruleId: `FLOW-PREPARATION-${error.code}`, severity: "error", code: error.code,
    message: error.message, artifactPath: path,
    ...(error.path === undefined ? {} : { jsonPointer: error.path }),
    remediation: "Correct the local definition or explicit connection-reference map; no connection is selected automatically.",
  };
  return createCommandReport(command, [finding]);
}

async function runPreparation(args: readonly string[], command: "prepare flow" | "validate flow"): Promise<CommandReport> {
  const parsed = parseCliArgs(args);
  if (parsed.kind !== "command" || (parsed.route !== "prepare-flow" && parsed.route !== "validate-flow")) throw new Error(`${command} handler received a different command route.`);
  const definitionInput = await readJson(parsed.definitionPath, "definition");
  if (definitionInput.report !== undefined) return definitionInput.report;
  const connectionsInput = await readJson(parsed.connectionsPath, "connection references");
  if (connectionsInput.report !== undefined) return connectionsInput.report;
  let prepared: unknown;
  try { prepared = preparePowerAutomateDefinition(definitionInput.value, connectionsInput.value); }
  catch (error) {
    if (error instanceof FlowDefinitionPreparationError) return preparationFailure(command, parsed.definitionPath, error);
    throw error;
  }
  if (parsed.route === "validate-flow") {
    return createCommandReport(command, [], { applicableChecksCompleted: true, data: { claimClass: "LOCAL_SYNTHETIC", providerGate: "NOT_VERIFIED", saveReadyLocally: true } });
  }
  if (parsed.outputPath !== undefined) {
    try { await writeFile(resolve(parsed.outputPath), `${JSON.stringify(prepared, null, 2)}\n`, "utf8"); }
    catch { return inputFailure(command, "CLI_OUTPUT_UNWRITABLE", "The explicit output path could not be written.", parsed.outputPath); }
    return createCommandReport(command, [], { applicableChecksCompleted: true, data: { outputPath: parsed.outputPath } });
  }
  return createCommandReport(command, [], { applicableChecksCompleted: true, data: { preparedDefinition: prepared } });
}

export const prepareFlowCommand: CommandHandler = { run: (args) => runPreparation(args, "prepare flow") };
export const validateFlowCommand: CommandHandler = { run: (args) => runPreparation(args, "validate flow") };
