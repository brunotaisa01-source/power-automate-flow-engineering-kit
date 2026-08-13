import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  syntheticSolution,
  syntheticSolutionWithFlows,
} from "../artifacts/synthetic-solution.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const CLI = resolve(ROOT, "packages/cli/dist/bin/spflow.js");
const PACKAGE_PATH = "artifacts/synthetic-package.zip";
const MANIFEST_PATH = "artifacts/manifest.json";
const ALL_RULE_IDS = [
  "FLOW-DESTRUCTIVE-001",
  "FLOW-IDEMPOTENCY-001",
  "FLOW-RETRY-001",
  "FLOW-STATUS-001",
  "PA-CONNECTION-001",
  "PA-CONNECTOR-001",
  "PA-EXPRESSION-001",
  "PA-GRAPH-001",
  "PA-GRAPH-002",
  "PA-LIMIT-001",
  "PA-SCOPE-001",
  "PA-WDL-001",
  "PKG-ARCHIVE-001",
  "PKG-INTEGRITY-001",
  "PKG-NATIVE-001",
] as const;

type RawAction = Readonly<Record<string, unknown>>;

interface ConnectorTarget {
  readonly reference?: string;
  readonly resource?: string;
  readonly identifier?: string;
}

interface ProjectOptions {
  readonly flowId?: string;
  readonly actions: Readonly<Record<string, RawAction>>;
  readonly processor?: boolean;
  readonly destructive?: boolean;
  readonly connectionReference?: boolean;
  readonly manifestEntries?: readonly Readonly<Record<string, unknown>>[];
  readonly omitDefinition?: boolean;
  readonly extraPackagedFlowId?: string;
  readonly additionalConnectionReferences?: readonly string[];
}

interface SyntheticProject {
  readonly root: string;
  readonly contractPath: string;
  readonly packagePath: string;
}

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly report: {
    readonly result: string;
    readonly exitCode: number;
    readonly diagnostics: readonly Array<{
      readonly code: string;
      readonly residualGate?: string;
    }>;
    readonly summary: { readonly notRun: number };
  };
}

function runAfter(actionId: string, ...statuses: string[]): unknown {
  return { [actionId]: statuses };
}

function connector(
  method: string,
  operationId: string,
  after: unknown = {},
  target: ConnectorTarget = {},
): RawAction {
  return {
    type: "OpenApiConnection",
    runAfter: after,
    inputs: {
      host: {
        connection: { referenceName: target.reference ?? "SYNTHETIC_CONNECTION" },
        operationId,
      },
      method,
      uri: "/synthetic/items",
      parameters: {
        listId: target.resource ?? "synthetic-items",
        itemId: target.identifier ?? "@triggerBody()?['TargetId']",
      },
    },
    runtimeConfiguration: { retryPolicy: { type: "none" } },
  };
}

function semanticProcessorActions(
  readbackOperationId: string,
  readbackTarget: ConnectorTarget = {},
  predicates: {
    readonly key?: string;
    readonly emptyGuard?: string;
    readonly zeroCardinality?: string;
  } = {},
): Readonly<Record<string, RawAction>> {
  return {
    DeriveKey: {
      type: "Compose",
      runAfter: {},
      inputs: predicates.key
        ?? "@concat(triggerBody()?['TargetId'], ':', triggerBody()?['CommandType'])",
    },
    GuardEmpty: {
      type: "If",
      runAfter: runAfter("DeriveKey", "Succeeded"),
      expression: predicates.emptyGuard ?? "@not(empty(outputs('DeriveKey')))",
      actions: {
        Lookup: connector("GET", "GetItems"),
        HandleZero: {
          type: "If",
          runAfter: runAfter("Lookup", "Succeeded"),
          expression: predicates.zeroCardinality
            ?? "@equals(length(body('Lookup')?['value']), 0)",
          actions: {
            MutationGate: {
              type: "If",
              runAfter: {},
              expression: "@equals(triggerBody()?['CommandType'], 'apply-change')",
              actions: {},
            },
            Mutate: connector("POST", "UpdateItem", runAfter("MutationGate", "Succeeded")),
            Readback: connector(
              "GET",
              readbackOperationId,
              runAfter("Mutate", "Succeeded"),
              readbackTarget,
            ),
            ReconcileMutation: connector(
              "GET",
              "GetItem",
              runAfter("Mutate", "Failed", "TimedOut"),
            ),
            AssertReadback: {
              type: "If",
              runAfter: runAfter("Readback", "Succeeded"),
              expression: "@equals(body('Readback')?['Status'], 'Applied')",
              actions: {
                Complete: {
                  type: "Terminate",
                  runAfter: {},
                  inputs: { status: "Succeeded" },
                },
              },
            },
          },
        },
        HandleOne: {
          type: "If",
          runAfter: runAfter("Lookup", "Succeeded"),
          expression: "@equals(length(body('Lookup')?['value']), 1)",
          actions: { ReturnExisting: { type: "Response", runAfter: {} } },
        },
        HandleMany: {
          type: "If",
          runAfter: runAfter("Lookup", "Succeeded"),
          expression: "@greater(length(body('Lookup')?['value']), 1)",
          actions: {
            FailReconciliation: {
              type: "Terminate",
              runAfter: {},
              inputs: { status: "Failed" },
            },
          },
        },
      },
    },
  };
}

