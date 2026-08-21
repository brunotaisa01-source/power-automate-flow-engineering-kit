import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import {
  aggregateWorkspaceResults,
  validateWorkspaceManifest,
  type WorkspaceDiagnostic,
  type WorkspaceManifest,
  type WorkspaceProject,
  type WorkspaceProjectResult,
  type WorkspaceRegistryAudit,
} from "@spflow/core/workspace-control";
import { auditLearningRegistry } from "@spflow/core/self-improvement";

import {
  createCommandReport,
  parseCliArgs,
  type CommandReport,
  type ExitCode,
  type ReportFinding,
} from "../parse-args.ts";

export interface WorkspaceRunResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface WorkspaceRunner {
  (
    command: string,
    args: readonly string[],
    options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly shell: boolean },
  ): WorkspaceRunResult;
}

export interface WorkspaceCheckOptions {
  readonly runner?: WorkspaceRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

function isContained(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith("..\\") && !path.startsWith("../") && !isAbsolute(path);
}

async function resolveManifest(path: string): Promise<string> {
  const absolute = resolve(path);
  if ((await lstat(absolute)).isSymbolicLink()) {
    throw new Error("Workspace manifests must not be symlinks.");
  }
  return realpath(absolute);
}

async function resolveContainedExisting(root: string, candidate: string): Promise<string | undefined> {
  const direct = resolve(root, candidate);
  if (!isContained(root, direct)) return undefined;
  try {
    const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(direct)]);
    return isContained(realRoot, realCandidate) ? realCandidate : undefined;
  } catch {
    return undefined;
  }
}

function exitCode(value: number | null): number {
  return value === null || !Number.isSafeInteger(value) ? 1 : value;
}

function reportExitCode(value: number): ExitCode {
  return value >= 0 && value <= 8 ? value as ExitCode : 1;
}

