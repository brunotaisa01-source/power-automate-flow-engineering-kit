import type { CommandDiagnostic, CommandReport } from "../parse-args.ts";

function formatDiagnostic(diagnostic: CommandDiagnostic): string {
  const location = diagnostic.jsonPointer === undefined
    ? diagnostic.artifactPath
    : `${diagnostic.artifactPath}#${diagnostic.jsonPointer}`;
  const residual = diagnostic.residualGate === undefined
    ? ""
    : ` NOT_RUN=${diagnostic.residualGate}`;
  return `${diagnostic.severity.toUpperCase()} ${diagnostic.code} ${location}: `
    + `${diagnostic.message} Remediation: ${diagnostic.remediation}.${residual}\n`;
}

export function formatTextReport(report: CommandReport): string {
  const summary = report.summary;
  return `spflow ${report.command}: ${report.result} (exit ${report.exitCode})\n`
    + `errors=${summary.errors} warnings=${summary.warnings} info=${summary.info} notRun=${summary.notRun}\n`
    + report.diagnostics.map(formatDiagnostic).join("");
}
