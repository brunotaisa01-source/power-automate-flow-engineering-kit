import { readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { buildArtifactGraph } from "@spflow/core/artifact-graph";
import { validateProjectContract } from "@spflow/core/schema-loader";
import type { ProjectContract } from "@spflow/core/types/project-contract";
import { inspectProjectRuleEvidence } from "@spflow/package-adapters/solution-v1";
import {
  ruleRegistry,
  validateRules,
  type ValidationContext,
} from "@spflow/rules/registry";

import {
  createCommandReport,
  type CommandReport,
  type ReportFinding,
} from "../parse-args.ts";

const SUPPORTED_PROFILE = "power-platform-solution-v1";

interface LoadedContext {
  readonly kind: "context";
  readonly context: ValidationContext;
}

interface LoadFailure {
  readonly kind: "failure";
  readonly report: CommandReport;
}

export type OfflineContextResult = LoadedContext | LoadFailure;

function inputFailure(command: string, code: string, message: string): LoadFailure {
  return {
    kind: "failure",
    report: createCommandReport(command, [{
      exitCode: 2,
      ruleId: "CLI-INPUT",
      severity: "error",
      code,
      message,
      artifactPath: "<input>",
      remediation: "Provide a readable synthetic repository with a valid project contract.",
    }]),
  };
}

function schemaFindings(contract: unknown): ReportFinding[] {
  return validateProjectContract(contract).diagnostics.map((diagnostic) => ({
    exitCode: diagnostic.code === "CONTRACT_BINDING_EXAMPLE_FORBIDDEN" ? 5 : 1,
    ruleId: diagnostic.code,
    severity: "error",
    code: diagnostic.code,
    message: diagnostic.message,
    artifactPath: "<contract>",
    ...(diagnostic.path === "" ? {} : { jsonPointer: diagnostic.path }),
    remediation: "Correct the project contract and run validation again.",
  }));
}

function hasUnsupportedProfile(contract: unknown): boolean {
  return contract !== null
    && typeof contract === "object"
    && "packages" in contract
    && Array.isArray((contract as { packages?: unknown }).packages)
    && (contract as { packages: Array<{ profile?: unknown }> }).packages
      .some(({ profile }) => profile !== SUPPORTED_PROFILE);
}

export async function loadOfflineValidationContext(
  root: string,
  contractPath: string,
  command: string,
): Promise<OfflineContextResult> {
  let contractValue: unknown;
  let repositoryRoot: string;
  let resolvedContract: string;
  try {
    repositoryRoot = await realpath(resolve(root));
    resolvedContract = await realpath(resolve(contractPath));
    const contractRelative = relative(repositoryRoot, resolvedContract).replaceAll("\\", "/");
    if (contractRelative !== "project.contract.json") {
      return inputFailure(
        command,
        "CLI_CONTRACT_LOCATION_INVALID",
        "The project contract must be the repository-root project.contract.json file.",
      );
    }
    contractValue = JSON.parse(await readFile(resolvedContract, "utf8")) as unknown;
  } catch (error) {
    return inputFailure(
      command,
      error instanceof SyntaxError ? "CLI_JSON_INVALID" : "CLI_INPUT_UNREADABLE",
      error instanceof SyntaxError
        ? "The project contract is not valid JSON."
        : "The repository or project contract could not be read.",
    );
  }

  if (hasUnsupportedProfile(contractValue)) {
    return {
      kind: "failure",
      report: createCommandReport(command, [{
        exitCode: 3,
        ruleId: "PKG-PROFILE",
        severity: "error",
        code: "CLI_PROFILE_UNSUPPORTED",
        message: "The project contract declares an unsupported package profile.",
        artifactPath: "<contract>",
        remediation: `Use the supported ${SUPPORTED_PROFILE} package profile.`,
      }]),
    };
  }

  const invalid = schemaFindings(contractValue);
  if (invalid.length > 0) {
    return { kind: "failure", report: createCommandReport(command, invalid) };
  }

  const contract = contractValue as ProjectContract;
  try {
    const [graph, adapterEvidence] = await Promise.all([
      buildArtifactGraph(repositoryRoot, contract),
      inspectProjectRuleEvidence(repositoryRoot, contract),
    ]);
    return {
      kind: "context",
      context: {
        root: repositoryRoot,
        offline: true,
        contract,
        graph: graph.toJSON(),
        adapterEvidence,
      },
    };
  } catch {
    return inputFailure(
      command,
      "CLI_ARTIFACT_CONTEXT_INVALID",
      "The offline artifact context could not be built safely.",
    );
  }
}

function ruleFinding(code: string, path: string, message: string): ReportFinding {
  return {
    exitCode: code === "PKG-ARCHIVE-001" ? 4 : 1,
    ruleId: code,
    severity: "error",
    code,
    message,
    artifactPath: path,
    remediation: "Correct the synthetic contract or artifact and run validation again.",
  };
}

export async function validateOfflineContext(
  command: string,
  context: ValidationContext,
): Promise<CommandReport> {
  const requested = [...new Set([
    ...ruleRegistry.keys(),
    ...context.contract.verification.requiredRuleIds,
  ])].sort();
  const unavailable = requested.filter((ruleId) => !ruleRegistry.has(ruleId));
  const findings: ReportFinding[] = unavailable.map((ruleId) => ({
    exitCode: 8,
    ruleId: "CLI-VALIDATOR",
    severity: "error",
    code: "CLI_RULE_NOT_RUN",
    message: "A contract-required local rule validator is not available.",
    artifactPath: "<contract>",
    remediation: "Implement the required local validator before treating verification as complete.",
    residualGate: `local-rule:${ruleId.replace(/[^A-Z0-9-]/gi, "_")}`,
    notRun: true,
  }));
  const diagnostics = await validateRules(
    context,
    requested.filter((ruleId) => ruleRegistry.has(ruleId)),
  );
  findings.push(...diagnostics.map(({ code, path, message }) =>
    ruleFinding(code, path, message)
  ));
  return createCommandReport(command, findings, { applicableChecksCompleted: true });
}

export async function validateOfflineRepository(
  root: string,
  command: string,
): Promise<CommandReport> {
  const loaded = await loadOfflineValidationContext(
    root,
    resolve(root, "project.contract.json"),
    command,
  );
  return loaded.kind === "failure"
    ? loaded.report
    : validateOfflineContext(command, loaded.context);
}

export function contractRoot(contractPath: string): string {
  return dirname(resolve(contractPath));
}