function redactOutput(value: string, sensitiveValues: readonly string[]): string {
  let output = value;
  for (const sensitive of [...sensitiveValues].filter(Boolean).sort((left, right) => right.length - left.length)) {
    output = output.replaceAll(sensitive, "<redacted>");
  }
  return output
    .replace(/\b((?:(?:client|access|refresh)[_.-]?(?:secret|token))|password|token|secret|api[_.-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>")
    .replace(/\b[A-Za-z]:[\\/][^\s"']+/g, "<redacted-path>")
    .replace(/\\\\[^\\\s]+\\[^\s"']+/g, "<redacted-path>")
    .replace(/(^|[\s(])\/(?:home|Users|tmp|var|private)\/[^\s"']+/g, "$1<redacted-path>")
    .replace(/\b(?!user@example\.test\b)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<redacted-email>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "<redacted-id>")
    .slice(0, 4000);
}

function minimalEnvironment(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { npm_config_loglevel: "error" };
  if (env.PATH !== undefined) result.PATH = env.PATH;
  if (platform === "win32" && env.SystemRoot !== undefined) result.SystemRoot = env.SystemRoot;
  return result;
}

function npmExecutable(platform: NodeJS.Platform): string {
  return platform === "win32" ? "npm.cmd" : "npm";
}

function defaultRunner(command: string, args: readonly string[], options: Parameters<WorkspaceRunner>[2]): WorkspaceRunResult {
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    shell: options.shell,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    exitCode: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

function manifestFinding(diagnostic: WorkspaceDiagnostic): ReportFinding {
  return {
    exitCode: 1,
    ruleId: "WORKSPACE-MANIFEST-001",
    severity: "error",
    code: diagnostic.code,
    message: "The workspace manifest contains an invalid or unsafe value.",
    artifactPath: "<workspace-manifest>",
    jsonPointer: diagnostic.path,
    remediation: "Use the strict workspace manifest schema with safe relative paths and exact npm run check commands.",
  };
}

function unreadableManifestReport(): CommandReport {
  return createCommandReport("workspace check", [{
    exitCode: 2,
    ruleId: "WORKSPACE-MANIFEST-001",
    severity: "error",
    code: "WORKSPACE_MANIFEST_UNREADABLE",
    message: "The workspace manifest could not be read as safe JSON.",
    artifactPath: "<workspace-manifest>",
    remediation: "Provide a readable non-symlink JSON workspace manifest.",
  }], { applicableChecksCompleted: true });
}

function registryRoot(registryPath: string): string {
  return resolve(registryPath, "..", "..", "..");
}

function registryAuditFailure(diagnostics: readonly { code: string }[]): ReportFinding[] {
  return diagnostics.map(({ code }) => ({
    exitCode: code.includes("PRIVATE") || code.includes("CREDENTIAL") || code.includes("TOKEN") ? 5 : 1,
    ruleId: "WORKSPACE-REGISTRY-001",
    severity: "error" as const,
    code: "WORKSPACE_REGISTRY_AUDIT_FAILED",
    message: "The governed learning registry failed its audit; project checks were not run.",
    artifactPath: "<workspace-registry>",
    remediation: "Resolve the registry audit diagnostics before running project checks.",
  }));
}

function projectFailure(project: WorkspaceProject, outcome: WorkspaceRunResult, sensitiveValues: readonly string[]): ReportFinding {
  const output = redactOutput(`${outcome.stdout}\n${outcome.stderr}`.trim(), sensitiveValues);
  return {
    exitCode: project.required ? reportExitCode(exitCode(outcome.exitCode)) : 0,
    ruleId: "WORKSPACE-PROJECT-001",
    severity: project.required ? "error" : "warning",
    code: "WORKSPACE_PROJECT_CHECK_FAILED",
    message: output.length === 0
      ? `Project '${project.id}' exited non-zero.`
      : `Project '${project.id}' exited non-zero. Output: ${output}`,
    artifactPath: "<workspace-project>",
    remediation: "Run the project's fixed npm run check command and resolve its local diagnostics.",
  };
}

async function projectRoot(manifestDirectory: string, project: WorkspaceProject): Promise<string | undefined> {
  const root = await resolveContainedExisting(manifestDirectory, project.root);
  if (root === undefined) return undefined;
  try {
    return (await stat(root)).isDirectory() ? root : undefined;
  } catch {
    return undefined;
  }
}

export async function workspaceCheckCommand(
  args: readonly string[],
  options: WorkspaceCheckOptions = {},
): Promise<CommandReport> {
  const parsed = parseCliArgs(args);
  if (parsed.kind !== "command" || parsed.route !== "workspace-check") {
    throw new Error("workspaceCheckCommand received a different command route.");
  }

  let manifestPath: string;
  let manifestValue: unknown;
  try {
    manifestPath = await resolveManifest(parsed.manifestPath);
    manifestValue = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch {
    return unreadableManifestReport();
  }
  const diagnostics = validateWorkspaceManifest(manifestValue);
  if (diagnostics.length > 0) {
    return createCommandReport("workspace check", diagnostics.map(manifestFinding), { applicableChecksCompleted: true });
  }
  const manifest = manifestValue as WorkspaceManifest;
  const manifestDirectory = dirname(manifestPath);
  const safeRegistryPath = await resolveContainedExisting(manifestDirectory, manifest.registryPath);
  if (safeRegistryPath === undefined) {
    return createCommandReport("workspace check", [{
      exitCode: 1,
      ruleId: "WORKSPACE-REGISTRY-001",
      severity: "error",
      code: "WORKSPACE_REGISTRY_UNSAFE",
      message: "The workspace registry path is missing or escapes the manifest directory.",
      artifactPath: "<workspace-registry>",
      remediation: "Use a readable registry file contained by the manifest directory.",
    }], { applicableChecksCompleted: true });
  }

  const auditResult = await auditLearningRegistry(registryRoot(safeRegistryPath), safeRegistryPath);
  const registryAudit: WorkspaceRegistryAudit = {
    revision: auditResult.revision ?? 0,
    digest: auditResult.digest ?? "[SANITIZED_DIGEST]",
    audit: auditResult.diagnostics.length === 0 ? "PASS" : "FAIL",
  };
  if (auditResult.diagnostics.length > 0) {
    const aggregate = aggregateWorkspaceResults(manifest, registryAudit, []);
    return createCommandReport("workspace check", registryAuditFailure(auditResult.diagnostics), {
      applicableChecksCompleted: true,
      data: aggregate,
    });
  }

  const environment = options.env ?? process.env;
  const sensitiveValues = Object.entries(environment)
    .filter(([key, value]) => key.startsWith("SPFLOW_BINDING_") && value !== undefined)
    .map(([, value]) => value ?? "");
  const platform = options.platform ?? process.platform;
  const runner = options.runner ?? defaultRunner;
  const results: WorkspaceProjectResult[] = [];
  const findings: ReportFinding[] = [];
  for (const project of manifest.projects) {
    const root = await projectRoot(manifestDirectory, project);
    if (root === undefined) {
      results.push({ id: project.id, required: project.required, result: "NOT_RUN", exitCode: 8, evidenceClass: "LOCAL_SYNTHETIC" });
      if (project.required) {
        findings.push({
          exitCode: 2,
          ruleId: "WORKSPACE-PROJECT-001",
          severity: "error",
          code: "WORKSPACE_PROJECT_ROOT_MISSING",
          message: `Required project '${project.id}' is missing or escapes the manifest directory.`,
          artifactPath: "<workspace-project>",
          remediation: "Restore the required project root inside the manifest directory.",
        });
      }
      continue;
    }
    const outcome = runner(npmExecutable(platform), ["run", "check"], {
      cwd: root,
      env: minimalEnvironment(environment, platform),
      shell: platform === "win32",
    });
    const childExitCode = exitCode(outcome.exitCode);
    results.push({
      id: project.id,
      required: project.required,
      result: childExitCode === 0 ? "PASS" : "FAIL",
      exitCode: childExitCode,
      evidenceClass: "LOCAL_SYNTHETIC",
    });
    if (childExitCode !== 0) findings.push(projectFailure(project, outcome, sensitiveValues));
  }
  const aggregate = aggregateWorkspaceResults(manifest, registryAudit, results);
  return createCommandReport("workspace check", findings, { applicableChecksCompleted: true, data: aggregate });
}
