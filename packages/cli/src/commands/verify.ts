import { stat } from "node:fs/promises";

import {
  createCommandReport,
  parseCliArgs,
  type CommandHandler,
  type ReportFinding,
} from "../parse-args.ts";
import { validateOfflineRepository } from "./offline-validation.ts";
import { scanPublicDataCommand } from "./scan-public-data.ts";

const OFFLINE_RESIDUAL_GATES = [
  "tenant-import",
  "tenant-rebind",
  "tenant-enablement",
  "tenant-run",
  "tenant-mutation",
  "tenant-readback",
  "publication-readback",
] as const;

const RULE_SPECIFIC_OFFLINE_GATES = [{
  ruleId: "HTTP-SEMANTIC-001",
  claimClass: "LIVE_SMOKE",
  residualGate: "rule:HTTP-SEMANTIC-001:LIVE_SMOKE",
}] as const;

export function createVerifyCommand(
  steps: readonly CommandHandler[],
  publicDataStep: CommandHandler = scanPublicDataCommand,
): CommandHandler {
  return {
    async run(args) {
      const parsed = parseCliArgs(args);
      if (parsed.kind !== "command" || parsed.route !== "verify") {
        throw new Error("verifyCommand received a different command route.");
      }

      try {
        if (!(await stat(parsed.root)).isDirectory()) {
          throw new Error("not a directory");
        }
      } catch {
        return createCommandReport("verify", [{
          exitCode: 2,
          ruleId: "CLI-INPUT",
          severity: "error",
          code: "CLI_ROOT_UNREADABLE",
          message: "The repository root could not be read as a directory.",
          artifactPath: "<repository>",
          remediation: "Provide a readable repository directory.",
        }]);
      }

      const findings: ReportFinding[] = [];
      let completedSteps = 0;
      const reports = steps.length === 0
        ? [await validateOfflineRepository(parsed.root, "offline validation")]
        : [];
      for (const step of steps) {
        reports.push(await step.run(args));
      }
      reports.push(await publicDataStep.run([
        "scan",
        "public-data",
        parsed.root,
        "--history",
      ]));
      for (const report of reports) {
        if (report.result === "PASS") {
          completedSteps += 1;
        }
        if (report.diagnostics.length === 0 && report.exitCode !== 0) {
          findings.push({
            exitCode: report.exitCode,
            ruleId: "CLI-ORCHESTRATION",
            severity: "error",
            code: "CLI_STEP_FAILED",
            message: "A verification step failed without a diagnostic.",
            artifactPath: "<repository>",
            remediation: "Inspect the failing validator.",
          });
        } else {
          findings.push(...report.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            exitCode: report.exitCode,
            ...(report.exitCode === 8 && diagnostic.residualGate !== undefined
              ? { notRun: true }
              : {}),
          })));
        }
      }

      findings.push(...OFFLINE_RESIDUAL_GATES.map((gate) => ({
        exitCode: 0 as const,
        ruleId: "RELEASE-LIFECYCLE",
        severity: "info" as const,
        code: `${gate.replaceAll("-", "_").toUpperCase()}_NOT_RUN`,
        message: "The tenant-only gate was not run during offline verification.",
        artifactPath: "<external>",
        remediation: "Keep this residual gate open until separately authorized evidence exists.",
        residualGate: gate,
        notRun: true,
      })));
      findings.push(...RULE_SPECIFIC_OFFLINE_GATES.map((gate) => ({
        exitCode: 0 as const,
        ruleId: gate.ruleId,
        severity: "info" as const,
        code: `${gate.ruleId.replaceAll("-", "_")}_${gate.claimClass}_NOT_RUN`,
        message: "The rule-specific runtime observation was not run during offline verification.",
        artifactPath: "<external>",
        remediation: "Keep this residual gate open until a controlled runtime response is observed.",
        residualGate: gate.residualGate,
        notRun: true,
      })));

      return createCommandReport("verify", findings, {
        applicableChecksCompleted: completedSteps > 0,
      });
    },
  };
}

export const verifyCommand = createVerifyCommand([]);