function destructiveProcessorActions(
  approvalExpression: string,
  options: {
    readonly digestExpression?: string;
    readonly dryRunExpression?: string;
  } = {},
): Readonly<Record<string, RawAction>> {
  return {
    DeriveKey: {
      type: "Compose",
      runAfter: {},
      inputs: "@concat(triggerBody()?['TargetId'], ':', triggerBody()?['CommandType'])",
    },
    GuardEmpty: {
      type: "If",
      runAfter: runAfter("DeriveKey", "Succeeded"),
      expression: "@not(empty(outputs('DeriveKey')))",
      actions: {
        Lookup: connector("GET", "GetItems"),
        HandleZero: {
          type: "If",
          runAfter: runAfter("Lookup", "Succeeded"),
          expression: "@equals(length(body('Lookup')?['value']), 0)",
          actions: {
            DryRun: {
              type: "If",
              runAfter: {},
              expression: options.dryRunExpression
                ?? "@equals(triggerBody()?['DryRun'], true)",
              actions: {},
              else: {
                actions: {
                  Allowlist: {
                    type: "If",
                    runAfter: {},
                    expression: "@contains(createArray('DeleteItem'), triggerBody()?['Operation'])",
                    actions: {
                      PlanDigest: {
                        type: "Compose",
                        runAfter: {},
                        inputs: options.digestExpression
                          ?? "@sha256(string(triggerBody()?['Plan']))",
                      },
                      Approval: {
                        type: "If",
                        runAfter: runAfter("PlanDigest", "Succeeded"),
                        expression: approvalExpression,
                        actions: {
                          WriteLimit: {
                            type: "If",
                            runAfter: {},
                            expression: "@lessOrEquals(triggerBody()?['WriteCount'], 10)",
                            actions: {
                              StateReread: connector("GET", "GetItem"),
                              StopUnexpected: {
                                type: "If",
                                runAfter: runAfter("StateReread", "Succeeded"),
                                expression: "@equals(body('StateReread')?['Unexpected'], false)",
                                actions: {
                                  Delete: connector("DELETE", "DeleteItem"),
                                  Readback: connector(
                                    "GET",
                                    "GetItem",
                                    runAfter("Delete", "Succeeded"),
                                  ),
                                  ReconcileDelete: connector(
                                    "GET",
                                    "GetItem",
                                    runAfter("Delete", "Failed", "TimedOut"),
                                  ),
                                  AssertReadback: {
                                    type: "If",
                                    runAfter: runAfter("Readback", "Succeeded"),
                                    expression: "@equals(body('Readback')?['Status'], 'Applied')",
                                    actions: {
                                      Complete: {
                                        type: "Terminate",
                                        runAfter: {},
                                        inputs: { status: "Succeeded" },
                                      },
                                    },
                                  },
                                  FailureAudit: connector(
                                    "POST",
                                    "CreateAudit",
                                    runAfter("Delete", "Failed", "TimedOut"),
                                  ),
                                  ReconcileFailureAudit: connector(
                                    "GET",
                                    "GetAuditRecord",
                                    runAfter("FailureAudit", "Failed", "TimedOut"),
                                  ),
                                  Compensate: connector(
                                    "POST",
                                    "CreateCompensation",
                                    runAfter("FailureAudit", "Succeeded"),
                                  ),
                                  ReconcileCompensation: connector(
                                    "GET",
                                    "GetCompensation",
                                    runAfter("Compensate", "Failed", "TimedOut"),
                                  ),
                                  Fail: {
                                    type: "Terminate",
                                    runAfter: runAfter("Compensate", "Succeeded"),
                                    inputs: { status: "Failed" },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        HandleOne: {
          type: "If",
          runAfter: runAfter("Lookup", "Succeeded"),
          expression: "@equals(length(body('Lookup')?['value']), 1)",
          actions: { ReturnExisting: { type: "Response", runAfter: {} } },
        },
        HandleMany: {
          type: "If",
          runAfter: runAfter("Lookup", "Succeeded"),
          expression: "@greater(length(body('Lookup')?['value']), 1)",
          actions: {
            FailReconciliation: {
              type: "Terminate",
              runAfter: {},
              inputs: { status: "Failed" },
            },
          },
        },
      },
    },
  };
}

function projectContract(
  flowId: string,
  processor: boolean,
  connectionReferences: readonly string[],
): unknown {
  return {
    schemaVersion: "1.0",
    project: {
      id: "synthetic-validator",
      displayName: "Synthetic Validator",
      description: "Synthetic shipped-path validation fixture.",
      contractRevision: 1,
      dataClassification: "synthetic-public",
    },
    runtime: {
      node: ">=22.0.0 <23.0.0",
      npm: ">=10.0.0 <11.0.0",
      moduleFormat: "esm",
      locale: "en",
      timeZone: "UTC",
      networkDuringOfflineVerify: "forbidden",
    },
    environmentBindings: [
      {
        key: "SITE_URL",
        kind: "site-url",
        requiredFor: ["tenant-preflight"],
        sensitive: false,
        example: "{SITE_URL}",
      },
      {
        key: "LIST_TITLE",
        kind: "list-title",
        requiredFor: ["generate"],
        sensitive: false,
        example: "{LIST_TITLE}",
      },
      {
        key: "PROCESSOR_PRINCIPAL",
        kind: "connection-reference",
        requiredFor: ["tenant-preflight"],
        sensitive: true,
        example: "{PROCESSOR_PRINCIPAL}",
      },
      {
        key: "SYNTHETIC_CONNECTION",
        kind: "connection-reference",
        requiredFor: ["generate"],
        sensitive: true,
        example: "{SYNTHETIC_CONNECTION}",
      },
      ...connectionReferences
        .filter((reference) => reference !== "SYNTHETIC_CONNECTION")
        .map((reference) => ({
          key: reference,
          kind: "connection-reference",
          requiredFor: ["generate"],
          sensitive: true,
          example: `{${reference}}`,
        })),
    ],
    sharePoint: {
      siteUrlBinding: "SITE_URL",
      lists: [{
        id: "synthetic-items",
        titleBinding: "LIST_TITLE",
        role: "protected-domain",
        writeModel: "server-only",
        readAllowlist: ["Status", "TargetId", "CommandType"],
        createAllowlist: [],
        patchAllowlist: [],
        fields: [
          {
            logicalName: "status",
            internalName: "Status",
            type: "Choice",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: false,
            sensitive: false,
            choices: ["Pending", "Applied"],
          },
          {
            logicalName: "target-id",
            internalName: "TargetId",
            type: "Number",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: true,
            sensitive: false,
          },
          {
            logicalName: "command-type",
            internalName: "CommandType",
            type: "Text",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: true,
            sensitive: false,
            maxLength: 100,
          },
        ],
        indexes: [
          { field: "Status", order: 1, required: true },
          { field: "TargetId", order: 2, required: true },
        ],
        permissions: {
          inheritance: "break-clear",
          minimumRoles: [{
            principalBinding: "PROCESSOR_PRINCIPAL",
            role: "processor",
            allowedOperations: ["read", "update"],
          }],
          directUserGrants: "forbidden",
          effectivePermissionReadback: "required",
        },
        views: [],
      }],
    },
    stateMachines: [{
      id: "synthetic-state",
      listId: "synthetic-items",
      field: "Status",
      initial: "Pending",
      terminal: ["Applied"],
      states: ["Pending", "Applied"],
      transitions: [{
        id: "apply-change",
        from: ["Pending"],
        to: "Applied",
        commandType: "apply-change",
        requiredCapability: "apply-change",
        serverGuards: ["current-state"],
      }],
    }],
    capabilities: [{
      id: "apply-change",
      accessListId: "synthetic-items",
      activeField: "Status",
      principalField: "CommandType",
      capabilityField: "CommandType",
      scope: { mode: "global" },
      allowedCommands: ["apply-change"],
    }],
    commands: [{
      type: "apply-change",
      queueListId: "synthetic-items",
      targetListId: "synthetic-items",
      targetIdField: "TargetId",
      requestedFields: [],
      serverReadFields: ["Status"],
      requiredCapability: "apply-change",
      transitionId: "apply-change",
      idempotency: {
        keyFields: ["TargetId", "CommandType"],
        emptyKey: "reject",
        zeroMatches: "create-or-execute",
        oneMatch: "return-existing-or-continue",
        manyMatches: "fail-reconciliation",
        ambiguousWrite: "get-reconcile-no-blind-retry",
      },
      claim: {
        pendingState: "Pending",
        processingState: "Processing",
        succeededState: "Succeeded",
        failedState: "Failed",
        exactEtagRequired: true,
      },
      readback: {
        required: true,
        fields: ["Status"],
        assertions: [{ field: "Status", operator: "equals", expected: "Applied" }],
      },
    }],
    flows: [{
      id: flowId,
      definitionPath: `flows/${flowId}/definition.json`,
      trigger: "manual",
      processorForCommandTypes: processor ? ["apply-change"] : [],
      connectionReferences: [...connectionReferences],
      actionBudget: 50,
      concurrency: { enabled: true, degree: 1 },
      packageId: "synthetic-package",
    }],
    packages: [{
      id: "synthetic-package",
      path: PACKAGE_PATH,
      profile: "power-platform-solution-v1",
      manifestPath: MANIFEST_PATH,
      flowIds: [flowId],
      importMode: "disabled",
      nestedArchives: "forbidden",
    }],
    frontend: {
      root: "frontend",
      authModel: "existing-m365-session",
      secrets: "forbidden",
      protectedWriteModel: "typed-command-queue",
      directPatch: {
        enabled: false,
        listIds: [],
        explicitSave: true,
        digestPerTransaction: true,
        method: "POST",
        methodOverride: "MERGE",
        exactIfMatch: true,
        conflictStatus: 412,
        ambiguousWrite: "get-reconcile-no-blind-retry",
        semanticReadback: true,
      },
      pagination: { mode: "exhaust-continuation", sameOriginOnly: true },
    },
    security: {
      minimumPrivilege: true,
      clientActorAuthority: "forbidden",
      protectedClientWrites: "forbidden",
      allowlistedFieldsOnly: true,
      destructiveOperations: {
        dryRun: true,
        planDigest: true,
        humanApproval: true,
        itemLimit: 10,
        writeLimit: 10,
        stopOnUnexpected: true,
        semanticReadback: true,
      },
      httpClassification: {
        missingColumn400: "semantic-signature-only",
        other400: "GET_FAILED",
        initialPreflight404: "explicit-create-missing-only",
        applyOrReadback404: "strict-failure",
      },
    },
    verification: {
      globalCommand: "spflow verify --root . --offline --format json",
      requiredRuleIds: [...ALL_RULE_IDS],
      finalZipInspection: true,
      recursivePublicDataScan: true,
      mutationControls: true,
    },
    evidencePolicy: {
      permittedClaimClasses: ["LOCAL_STATIC", "PACKAGE_ARTIFACT"],
      localPromotionToTenant: "forbidden",
      exactArtifactBinding: true,
      synchronizedFolderIsPublication: false,
      successfulRunIsSemanticEffect: false,
    },
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createProject(options: ProjectOptions): Promise<SyntheticProject> {
  const root = await mkdtemp(join(tmpdir(), "spflow-shipped-"));
  const flowId = options.flowId ?? "synthetic-flow";
  const declaredConnectionReferences = options.connectionReference
    ? ["SYNTHETIC_CONNECTION", ...(options.additionalConnectionReferences ?? [])]
    : [...(options.additionalConnectionReferences ?? [])];
  const connectionReferences = Object.fromEntries(
    declaredConnectionReferences.map((reference) => [
      reference,
      { connectorId: `synthetic-${reference.toLowerCase()}` },
    ]),
  );
  const rawFlow = {
    properties: {
      connectionReferences,
      ...(options.destructive ? { metadata: { spflowDestructive: true } } : {}),
      definition: {
        triggers: { SyntheticTrigger: { type: "Request" } },
        actions: options.actions,
      },
    },
  };
  const bytes = options.extraPackagedFlowId === undefined
    ? syntheticSolution(rawFlow, flowId)
    : syntheticSolutionWithFlows([
        { id: flowId, definition: rawFlow },
        {
          id: options.extraPackagedFlowId,
          definition: {
            properties: {
              connectionReferences: {},
              definition: {
                triggers: { SyntheticTrigger: { type: "Request" } },
                actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
              },
            },
          },
        },
      ]);
  const contract = projectContract(
    flowId,
    options.processor ?? false,
    declaredConnectionReferences,
  );
  const packagePath = join(root, ...PACKAGE_PATH.split("/"));
  const contractPath = join(root, "project.contract.json");
  await mkdir(dirname(packagePath), { recursive: true });
  await writeFile(packagePath, bytes);
  await writeJson(contractPath, contract);
  const definitionPath = join(root, "flows", flowId, "definition.json");
  if (!options.omitDefinition) {
    await writeJson(definitionPath, rawFlow);
  }
  await mkdir(join(root, "frontend"), { recursive: true });
  const packageEntry = {
    path: PACKAGE_PATH,
    mediaType: "application/zip",
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    role: "package",
  };
  const contractBytes = await readFile(contractPath);
  const localEntries = [
    {
      path: "project.contract.json",
      mediaType: "application/json",
      bytes: contractBytes.byteLength,
      sha256: createHash("sha256").update(contractBytes).digest("hex"),
      role: "contract",
    },
    ...options.omitDefinition
      ? []
      : [{
          path: `flows/${flowId}/definition.json`,
          mediaType: "application/json",
          bytes: (await readFile(definitionPath)).byteLength,
          sha256: createHash("sha256")
            .update(await readFile(definitionPath))
            .digest("hex"),
          role: "definition",
        }],
    packageEntry,
  ];
  await writeJson(join(root, ...MANIFEST_PATH.split("/")), {
    schemaVersion: "1.0",
    projectId: "synthetic-validator",
    contractRevision: 1,
    generatedBy: { tool: "spflow", version: "0.0.0" },
    packageProfile: "power-platform-solution-v1",
    files: options.manifestEntries ?? localEntries,
  });
  return { root, contractPath, packagePath };
}

async function runCli(
  args: readonly string[],
  nodeArgs: readonly string[] = [],
): Promise<CliResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, CLI, ...args], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      try {
        resolveResult({
          exitCode: code ?? -1,
          stdout,
          stderr,
          report: JSON.parse(stdout) as CliResult["report"],
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function zipOmissionLoader(root: string): Promise<string> {
  const loaderPath = join(root, "omit-zip-graph-node-loader.mjs");
  const artifactGraphUrl = pathToFileURL(
    resolve(ROOT, "packages/core/dist/artifact-graph.js"),
  ).href;
  const proxySource = [
    `export * from ${JSON.stringify(artifactGraphUrl)};`,
    `import { buildArtifactGraph as buildRealArtifactGraph } from ${JSON.stringify(artifactGraphUrl)};`,
    "export async function buildArtifactGraph(root, contract) {",
    "  const graph = await buildRealArtifactGraph(root, contract);",
    "  return {",
    "    toJSON() {",
    "      const value = graph.toJSON();",
    "      const omitted = new Set(value.nodes.filter((node) => node.kind === 'zip').map((node) => node.id));",
    "      return {",
    "        nodes: value.nodes.filter((node) => !omitted.has(node.id)),",
    "        edges: value.edges.filter((edge) => !omitted.has(edge.from) && !omitted.has(edge.to)),",
    "      };",
    "    },",
    "  };",
    "}",
  ].join("\n");
  const proxyUrl = `data:text/javascript,${encodeURIComponent(proxySource)}`;
  await writeFile(loaderPath, [
    "export async function resolve(specifier, context, nextResolve) {",
    "  if (specifier === '@spflow/core/artifact-graph') {",
    `    return { shortCircuit: true, url: ${JSON.stringify(proxyUrl)} };`,
    "  }",
    "  return nextResolve(specifier, context);",
    "}",
  ].join("\n"), "utf8");
  return loaderPath;
}

async function withProject(
  options: ProjectOptions,
  run: (project: SyntheticProject) => Promise<void>,
): Promise<void> {
  const project = await createProject(options);
  try {
    await run(project);
  } finally {
    await rm(project.root, { recursive: true, force: true });
  }
}

function diagnosticCodes(result: CliResult): string[] {
  return result.report.diagnostics.map(({ code }) => code);
}

function assertDiagnosticCodes(result: CliResult, expected: readonly string[]): void {
  assert.deepEqual(diagnosticCodes(result), expected, result.stdout);
}

describe("WP-05S shipped offline validation", () => {
  test("root build emits every runtime export used by the built CLI", async () => {
    for (const path of [
      "packages/core/dist/artifact-graph.js",
      "packages/package-adapters/dist/solution-v1.js",
      "packages/rules/dist/registry.js",
      "packages/cli/dist/bin/spflow.js",
    ]) {
      await access(resolve(ROOT, path));
    }
  });

  test("built validate rules, validate artifact, and verify execute real offline checks", async () => {
    await withProject({
      actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
    }, async (project) => {
      const contract = await runCli([
        "validate", "contract", project.contractPath, "--format", "json",
      ]);
      const rules = await runCli([
        "validate", "rules", "--root", project.root, "--format", "json",
      ]);
      const artifact = await runCli([
        "validate", "artifact", project.packagePath,
        "--contract", project.contractPath, "--format", "json",
      ]);
      const verify = await runCli([
        "verify", "--root", project.root, "--offline", "--format", "json",
      ]);

      assert.equal(contract.report.result, "PASS", contract.stdout);
      assert.equal(rules.report.result, "PASS", rules.stdout);
      assert.equal(artifact.report.result, "PASS", artifact.stdout);
      assert.equal(verify.exitCode, 8, verify.stdout);
      assert.equal(verify.report.result, "FAIL", verify.stdout);
      assert.equal(rules.report.summary.notRun, 0);
      assert.equal(artifact.report.summary.notRun, 0);
      assert.equal(verify.report.summary.notRun, 8);
      assert.ok(verify.report.diagnostics.some(({ code, residualGate }) =>
        code === "CLI_VALIDATOR_NOT_RUN" && residualGate === "public-data-scanner"
      ));
      assert.ok(verify.report.diagnostics
        .filter(({ residualGate }) => residualGate !== undefined)
        .every(({ code }) => code.endsWith("_NOT_RUN")));
      assert.equal(`${contract.stderr}${rules.stderr}${artifact.stderr}${verify.stderr}`, "");
    });
  });

  test("built validation rejects completion after an always-false semantic assertion", async () => {
    const privateFlowId = "sensitive-workflow-marker";
    const privateActionId = "SensitiveActionMarker";
    await withProject({
      flowId: privateFlowId,
      processor: true,
      connectionReference: true,
      actions: {
        Mutate: connector("POST", "UpdateItem"),
        Readback: connector("GET", "GetItem", runAfter("Mutate", "Succeeded")),
        [privateActionId]: {
          type: "If",
          runAfter: runAfter("Readback", "Succeeded"),
          expression: "@equals(1, 2)",
          actions: {},
        },
        Complete: {
          type: "Terminate",
          runAfter: runAfter(privateActionId, "Succeeded"),
          inputs: { status: "Succeeded" },
        },
      },
    }, async (project) => {
      const result = await runCli([
        "validate", "artifact", project.packagePath,
        "--contract", project.contractPath, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assert.ok(diagnosticCodes(result).includes("FLOW-STATUS-001"), result.stdout);
      assert.equal(result.stdout.includes(privateFlowId), false);
      assert.equal(result.stdout.includes(privateActionId), false);
    });
  });

  test("built validation rejects label-only no-op destructive and idempotency safeguards", async () => {
    const roles = [
      "dry-run",
      "target-allowlist",
      "plan-digest",
      "approval",
      "write-limit",
      "state-reread",
      "stop-unexpected",
      "failure-audit",
      "compensation",
      "idempotency-key",
      "idempotency-empty-guard",
      "cardinality-zero",
      "cardinality-one",
      "cardinality-many",
    ] as const;
    const actions = Object.fromEntries(roles.map((role, index) => [
      `Label${index}`,
      {
        type: "Compose",
        runAfter: index === 0 ? {} : runAfter(`Label${index - 1}`, "Succeeded"),
        metadata: { spflowRole: role },
        inputs: "no-op",
      },
    ]));
    await withProject({
      processor: true,
      destructive: true,
      actions,
    }, async (project) => {
      const result = await runCli([
        "validate", "rules", "--root", project.root, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assert.ok(diagnosticCodes(result).includes("FLOW-DESTRUCTIVE-001"), result.stdout);
      assert.ok(diagnosticCodes(result).includes("FLOW-IDEMPOTENCY-001"), result.stdout);
    });
  });

  test("built validation rejects malformed, unknown, and invalid-arity WDL calls", async () => {
    for (const expression of [
      "@equals(1 2)",
      "@equals(1, 2) trailing",
      "@concat('a',, 'b')",
      "@unknownFunction('synthetic')",
      "@equals(true)",
      "@triggerBody('synthetic')",
    ]) {
      await withProject({
        actions: { Evaluate: { type: "Compose", runAfter: {}, inputs: expression } },
      }, async (project) => {
        const result = await runCli([
          "validate", "artifact", project.packagePath,
          "--contract", project.contractPath, "--format", "json",
        ]);
        assert.equal(result.exitCode, 1, `${expression}\n${result.stdout}`);
        assert.ok(diagnosticCodes(result).includes("PA-WDL-001"), result.stdout);
      });
    }
  });

  test("manifest comparison rejects mislabeled and conflicting duplicates independent of order", async () => {
    const placeholder = {
      path: PACKAGE_PATH,
      mediaType: "application/zip",
      bytes: 0,
      sha256: "0".repeat(64),
      role: "definition",
    };
    for (const reverse of [false, true]) {
      const entries = [
        placeholder,
        { ...placeholder, bytes: 1, sha256: "1".repeat(64), role: "package" },
      ];
      if (reverse) entries.reverse();
      await withProject({
        actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
        manifestEntries: entries,
      }, async (project) => {
        const result = await runCli([
          "validate", "artifact", project.packagePath,
          "--contract", project.contractPath, "--format", "json",
        ]);
        assert.equal(result.exitCode, 1, result.stdout);
        assert.ok(diagnosticCodes(result).includes("PKG-INTEGRITY-001"), result.stdout);
      });
    }
  });

  test("requested deferred local validators exit non-success while remaining NOT_RUN", async () => {
    await withProject({
      actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
    }, async (project) => {
      const evidencePath = join(project.root, "evidence.json");
      await writeJson(evidencePath, { schemaVersion: "1.0" });
      for (const args of [
        ["evidence", "validate", evidencePath, "--format", "json"],
        ["scan", "public-data", project.root, "--format", "json"],
      ]) {
        const result = await runCli(args);
        assert.equal(result.exitCode, 8, result.stdout);
        assert.equal(result.report.result, "FAIL");
        assert.equal(result.report.summary.notRun, 1);
      }
    });
  });

  for (const [scenario, expression] of [
    ["wrong readback field", "@equals(body('Readback')?['OtherStatus'], 'Applied')"],
    ["wrong readback operator", "@not(equals(body('Readback')?['Status'], 'Applied'))"],
    ["wrong readback expected value", "@equals(body('Readback')?['Status'], 'Rejected')"],
  ] as const) {
    test(`WP-05I RED: built validation rejects ${scenario} before Succeeded`, async () => {
      const privateFlowId = `sensitive-${scenario.replaceAll(" ", "-")}`;
      await withProject({
        flowId: privateFlowId,
        processor: true,
        connectionReference: true,
        actions: {
          Mutate: connector("POST", "UpdateItem"),
          Readback: connector("GET", "GetItem", runAfter("Mutate", "Succeeded")),
          AssertReadback: {
            type: "If",
            runAfter: runAfter("Readback", "Succeeded"),
            expression,
            actions: {
              Complete: {
                type: "Terminate",
                runAfter: {},
                inputs: { status: "Succeeded" },
              },
            },
          },
        },
      }, async (project) => {
        const result = await runCli([
          "validate", "artifact", project.packagePath,
          "--contract", project.contractPath, "--format", "json",
        ]);

        assert.equal(result.exitCode, 1, result.stdout);
        assert.ok(diagnosticCodes(result).includes("FLOW-STATUS-001"), result.stdout);
        assert.equal(result.stdout.includes(privateFlowId), false);
      });
    });
  }

  test("WP-05 follow-up: built validation rejects key fields in irrelevant branches", async () => {
    const privateFlowId = "sensitive-irrelevant-key-branches";
    await withProject({
      flowId: privateFlowId,
      processor: true,
      connectionReference: true,
      actions: semanticProcessorActions("GetItem", {}, {
        key: "@concat(if(true, 'fixed-target', triggerBody()?['TargetId']), ':', if(equals('fixed', 'fixed'), 'fixed-command', triggerBody()?['CommandType']))",
      }),
    }, async (project) => {
      const result = await runCli([
        "validate", "rules", "--root", project.root, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assertDiagnosticCodes(result, ["FLOW-IDEMPOTENCY-001"]);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  test("idempotency false-dominance: built validation rejects a statically false non-empty guard", async () => {
    const privateFlowId = "synthetic-dominating-false-idempotency";
    await withProject({
      flowId: privateFlowId,
      processor: true,
      connectionReference: true,
      actions: semanticProcessorActions("GetItem", {}, {
        emptyGuard: "@and(not(empty(outputs('DeriveKey'))), equals('fixed', 'different'))",
      }),
    }, async (project) => {
      const result = await runCli([
        "validate", "rules", "--root", project.root, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assertDiagnosticCodes(result, ["FLOW-IDEMPOTENCY-001"]);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  for (const [scenario, options] of [
    ["dominating dry-run constant", {
      dryRunExpression: "@and(equals(triggerBody()?['DryRun'], true), equals('fixed', 'different'))",
    }],
    ["unselected digest field", {
      digestExpression: "@sha256(if(true, 'fixed-plan', triggerBody()?['Plan']))",
    }],
  ] as const) {
    test(`WP-05 follow-up: built validation rejects ${scenario}`, async () => {
      const privateFlowId = `sensitive-${scenario.replaceAll(" ", "-")}`;
      await withProject({
        flowId: privateFlowId,
        processor: true,
        destructive: true,
        connectionReference: true,
        actions: destructiveProcessorActions(
          "@equals(triggerBody()?['ApprovalToken'], triggerBody()?['PlanDigest'])",
          options,
        ),
      }, async (project) => {
        const result = await runCli([
          "validate", "rules", "--root", project.root, "--format", "json",
        ]);

        assert.equal(result.exitCode, 1, result.stdout);
        assert.ok(
          diagnosticCodes(result).includes("FLOW-DESTRUCTIVE-001"),
          result.stdout,
        );
        assert.equal(result.stdout.includes(privateFlowId), false);
      });
    });
  }

  test("WP-05I RED: exact inventory rejects an omitted declared definition and manifest entry", async () => {
    const privateFlowId = "sensitive-missing-definition";
    await withProject({
      flowId: privateFlowId,
      omitDefinition: true,
      actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
    }, async (project) => {
      const result = await runCli([
        "validate", "artifact", project.packagePath,
        "--contract", project.contractPath, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assert.ok(diagnosticCodes(result).includes("PKG-INTEGRITY-001"), result.stdout);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  test("WP-05I RED: exact inventory rejects an undeclared packaged workflow", async () => {
    const privateFlowId = "sensitive-extra-packaged-workflow";
    await withProject({
      extraPackagedFlowId: privateFlowId,
      actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
    }, async (project) => {
      const result = await runCli([
        "validate", "artifact", project.packagePath,
        "--contract", project.contractPath, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assert.ok(diagnosticCodes(result).includes("PKG-INTEGRITY-001"), result.stdout);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  test("WP-05L RED: built validation rejects package evidence without its ZIP graph node", async () => {
    await withProject({
      actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
    }, async (project) => {
      const loaderPath = await zipOmissionLoader(project.root);
      const result = await runCli(
        ["validate", "rules", "--root", project.root, "--format", "json"],
        ["--experimental-loader", pathToFileURL(loaderPath).href],
      );

      assert.equal(result.exitCode, 1, result.stdout);
      assertDiagnosticCodes(result, ["PKG-INTEGRITY-001"]);
    });
  });

  test("WP-05I RED: idempotency rejects empty and disconnected cardinality branches", async () => {
    const privateFlowId = "sensitive-empty-cardinality-branches";
    await withProject({
      flowId: privateFlowId,
      processor: true,
      connectionReference: true,
      actions: {
        DeriveKey: {
          type: "Compose",
          runAfter: {},
          inputs: "@concat(triggerBody()?['TargetId'], ':', triggerBody()?['CommandType'])",
        },
        GuardEmpty: {
          type: "If",
          runAfter: runAfter("DeriveKey", "Succeeded"),
          expression: "@not(empty(outputs('DeriveKey')))",
          actions: {},
        },
        Lookup: connector("GET", "GetItems", runAfter("GuardEmpty", "Succeeded")),
        HandleZero: {
          type: "If",
          runAfter: runAfter("Lookup", "Succeeded"),
          expression: "@equals(length(body('Lookup')?['value']), 0)",
          actions: {},
        },
        HandleOne: {
          type: "If",
          runAfter: runAfter("HandleZero", "Succeeded"),
          expression: "@equals(length(body('Lookup')?['value']), 1)",
          actions: {},
        },
        HandleMany: {
          type: "If",
          runAfter: runAfter("HandleOne", "Succeeded"),
          expression: "@greater(length(body('Lookup')?['value']), 1)",
          actions: {},
        },
        DetachedHandling: {
          type: "Compose",
          runAfter: runAfter("HandleMany", "Succeeded"),
          inputs: "metadata-only handling",
        },
      },
    }, async (project) => {
      const result = await runCli([
        "validate", "rules", "--root", project.root, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assert.ok(diagnosticCodes(result).includes("FLOW-IDEMPOTENCY-001"), result.stdout);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  for (const [scenario, predicates] of [
    ["non-empty key", {
      emptyGuard: "@and(equals(outputs('DeriveKey'), outputs('DeriveKey')), not(empty(triggerBody()?['Unrelated'])))",
    }],
    ["lookup cardinality", {
      zeroCardinality: "@and(equals(body('Lookup')?['value'], body('Lookup')?['value']), equals(length(triggerBody()?['Unrelated']), 0))",
    }],
  ] as const) {
    test(`WP-05L RED: built validation rejects an irrelevant-runtime ${scenario} predicate`, async () => {
      const privateFlowId = `sensitive-lexical-${scenario.replaceAll(" ", "-")}`;
      await withProject({
        flowId: privateFlowId,
        processor: true,
        connectionReference: true,
        actions: semanticProcessorActions("GetItem", {}, predicates),
      }, async (project) => {
        const result = await runCli([
          "validate", "rules", "--root", project.root, "--format", "json",
        ]);

        assert.equal(result.exitCode, 1, result.stdout);
        assertDiagnosticCodes(result, ["FLOW-IDEMPOTENCY-001"]);
        assert.equal(result.stdout.includes(privateFlowId), false);
      });
    });
  }

  test("WP-05L RED: built validation rejects a tautological approval label with an irrelevant runtime reference", async () => {
    const privateFlowId = "sensitive-lexical-destructive-approval";
    await withProject({
      flowId: privateFlowId,
      processor: true,
      destructive: true,
      connectionReference: true,
      actions: destructiveProcessorActions(
        "@and(equals(triggerBody()?['Unrelated'], triggerBody()?['Unrelated']), equals('approval', 'approval'))",
      ),
    }, async (project) => {
      const result = await runCli([
        "validate", "rules", "--root", project.root, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assert.ok(diagnosticCodes(result).includes("FLOW-DESTRUCTIVE-001"), result.stdout);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  test("WP-05I RED: destructive controls must behaviorally gate success and failure paths", async () => {
    const privateFlowId = "sensitive-non-gating-destructive-controls";
    await withProject({
      flowId: privateFlowId,
      processor: true,
      destructive: true,
      connectionReference: true,
      actions: {
        DryRun: {
          type: "If",
          runAfter: {},
          expression: "@equals(triggerBody()?['DryRun'], true)",
          actions: {},
        },
        Allowlist: {
          type: "If",
          runAfter: runAfter("DryRun", "Succeeded"),
          expression: "@contains(createArray('DeleteItem'), triggerBody()?['Operation'])",
          actions: {},
        },
        PlanDigest: {
          type: "Compose",
          runAfter: runAfter("Allowlist", "Succeeded"),
          inputs: "@sha256(string(triggerBody()?['Plan']))",
        },
        Approval: {
          type: "If",
          runAfter: runAfter("PlanDigest", "Succeeded"),
          expression: "@equals(triggerBody()?['ApprovalToken'], triggerBody()?['PlanDigest'])",
          actions: {},
        },
        WriteLimit: {
          type: "If",
          runAfter: runAfter("Approval", "Succeeded"),
          expression: "@lessOrEquals(triggerBody()?['WriteCount'], 10)",
          actions: {},
        },
        StateReread: connector("GET", "GetItem", runAfter("WriteLimit", "Succeeded")),
        Delete: connector("DELETE", "DeleteItem", runAfter("StateReread", "Succeeded")),
        Readback: connector("GET", "GetItem", runAfter("Delete", "Succeeded")),
        Assert: {
          type: "If",
          runAfter: runAfter("Readback", "Succeeded"),
          expression: "@equals(body('Readback')?['Status'], 'Applied')",
          actions: {
            Complete: {
              type: "Terminate",
              runAfter: {},
              inputs: { status: "Succeeded" },
            },
          },
          else: {
            actions: {
              StopUnexpected: {
                type: "If",
                runAfter: {},
                expression: "@equals(body('Readback')?['Unexpected'], false)",
                actions: {},
              },
            },
          },
        },
        FailureAudit: connector("POST", "CreateAudit", runAfter("Delete", "Failed", "TimedOut")),
        Compensate: connector(
          "POST",
          "CreateCompensation",
          runAfter("FailureAudit", "Failed", "TimedOut"),
        ),
        Fail: {
          type: "Terminate",
          runAfter: runAfter("Compensate", "Failed", "TimedOut"),
          inputs: { status: "Failed" },
        },
      },
    }, async (project) => {
      const result = await runCli([
        "validate", "artifact", project.packagePath,
        "--contract", project.contractPath, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assert.ok(diagnosticCodes(result).includes("FLOW-DESTRUCTIVE-001"), result.stdout);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  for (const [scenario, operationId, target, additionalConnectionReferences] of [
    [
      "connector reference",
      "GetItem",
      { reference: "DECOY_CONNECTION" },
      ["DECOY_CONNECTION"],
    ],
    ["operation", "RetrieveItem", {}, []],
  ] as const) {
    test(`WP-05P RED: semantic readback rejects a mismatched ${scenario}`, async () => {
      const privateFlowId = `sensitive-provenance-${scenario.replaceAll(" ", "-")}`;
      await withProject({
        flowId: privateFlowId,
        processor: true,
        connectionReference: true,
        additionalConnectionReferences,
        actions: semanticProcessorActions(operationId, target),
      }, async (project) => {
        const result = await runCli([
          "validate", "artifact", project.packagePath,
          "--contract", project.contractPath, "--format", "json",
        ]);

        assert.equal(result.exitCode, 1, result.stdout);
        assertDiagnosticCodes(result, ["FLOW-STATUS-001"]);
        assert.equal(result.stdout.includes(privateFlowId), false);
      });
    });
  }

  test("WP-05P RED: semantic readback rejects a decoy target identifier dataflow", async () => {
    const privateFlowId = "sensitive-decoy-target-dataflow";
    await withProject({
      flowId: privateFlowId,
      processor: true,
      connectionReference: true,
      actions: semanticProcessorActions("GetItem", {
        identifier: "@if(true, triggerBody()?['OtherTargetId'], triggerBody()?['TargetId'])",
      }),
    }, async (project) => {
      const result = await runCli([
        "validate", "artifact", project.packagePath,
        "--contract", project.contractPath, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assertDiagnosticCodes(result, ["FLOW-STATUS-001"]);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  test("WP-05P RED: source inventory rejects a definition under an alternate root", async () => {
    const privateFlowId = "sensitive-alternate-root-flow";
    await withProject({
      actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
    }, async (project) => {
      await writeJson(
        join(project.root, "workflow-sources", privateFlowId, "definition.json"),
        {
          properties: {
            connectionReferences: {},
            definition: {
              triggers: { SyntheticTrigger: { type: "Request" } },
              actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
            },
          },
        },
      );
      const result = await runCli([
        "validate", "artifact", project.packagePath,
        "--contract", project.contractPath, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assertDiagnosticCodes(result, ["PKG-INTEGRITY-001"]);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  for (const [scenario, target] of [
    ["resource", { resource: "unrelated-items" }],
    ["identifier", { identifier: "@triggerBody()?['OtherTargetId']" }],
    ["operation", { operationId: "GetAuditRecord" }],
  ] as const) {
    test(`WP-05D RED: semantic readback rejects an unrelated ${scenario}`, async () => {
      const privateFlowId = `sensitive-unrelated-readback-${scenario}`;
      const operationId = "operationId" in target ? target.operationId : "GetItem";
      await withProject({
        flowId: privateFlowId,
        processor: true,
        connectionReference: true,
        actions: {
          DeriveKey: {
            type: "Compose",
            runAfter: {},
            inputs: "@concat(triggerBody()?['TargetId'], ':', triggerBody()?['CommandType'])",
          },
          GuardEmpty: {
            type: "If",
            runAfter: runAfter("DeriveKey", "Succeeded"),
            expression: "@not(empty(outputs('DeriveKey')))",
            actions: {
              Lookup: connector("GET", "GetItems"),
              HandleZero: {
                type: "If",
                runAfter: runAfter("Lookup", "Succeeded"),
                expression: "@equals(length(body('Lookup')?['value']), 0)",
                actions: {
                  MutationGate: {
                    type: "If",
                    runAfter: {},
                    expression: "@equals(triggerBody()?['CommandType'], 'apply-change')",
                    actions: {},
                  },
                  Mutate: connector(
                    "POST",
                    "UpdateItem",
                    runAfter("MutationGate", "Succeeded"),
                  ),
                  Readback: connector(
                    "GET",
                    operationId,
                    runAfter("Mutate", "Succeeded"),
                    target,
                  ),
                  ReconcileMutation: connector(
                    "GET",
                    "GetItem",
                    runAfter("Mutate", "Failed", "TimedOut"),
                  ),
                  AssertReadback: {
                    type: "If",
                    runAfter: runAfter("Readback", "Succeeded"),
                    expression: "@equals(body('Readback')?['Status'], 'Applied')",
                    actions: {
                      Complete: {
                        type: "Terminate",
                        runAfter: {},
                        inputs: { status: "Succeeded" },
                      },
                    },
                  },
                },
              },
              HandleOne: {
                type: "If",
                runAfter: runAfter("Lookup", "Succeeded"),
                expression: "@equals(length(body('Lookup')?['value']), 1)",
                actions: { ReturnExisting: { type: "Response", runAfter: {} } },
              },
              HandleMany: {
                type: "If",
                runAfter: runAfter("Lookup", "Succeeded"),
                expression: "@greater(length(body('Lookup')?['value']), 1)",
                actions: {
                  FailReconciliation: {
                    type: "Terminate",
                    runAfter: {},
                    inputs: { status: "Failed" },
                  },
                },
              },
            },
          },
        },
      }, async (project) => {
        const result = await runCli([
          "validate", "artifact", project.packagePath,
          "--contract", project.contractPath, "--format", "json",
        ]);

        assert.equal(result.exitCode, 1, result.stdout);
        assertDiagnosticCodes(result, ["FLOW-STATUS-001"]);
        assert.equal(result.stdout.includes(privateFlowId), false);
      });
    });
  }

  test("WP-05D RED: zero handling must contain the protected command mutation", async () => {
    const privateFlowId = "sensitive-detached-protected-mutation";
    await withProject({
      flowId: privateFlowId,
      processor: true,
      connectionReference: true,
      actions: {
        DeriveKey: {
          type: "Compose",
          runAfter: {},
          inputs: "@concat(triggerBody()?['TargetId'], ':', triggerBody()?['CommandType'])",
        },
        GuardEmpty: {
          type: "If",
          runAfter: runAfter("DeriveKey", "Succeeded"),
          expression: "@not(empty(outputs('DeriveKey')))",
          actions: {
            Lookup: connector("GET", "GetItems"),
            HandleZero: {
              type: "If",
              runAfter: runAfter("Lookup", "Succeeded"),
              expression: "@equals(length(body('Lookup')?['value']), 0)",
              actions: {
                AuditGate: {
                  type: "If",
                  runAfter: {},
                  expression: "@equals(triggerBody()?['CommandType'], 'apply-change')",
                  actions: {},
                },
                AuditOnly: connector("POST", "CreateAudit", runAfter("AuditGate", "Succeeded"), {
                  resource: "audit-records",
                  identifier: "@triggerBody()?['CorrelationId']",
                }),
                ReconcileAudit: connector(
                  "GET",
                  "GetAuditRecord",
                  runAfter("AuditOnly", "Failed", "TimedOut"),
                  {
                    resource: "audit-records",
                    identifier: "@triggerBody()?['CorrelationId']",
                  },
                ),
              },
            },
            HandleOne: {
              type: "If",
              runAfter: runAfter("Lookup", "Succeeded"),
              expression: "@equals(length(body('Lookup')?['value']), 1)",
              actions: { ReturnExisting: { type: "Response", runAfter: {} } },
            },
            HandleMany: {
              type: "If",
              runAfter: runAfter("Lookup", "Succeeded"),
              expression: "@greater(length(body('Lookup')?['value']), 1)",
              actions: {
                FailReconciliation: {
                  type: "Terminate",
                  runAfter: {},
                  inputs: { status: "Failed" },
                },
              },
            },
            ProtectedMutation: connector(
              "POST",
              "UpdateItem",
              runAfter("HandleZero", "Succeeded"),
            ),
            ReconcileProtectedMutation: connector(
              "GET",
              "GetItem",
              runAfter("ProtectedMutation", "Failed", "TimedOut"),
            ),
          },
        },
      },
    }, async (project) => {
      const result = await runCli([
        "validate", "rules", "--root", project.root, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assertDiagnosticCodes(result, ["FLOW-IDEMPOTENCY-001"]);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  test("WP-05D RED: destructive gates reject constant-only evidence", async () => {
    const privateFlowId = "sensitive-constant-destructive-gates";
    await withProject({
      flowId: privateFlowId,
      processor: true,
      destructive: true,
      connectionReference: true,
      actions: {
        DeriveKey: {
          type: "Compose",
          runAfter: {},
          inputs: "@concat(triggerBody()?['TargetId'], ':', triggerBody()?['CommandType'])",
        },
        GuardEmpty: {
          type: "If",
          runAfter: runAfter("DeriveKey", "Succeeded"),
          expression: "@not(empty(outputs('DeriveKey')))",
          actions: {
            Lookup: connector("GET", "GetItems"),
            HandleZero: {
              type: "If",
              runAfter: runAfter("Lookup", "Succeeded"),
              expression: "@equals(length(body('Lookup')?['value']), 0)",
              actions: {
                DryRun: {
                  type: "If",
                  runAfter: {},
                  expression: "@equals('dryrun', 'dryrun')",
                  actions: {},
                  else: {
                    actions: {
                      Allowlist: {
                        type: "If",
                        runAfter: {},
                        expression: "@contains(createArray('allow-operation'), 'allow-operation')",
                        actions: {
                          PlanDigest: {
                            type: "Compose",
                            runAfter: {},
                            inputs: "@sha256('digest-hash')",
                          },
                          Approval: {
                            type: "If",
                            runAfter: runAfter("PlanDigest", "Succeeded"),
                            expression: "@equals('approval-token', 'approval-token')",
                            actions: {
                              WriteLimit: {
                                type: "If",
                                runAfter: {},
                                expression: "@lessOrEquals(1, 10)",
                                actions: {
                                  StateReread: connector("GET", "GetItem"),
                                  StopUnexpected: {
                                    type: "If",
                                    runAfter: runAfter("StateReread", "Succeeded"),
                                    expression: "@equals('unexpected-stop', 'unexpected-stop')",
                                    actions: {
                                      MutationGate: {
                                        type: "If",
                                        runAfter: {},
                                        expression: "@equals('mutation-gate', 'mutation-gate')",
                                        actions: {},
                                      },
                                      Delete: connector(
                                        "DELETE",
                                        "DeleteItem",
                                        runAfter("MutationGate", "Succeeded"),
                                      ),
                                      Readback: connector(
                                        "GET",
                                        "GetItem",
                                        runAfter("Delete", "Succeeded"),
                                      ),
                                      ReconcileDelete: connector(
                                        "GET",
                                        "GetItem",
                                        runAfter("Delete", "Failed", "TimedOut"),
                                      ),
                                      AssertReadback: {
                                        type: "If",
                                        runAfter: runAfter("Readback", "Succeeded"),
                                        expression: "@equals(body('Readback')?['Status'], 'Applied')",
                                        actions: {
                                          Complete: {
                                            type: "Terminate",
                                            runAfter: {},
                                            inputs: { status: "Succeeded" },
                                          },
                                        },
                                      },
                                      FailureAudit: connector(
                                        "POST",
                                        "CreateAudit",
                                        runAfter("Delete", "Failed", "TimedOut"),
                                      ),
                                      ReconcileFailureAudit: connector(
                                        "GET",
                                        "GetAuditRecord",
                                        runAfter("FailureAudit", "Failed", "TimedOut"),
                                      ),
                                      Compensate: connector(
                                        "POST",
                                        "CreateCompensation",
                                        runAfter("FailureAudit", "Succeeded"),
                                      ),
                                      ReconcileCompensation: connector(
                                        "GET",
                                        "GetCompensation",
                                        runAfter("Compensate", "Failed", "TimedOut"),
                                      ),
                                      Fail: {
                                        type: "Terminate",
                                        runAfter: runAfter("Compensate", "Succeeded"),
                                        inputs: { status: "Failed" },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            HandleOne: {
              type: "If",
              runAfter: runAfter("Lookup", "Succeeded"),
              expression: "@equals(length(body('Lookup')?['value']), 1)",
              actions: { ReturnExisting: { type: "Response", runAfter: {} } },
            },
            HandleMany: {
              type: "If",
              runAfter: runAfter("Lookup", "Succeeded"),
              expression: "@greater(length(body('Lookup')?['value']), 1)",
              actions: {
                FailReconciliation: {
                  type: "Terminate",
                  runAfter: {},
                  inputs: { status: "Failed" },
                },
              },
            },
          },
        },
      },
    }, async (project) => {
      const result = await runCli([
        "validate", "artifact", project.packagePath,
        "--contract", project.contractPath, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assertDiagnosticCodes(result, ["FLOW-DESTRUCTIVE-001", "PA-GRAPH-001"]);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });

  test("WP-05D RED: source inventory rejects an undeclared definition", async () => {
    const privateFlowId = "sensitive-undeclared-source-flow";
    await withProject({
      actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
    }, async (project) => {
      await writeJson(join(project.root, "flows", privateFlowId, "definition.json"), {
        properties: {
          connectionReferences: {},
          definition: {
            triggers: { SyntheticTrigger: { type: "Request" } },
            actions: { Inspect: { type: "Compose", runAfter: {}, inputs: "synthetic" } },
          },
        },
      });
      const result = await runCli([
        "validate", "artifact", project.packagePath,
        "--contract", project.contractPath, "--format", "json",
      ]);

      assert.equal(result.exitCode, 1, result.stdout);
      assertDiagnosticCodes(result, ["PKG-INTEGRITY-001"]);
      assert.equal(result.stdout.includes(privateFlowId), false);
    });
  });
});
