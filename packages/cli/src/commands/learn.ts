import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  auditLearningRegistry,
  captureLearningCandidate,
  promoteLearningCandidate,
} from "@spflow/core/self-improvement";

import {
  createCommandReport,
  parseCliArgs,
  type CommandHandler,
  type ReportFinding,
} from "../parse-args.ts";

function failure(command: string, error: unknown): ReturnType<typeof createCommandReport> {
  const message = error instanceof Error ? error.message : "The learning operation failed.";
  const finding: ReportFinding = {
    exitCode: 1,
    ruleId: "SELF-IMPROVEMENT-001",
    severity: "error",
    code: "SELF_LEARNING_OPERATION_FAILED",
    message,
    artifactPath: "<learning>",
    remediation: "Preserve the candidate and RED evidence, fix the local gate, obtain independent review, and retry.",
  };
  return createCommandReport(command, [finding], { applicableChecksCompleted: true });
}

function rootFromRegistry(path: string): string {
  return resolve(path, "..", "..", "..");
}

function rootFromCandidate(path: string): string {
  return resolve(path, "..", "..", "..", "..");
}

export const learnAuditCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "learn-audit") throw new Error("learnAuditCommand received a different command route.");
    const registryPath = resolve(parsed.path);
    const result = await auditLearningRegistry(rootFromRegistry(registryPath), registryPath, { executeBindings: parsed.executeBindings });
    const findings: ReportFinding[] = result.diagnostics.map((diagnostic) => ({
      exitCode: diagnostic.code === "SELF_LEARNING_PRIVATE_DATA" ? 5 : 1,
      ruleId: "SELF-IMPROVEMENT-001",
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      artifactPath: diagnostic.path,
      remediation: "Preserve the RED lesson, add executable GREEN and positive-control evidence, obtain independent review, sanitize the record, and rerun learn audit.",
    }));
    return createCommandReport("learn audit", findings, { applicableChecksCompleted: true });
  },
};

export const learnCaptureCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "learn-capture") throw new Error("learnCaptureCommand received a different command route.");
    try {
      const candidatePath = resolve(parsed.path);
      const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as Record<string, unknown>;
      await captureLearningCandidate(rootFromCandidate(candidatePath), candidatePath, candidate);
      return createCommandReport("learn capture", [], { applicableChecksCompleted: true });
    } catch (error) {
      return failure("learn capture", error);
    }
  },
};

export const learnPromoteCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "learn-promote") throw new Error("learnPromoteCommand received a different command route.");
    try {
      const candidatePath = resolve(parsed.path);
      await promoteLearningCandidate(rootFromCandidate(candidatePath), candidatePath, parsed.reviewPath, parsed.reviewerRole);
      return createCommandReport("learn promote", [], { applicableChecksCompleted: true });
    } catch (error) {
      return failure("learn promote", error);
    }
  },
};
