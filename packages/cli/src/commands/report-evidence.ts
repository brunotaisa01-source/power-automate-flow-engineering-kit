import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createLocalEvidenceReport,
  type LocalEvidenceReportInput,
} from "@spflow/core/evidence-report";
import {
  createCommandReport,
  parseCliArgs,
  type CommandHandler,
  type CommandReport,
  type ReportFinding,
} from "../parse-args.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function inputFailure(code: string, message: string, path: string): CommandReport {
  return createCommandReport("report evidence", [{
    exitCode: 2,
    ruleId: "CLI-INPUT",
    severity: "error",
    code,
    message,
    artifactPath: path,
    remediation: "Provide a readable local synthetic evidence JSON file.",
  }]);
}

function boundaryFindings(): ReportFinding[] {
  return [
    {
      exitCode: 0,
      ruleId: "EVIDENCE-BOUNDARY",
      severity: "info",
      code: "PROVIDER_NOT_VERIFIED",
      message: "Provider evidence remains NOT_VERIFIED; this report contains local synthetic evidence only.",
      artifactPath: "<external>",
      remediation: "Keep the provider gate open until separately authorized provider readback exists.",
      residualGate: "provider-readback",
    },
    {
      exitCode: 0,
      ruleId: "EVIDENCE-BOUNDARY",
      severity: "info",
      code: "UAT_NOT_VERIFIED",
      message: "UAT evidence remains NOT_VERIFIED; this report contains no hosted or user-acceptance execution.",
      artifactPath: "<external>",
      remediation: "Keep the UAT gate open until separately authorized hosted and user-acceptance evidence exists.",
      residualGate: "uat",
    },
  ];
}

function reportFindings(
  evidence: ReturnType<typeof createLocalEvidenceReport>,
): ReportFinding[] {
  const findings: ReportFinding[] = evidence.diagnostics.map((diagnostic) => ({
    exitCode: diagnostic.severity === "error" ? 1 : 0,
    ruleId: `EVIDENCE-${diagnostic.code}`,
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    artifactPath: diagnostic.artifactPath,
    ...(diagnostic.jsonPointer === undefined ? {} : { jsonPointer: diagnostic.jsonPointer }),
    ...(diagnostic.expected === undefined ? {} : { expected: diagnostic.expected }),
    ...(diagnostic.actual === undefined ? {} : { actual: diagnostic.actual }),
    remediation: diagnostic.remediation ?? "Review the local synthetic evidence input and rerun the report.",
  }));

  if (evidence.result === "FAIL" && !findings.some(({ exitCode }) => exitCode === 1)) {
    findings.push({
      exitCode: 1,
      ruleId: "EVIDENCE-LOCAL",
      severity: "error",
      code: "LOCAL_EVIDENCE_FAILED",
      message: "A local synthetic evidence claim failed.",
      artifactPath: "<local-evidence>",
      remediation: "Correct the local diagnostic or artifact result before relying on the local claim.",
    });
  }
  if (evidence.result === "NOT_RUN") {
    findings.push({
      exitCode: 8,
      ruleId: "EVIDENCE-LOCAL",
      severity: "error",
      code: "LOCAL_EVIDENCE_NOT_RUN",
      message: "The local evidence report has no completed local claim.",
      artifactPath: "<local-evidence>",
      remediation: "Supply prepared definition diagnostics or existing local artifact results.",
      residualGate: "local-evidence",
      notRun: true,
    });
  }

  findings.push({
    exitCode: 0,
    ruleId: "EVIDENCE-LOCAL",
    severity: "info",
    code: "LOCAL_SYNTHETIC",
    message: `Local synthetic evidence claims=${evidence.claims.length} result=${evidence.result}.`,
    artifactPath: "<local-evidence>",
    remediation: "Treat this result as offline structural evidence only; provider and UAT gates remain open.",
  });
  findings.push(...boundaryFindings());
  return findings;
}

export const reportEvidenceCommand: CommandHandler = {
  async run(args) {
    const parsed = parseCliArgs(args);
    if (parsed.kind !== "command" || parsed.route !== "report-evidence") {
      throw new Error("reportEvidenceCommand received a different command route.");
    }

    let source: string;
    try {
      source = await readFile(resolve(parsed.path), "utf8");
    } catch {
      return inputFailure("CLI_INPUT_UNREADABLE", "The local evidence input could not be read.", parsed.path);
    }

    let input: unknown;
    try {
      input = JSON.parse(source) as unknown;
    } catch {
      return inputFailure("CLI_JSON_INVALID", "The local evidence input is not valid JSON.", parsed.path);
    }
    if (!isRecord(input)) {
      return inputFailure("CLI_JSON_SHAPE", "The local evidence input must be a JSON object.", parsed.path);
    }

    const evidence = createLocalEvidenceReport(input as LocalEvidenceReportInput);
    return createCommandReport("report evidence", reportFindings(evidence), { data: evidence });
  },
};
