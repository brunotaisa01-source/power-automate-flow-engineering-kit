import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import type { FlowContract } from "../../packages/core/src/types/flow.ts";
import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";
import type { NormalizedFlow } from "../../packages/package-adapters/src/flow-normalizer.ts";
import {
  inspectProjectRuleEvidence,
  inspectSolutionBytes,
  type PackageInspection,
} from "../../packages/package-adapters/src/solution-v1.ts";
import {
  getRuleDetector,
  type ArtifactGraphInput,
  type ValidationContext,
} from "../../packages/rules/src/registry.ts";
import { syntheticSolution } from "../artifacts/synthetic-solution.ts";

const PACKAGE_PATH = "artifacts/synthetic-solution.zip";
const MANIFEST_PATH = "artifacts/manifest.json";
const FLOW_ID = "SyntheticFlow";

type RawAction = Readonly<Record<string, unknown>>;

interface TestAdapterEvidence {
  readonly packages: readonly [{
    readonly packageId: string;
    readonly relativePath: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly inspection: PackageInspection;
  }];
  readonly flows: readonly [{
    readonly packageId: string;
    readonly packagePath: string;
    readonly contract: FlowContract;
    readonly flow: NormalizedFlow;
  }];
}

type TestValidationContext = ValidationContext & {
  readonly adapterEvidence: TestAdapterEvidence;
};

function flowDefinition(
  actions: Readonly<Record<string, RawAction>>,
  connectionReferences: readonly string[] = [],
): unknown {
  return {
    properties: {
      connectionReferences: Object.fromEntries(
        connectionReferences.map((reference) => [
          reference,
          { connectorId: "synthetic-connector" },
        ]),
      ),
      definition: {
        triggers: { SyntheticTrigger: { type: "Request" } },
        actions,
      },
    },
  };
}

function runAfter(actionId: string, ...statuses: string[]): unknown {
  return { [actionId]: statuses };
}

function connector(
  method: string,
  operationId: string,
  after: unknown = {},
): RawAction {
  return {
    type: "OpenApiConnection",
    runAfter: after,
    inputs: {
      host: {
        connection: { referenceName: "synthetic_connection" },
        operationId,
      },
      method,
      uri: "/synthetic/items",
      parameters: {
        listId: "synthetic-items",
        itemId: "@triggerBody()?['TargetId']",
      },
    },
    runtimeConfiguration: { retryPolicy: { type: "none" } },
  };
}

function idempotencyActions(options: {
  readonly keyExpression?: string;
  readonly emptyGuardExpression?: string;
  readonly zeroCardinalityExpression?: string;
  readonly oneCardinalityExpression?: string;
  readonly manyCardinalityExpression?: string;
} = {}): Readonly<Record<string, RawAction>> {
  return {
    DeriveKey: {
      type: "Compose",
      runAfter: {},
      inputs: options.keyExpression
        ?? "@concat(triggerBody()?['TargetId'], ':', triggerBody()?['CommandType'])",
    },
    GuardEmpty: {
      type: "If",
      runAfter: runAfter("DeriveKey", "Succeeded"),
      expression: options.emptyGuardExpression
        ?? "@not(empty(outputs('DeriveKey')))",
      actions: {
        Lookup: connector("GET", "GetItems"),
        HandleZero: {
          type: "If",
          runAfter: runAfter("Lookup", "Succeeded"),
          expression: options.zeroCardinalityExpression
            ?? "@equals(length(body('Lookup')?['value']), 0)",
          actions: {
            Create: connector("POST", "CreateItem"),
          },
        },
        HandleOne: {
          type: "If",
          runAfter: runAfter("Lookup", "Succeeded"),
          expression: options.oneCardinalityExpression
            ?? "@equals(length(body('Lookup')?['value']), 1)",
          actions: {
            ReturnExisting: { type: "Response", runAfter: {} },
          },
        },
        HandleMany: {
          type: "If",
          runAfter: runAfter("Lookup", "Succeeded"),
          expression: options.manyCardinalityExpression
            ?? "@greater(length(body('Lookup')?['value']), 1)",
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

function destructiveActions(
  approvalExpression: string,
  options: {
    readonly digestExpression?: string;
    readonly dryRunExpression?: string;
  } = {},
): Readonly<Record<string, RawAction>> {
  return {
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
                          },
                          FailureAudit: connector(
                            "POST",
                            "CreateAudit",
                            runAfter("Delete", "Failed", "TimedOut"),
                          ),
                          Compensate: connector(
                            "POST",
                            "CreateCompensation",
                            runAfter("FailureAudit", "Succeeded"),
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
  };
}

function projectContract(actionBudget: number): ProjectContract {
  return {
    flows: [{
      id: FLOW_ID,
      definitionPath: "definitions/synthetic-flow.json",
      trigger: "manual",
      processorForCommandTypes: ["ApplySyntheticChange"],
      connectionReferences: ["synthetic_connection"],
      actionBudget,
      concurrency: { enabled: true, degree: 1 },
      packageId: "synthetic-package",
    }],
    packages: [{
      id: "synthetic-package",
      path: PACKAGE_PATH,
      profile: "power-platform-solution-v1",
      manifestPath: MANIFEST_PATH,
      flowIds: [FLOW_ID],
      importMode: "disabled",
      nestedArchives: "forbidden",
    }],
    commands: [{
      type: "ApplySyntheticChange",
      queueListId: "synthetic-items",
      targetListId: "synthetic-items",
      targetIdField: "TargetId",
      idempotency: {
        keyFields: ["TargetId", "CommandType"],
        emptyKey: "reject",
        zeroMatches: "create-or-execute",
        oneMatch: "return-existing-or-continue",
        manyMatches: "fail-reconciliation",
        ambiguousWrite: "get-reconcile-no-blind-retry",
      },
      readback: {
        required: true,
        fields: ["Status"],
        assertions: [{ field: "Status", operator: "equals", expected: "Applied" }],
      },
    }],
    security: {
      destructiveOperations: {
        dryRun: true,
        planDigest: true,
        humanApproval: true,
        itemLimit: 10,
        writeLimit: 10,
        stopOnUnexpected: true,
        semanticReadback: true,
      },
    },
  } as unknown as ProjectContract;
}

async function inspectedContext(
  rawFlow: unknown,
  actionBudget = 20,
  graph: ArtifactGraphInput = { nodes: [], edges: [] },
): Promise<TestValidationContext> {
  const bytes = syntheticSolution(rawFlow, FLOW_ID);
  const inspection = await inspectSolutionBytes(bytes);
  assert.equal(inspection.valid, true);
  const flow = inspection.flows[0];
  assert.notEqual(flow, undefined);
  assert.ok(flow!.actions instanceof Map);
  assert.ok(flow!.connectionReferences instanceof Set);
  const contract = projectContract(actionBudget);
  return {
    root: ".",
    offline: true,
    contract,
    graph,
    adapterEvidence: {
      packages: [{
        packageId: "synthetic-package",
        relativePath: PACKAGE_PATH,
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        inspection,
      }],
      flows: [{
        packageId: "synthetic-package",
        packagePath: PACKAGE_PATH,
        contract: contract.flows[0]!,
        flow: flow!,
      }],
    },
  } as TestValidationContext;
}

async function diagnostics(ruleId: string, context: ValidationContext) {
  const detector = getRuleDetector(ruleId);
  assert.notEqual(detector, undefined);
  return detector!.validate(context);
}

describe("WP-05R real adapter boundary counterexamples", () => {
  test("production context inspects exact package bytes through the safe adapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-wp05r-"));
    try {
      const rawFlow = flowDefinition({
        OnlyAction: { type: "Compose", runAfter: {}, inputs: "synthetic" },
      });
      const bytes = syntheticSolution(rawFlow, FLOW_ID);
      const packageTarget = join(root, ...PACKAGE_PATH.split("/"));
      await mkdir(join(packageTarget, ".."), { recursive: true });
      await writeFile(packageTarget, bytes);

      const contract = projectContract(20);
      const context: ValidationContext = {
        root,
        offline: true,
        contract,
        graph: { nodes: [], edges: [] },
        adapterEvidence: await inspectProjectRuleEvidence(root, contract),
      };

      assert.equal(context.adapterEvidence.packages.length, 1);
      assert.equal(context.adapterEvidence.packages[0]?.bytes, bytes.byteLength);
      assert.equal(
        context.adapterEvidence.packages[0]?.sha256,
        createHash("sha256").update(bytes).digest("hex"),
      );
      assert.equal(context.adapterEvidence.packages[0]?.inspection?.valid, true);
      assert.ok(context.adapterEvidence.flows[0]?.flow.actions instanceof Map);
      assert.ok(context.adapterEvidence.flows[0]?.flow.connectionReferences instanceof Set);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("FLOW-STATUS-001 rejects Succeeded after failed semantic readback", async () => {
    const context = await inspectedContext(flowDefinition({
      Mutate: connector("POST", "UpdateItem"),
      Readback: connector("GET", "GetItem", runAfter("Mutate", "Succeeded")),
      AssertEffect: {
        type: "If",
        runAfter: runAfter("Readback", "Failed"),
        expression: "@equals(body('Readback')?['Status'], 'Applied')",
        actions: {},
      },
      Complete: {
        type: "Terminate",
        runAfter: runAfter("AssertEffect", "Succeeded"),
        inputs: { status: "Succeeded" },
      },
    }, ["synthetic_connection"]));

    assert.deepEqual(await diagnostics("FLOW-STATUS-001", context), [{
      code: "FLOW-STATUS-001",
      path: `${PACKAGE_PATH}#/flows/<flow>/actions/<action>`,
      message: "Succeeded completion is not guarded by successful semantic readback.",
    }]);
  });

  test("FLOW-STATUS-001 rejects Succeeded after an always-false assertion action", async () => {
    const privateFlowId = "PrivateFlowMarker";
    const privateActionId = "PrivateAssertionMarker";
    const bytes = syntheticSolution(flowDefinition({
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
    }, ["synthetic_connection"]), privateFlowId);
    const inspection = await inspectSolutionBytes(bytes);
    const flow = inspection.flows[0];
    assert.notEqual(flow, undefined);
    const baseContract = projectContract(20);
    const contract = {
      ...baseContract,
      flows: [{ ...baseContract.flows[0]!, id: privateFlowId }],
      packages: [{ ...baseContract.packages[0]!, flowIds: [privateFlowId] }],
    } as ProjectContract;
    const context = {
      root: ".",
      offline: true,
      contract,
      graph: { nodes: [], edges: [] },
      adapterEvidence: {
        packages: [{
          packageId: "synthetic-package",
          relativePath: PACKAGE_PATH,
          contract: contract.packages[0]!,
          bytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          inspection,
        }],
        flows: [{
          packageId: "synthetic-package",
          packagePath: PACKAGE_PATH,
          contract: contract.flows[0]!,
          flow: flow!,
        }],
      },
    } as ValidationContext;

    const result = await diagnostics("FLOW-STATUS-001", context);
    assert.equal(result.length, 1);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(privateFlowId), false);
    assert.equal(serialized.includes(privateActionId), false);
  });

  test("FLOW-IDEMPOTENCY-001 rejects label-only cardinality handlers", async () => {
    const context = await inspectedContext(flowDefinition({
      DeriveKey: {
        type: "Compose",
        runAfter: {},
        metadata: { spflowRole: "idempotency-key" },
        inputs: "@concat(triggerBody()?['TargetId'], ':', triggerBody()?['CommandType'])",
      },
      GuardEmpty: {
        type: "If",
        runAfter: runAfter("DeriveKey", "Succeeded"),
        metadata: { spflowRole: "idempotency-empty-guard" },
        expression: "@empty(outputs('DeriveKey'))",
        actions: {},
      },
      HandleZero: {
        type: "Compose",
        runAfter: runAfter("GuardEmpty", "Succeeded"),
        metadata: { spflowRole: "cardinality-zero" },
        inputs: "no-op",
      },
      HandleOne: {
        type: "Compose",
        runAfter: runAfter("HandleZero", "Succeeded"),
        metadata: { spflowRole: "cardinality-one" },
        inputs: "no-op",
      },
      HandleMany: {
        type: "Compose",
        runAfter: runAfter("HandleOne", "Succeeded"),
        metadata: { spflowRole: "cardinality-many" },
        inputs: "no-op",
      },
    }));

    assert.equal((await diagnostics("FLOW-IDEMPOTENCY-001", context)).length, 1);
  });

  test("FLOW-IDEMPOTENCY-001 accepts structurally derived key and cardinality operations", async () => {
    const context = await inspectedContext(flowDefinition(
      idempotencyActions(),
      ["synthetic_connection"],
    ));

    assert.deepEqual(await diagnostics("FLOW-IDEMPOTENCY-001", context), []);
  });

  test("FLOW-IDEMPOTENCY-001 rejects key fields confined to statically irrelevant branches", async () => {
    const context = await inspectedContext(flowDefinition(
      idempotencyActions({
        keyExpression: "@concat(if(true, 'fixed-target', triggerBody()?['TargetId']), ':', if(equals('fixed', 'fixed'), 'fixed-command', triggerBody()?['CommandType']))",
      }),
      ["synthetic_connection"],
    ));

    assert.deepEqual(await diagnostics("FLOW-IDEMPOTENCY-001", context), [{
      code: "FLOW-IDEMPOTENCY-001",
      path: `${PACKAGE_PATH}#/flows/<flow>/idempotency`,
      message: "Flow does not provide a deterministic non-empty key with explicit zero, one, and many handling.",
    }]);
  });

  test("FLOW-IDEMPOTENCY-001 rejects key fields confined to tautological comparisons", async () => {
    const context = await inspectedContext(flowDefinition(
      idempotencyActions({
        keyExpression: "@concat(less(triggerBody()?['TargetId'], triggerBody()?['TargetId']), ':', greaterOrEquals(triggerBody()?['CommandType'], triggerBody()?['CommandType']))",
      }),
      ["synthetic_connection"],
    ));

    assert.deepEqual(await diagnostics("FLOW-IDEMPOTENCY-001", context), [{
      code: "FLOW-IDEMPOTENCY-001",
      path: `${PACKAGE_PATH}#/flows/<flow>/idempotency`,
      message: "Flow does not provide a deterministic non-empty key with explicit zero, one, and many handling.",
    }]);
  });

  test("FLOW-IDEMPOTENCY-001 accepts key fields in statically selected runtime branches", async () => {
    const context = await inspectedContext(flowDefinition(
      idempotencyActions({
        keyExpression: "@concat(if(true, triggerBody()?['TargetId'], 'fixed-target'), ':', if(false, 'fixed-command', triggerBody()?['CommandType']))",
      }),
      ["synthetic_connection"],
    ));

    assert.deepEqual(await diagnostics("FLOW-IDEMPOTENCY-001", context), []);
  });

  for (const [scenario, options] of [
    ["non-empty key behind a dominating statically false conjunct", {
      emptyGuardExpression: "@and(not(empty(outputs('DeriveKey'))), equals('fixed', 'different'))",
    }],
    ["zero cardinality behind a dominating false conjunct", {
      zeroCardinalityExpression: "@and(equals(length(body('Lookup')?['value']), 0), false)",
    }],
    ["one cardinality behind a dominating false conjunct", {
      oneCardinalityExpression: "@and(equals(length(body('Lookup')?['value']), 1), false)",
    }],
    ["many cardinality behind a dominating false conjunct", {
      manyCardinalityExpression: "@and(greater(length(body('Lookup')?['value']), 1), false)",
    }],
    ["non-empty key inside a statically unknown disjunction", {
      emptyGuardExpression: "@or(not(empty(outputs('DeriveKey'))), equals(triggerBody()?['Unrelated'], true))",
    }],
  ] as const) {
    test(`FLOW-IDEMPOTENCY-001 rejects ${scenario}`, async () => {
      const context = await inspectedContext(flowDefinition(
        idempotencyActions(options),
        ["synthetic_connection"],
      ));

      assert.deepEqual(await diagnostics("FLOW-IDEMPOTENCY-001", context), [{
        code: "FLOW-IDEMPOTENCY-001",
        path: `${PACKAGE_PATH}#/flows/<flow>/idempotency`,
        message: "Flow does not provide a deterministic non-empty key with explicit zero, one, and many handling.",
      }]);
    });
  }

  test("FLOW-IDEMPOTENCY-001 accepts runtime predicates with neutral true conjuncts", async () => {
    const context = await inspectedContext(flowDefinition(
      idempotencyActions({
        emptyGuardExpression: "@and(not(empty(outputs('DeriveKey'))), true)",
        zeroCardinalityExpression: "@and(equals(length(body('Lookup')?['value']), 0), true)",
        oneCardinalityExpression: "@and(equals(length(body('Lookup')?['value']), 1), true)",
        manyCardinalityExpression: "@and(greater(length(body('Lookup')?['value']), 1), true)",
      }),
      ["synthetic_connection"],
    ));

    assert.deepEqual(await diagnostics("FLOW-IDEMPOTENCY-001", context), []);
  });

  for (const [scenario, options] of [
    ["non-empty key", {
      emptyGuardExpression: "@and(equals(outputs('DeriveKey'), outputs('DeriveKey')), not(empty(triggerBody()?['Unrelated'])))",
    }],
    ["lookup cardinality", {
      zeroCardinalityExpression: "@and(equals(body('Lookup')?['value'], body('Lookup')?['value']), equals(length(triggerBody()?['Unrelated']), 0))",
    }],
  ] as const) {
    test(`FLOW-IDEMPOTENCY-001 rejects an irrelevant-runtime ${scenario} predicate`, async () => {
      const context = await inspectedContext(flowDefinition(
        idempotencyActions(options),
        ["synthetic_connection"],
      ));

      assert.deepEqual(await diagnostics("FLOW-IDEMPOTENCY-001", context), [{
        code: "FLOW-IDEMPOTENCY-001",
        path: `${PACKAGE_PATH}#/flows/<flow>/idempotency`,
        message: "Flow does not provide a deterministic non-empty key with explicit zero, one, and many handling.",
      }]);
    });
  }

  test("FLOW-DESTRUCTIVE-001 accepts selected runtime dataflow with a constant identity conjunct", async () => {
    const context = await inspectedContext(flowDefinition(
      destructiveActions(
        "@equals(triggerBody()?['ApprovalToken'], triggerBody()?['PlanDigest'])",
        {
          dryRunExpression: "@and(equals(triggerBody()?['DryRun'], true), true)",
          digestExpression: "@sha256(if(false, 'fixed-plan', string(triggerBody()?['Plan'])))",
        },
      ),
      ["synthetic_connection"],
    ));

    assert.deepEqual(await diagnostics("FLOW-DESTRUCTIVE-001", context), []);
  });

  test("FLOW-DESTRUCTIVE-001 rejects label-only gate operations", async () => {
    const labeled = (
      type: string,
      role: string,
      after: unknown,
      extra: Readonly<Record<string, unknown>> = {},
    ): RawAction => ({
      type,
      runAfter: after,
      metadata: { spflowRole: role },
      ...extra,
    });
    const context = await inspectedContext(flowDefinition({
      DryRun: labeled("Compose", "dry-run", {}, { inputs: "no-op" }),
      Allowlist: labeled("Compose", "target-allowlist", runAfter("DryRun", "Succeeded"), { inputs: "no-op" }),
      Digest: labeled("Compose", "plan-digest", runAfter("Allowlist", "Succeeded"), { inputs: "no-op" }),
      Approval: labeled("If", "approval", runAfter("Digest", "Succeeded"), {
        expression: "@equals(triggerBody()?['approved'], true)", actions: {},
      }),
      Limit: labeled("Compose", "write-limit", runAfter("Approval", "Succeeded"), { inputs: "no-op" }),
      State: labeled("Compose", "state-reread", runAfter("Limit", "Succeeded"), { inputs: "no-op" }),
      Delete: {
        ...connector("DELETE", "DeleteItem", runAfter("State", "Succeeded")),
        metadata: { spflowRole: "mutation" },
      },
      Readback: connector("GET", "GetItem", runAfter("Delete", "Succeeded")),
      Assert: labeled("If", "readback", runAfter("Readback", "Succeeded"), {
        expression: "@equals(body('Readback')?['Status'], 'Applied')", actions: {},
      }),
      StopUnexpected: labeled("Compose", "stop-unexpected", runAfter("Assert", "Succeeded"), { inputs: "no-op" }),
      Complete: {
        type: "Terminate",
        runAfter: runAfter("StopUnexpected", "Succeeded"),
        inputs: { status: "Succeeded" },
      },
      FailureAudit: {
        ...connector("POST", "CreateAudit", runAfter("Delete", "Failed", "TimedOut")),
        metadata: { spflowRole: "failure-audit" },
      },
      Compensate: {
        ...connector("POST", "CreateCompensation", runAfter("FailureAudit", "Failed", "TimedOut")),
        metadata: { spflowRole: "compensation" },
      },
      Fail: labeled("Terminate", "failure", runAfter("Compensate", "Failed", "TimedOut"), {
        inputs: { status: "Failed" },
      }),
    }, ["synthetic_connection"]));

    assert.equal((await diagnostics("FLOW-DESTRUCTIVE-001", context)).length, 1);
  });

  test("FLOW-DESTRUCTIVE-001 accepts structurally derived bounded operations", async () => {
    const context = await inspectedContext(flowDefinition(
      destructiveActions("@equals(triggerBody()?['ApprovalToken'], triggerBody()?['PlanDigest'])"),
      ["synthetic_connection"],
    ));

    assert.deepEqual(await diagnostics("FLOW-DESTRUCTIVE-001", context), []);
  });

  for (const [scenario, options] of [
    ["dry-run field behind a dominating false conjunct", {
      dryRunExpression: "@and(equals(triggerBody()?['DryRun'], true), equals('fixed', 'different'))",
    }],
    ["plan field in a statically unselected digest branch", {
      digestExpression: "@sha256(if(true, 'fixed-plan', triggerBody()?['Plan']))",
    }],
    ["plan field in a tautological digest comparison", {
      digestExpression: "@sha256(string(less(triggerBody()?['Plan'], triggerBody()?['Plan'])))",
    }],
  ] as const) {
    test(`FLOW-DESTRUCTIVE-001 rejects ${scenario}`, async () => {
      const context = await inspectedContext(flowDefinition(
        destructiveActions(
          "@equals(triggerBody()?['ApprovalToken'], triggerBody()?['PlanDigest'])",
          options,
        ),
        ["synthetic_connection"],
      ));

      assert.deepEqual(await diagnostics("FLOW-DESTRUCTIVE-001", context), [{
        code: "FLOW-DESTRUCTIVE-001",
        path: `${PACKAGE_PATH}#/flows/<flow>/destructiveGates`,
        message: "Destructive flow lacks required authorization, audit, readback, or compensation evidence.",
      }]);
    });
  }

  test("FLOW-DESTRUCTIVE-001 rejects a tautological approval label with an irrelevant runtime reference", async () => {
    const context = await inspectedContext(flowDefinition(
      destructiveActions("@and(equals(triggerBody()?['Unrelated'], triggerBody()?['Unrelated']), equals('approval', 'approval'))"),
      ["synthetic_connection"],
    ));

    assert.deepEqual(await diagnostics("FLOW-DESTRUCTIVE-001", context), [{
      code: "FLOW-DESTRUCTIVE-001",
      path: `${PACKAGE_PATH}#/flows/<flow>/destructiveGates`,
      message: "Destructive flow lacks required authorization, audit, readback, or compensation evidence.",
    }]);
  });

  test("FLOW-DESTRUCTIVE-001 derives an unlabeled destructive operation", async () => {
    const context = await inspectedContext(flowDefinition({
      Authorize: {
        type: "If",
        runAfter: {},
        expression: "@equals(triggerBody()?['approved'], true)",
        actions: {},
      },
      DeleteItem: connector("DELETE", "DeleteItem", runAfter("Authorize", "Succeeded")),
      Complete: {
        type: "Terminate",
        runAfter: runAfter("DeleteItem", "Succeeded"),
        inputs: { status: "Succeeded" },
      },
    }, ["synthetic_connection"]));

    assert.deepEqual(await diagnostics("FLOW-DESTRUCTIVE-001", context), [{
      code: "FLOW-DESTRUCTIVE-001",
      path: `${PACKAGE_PATH}#/flows/<flow>/destructiveGates`,
      message: "Destructive flow lacks required authorization, audit, readback, or compensation evidence.",
    }]);
  });

  test("PA-CONNECTOR-001 detects connector shape without a kind label", async () => {
    const context = await inspectedContext(flowDefinition({
      Mutate: connector("MERGE", "HttpRequest"),
    }, ["synthetic_connection"]));

    assert.deepEqual(await diagnostics("PA-CONNECTOR-001", context), [{
      code: "PA-CONNECTOR-001",
      path: `${PACKAGE_PATH}#/flows/<flow>/actions/<action>/connector`,
      message: "SharePoint REST mutation does not use POST with a MERGE override and exact ETag.",
    }]);
  });

  test("PA-LIMIT-001 uses the project contract budget", async () => {
    const context = await inspectedContext(flowDefinition({
      First: { type: "Compose", runAfter: {}, inputs: "synthetic" },
      Second: {
        type: "Compose",
        runAfter: runAfter("First", "Succeeded"),
        inputs: "synthetic",
      },
    }), 1);

    assert.deepEqual(await diagnostics("PA-LIMIT-001", context), [{
      code: "PA-LIMIT-001",
      path: `${PACKAGE_PATH}#/flows/<flow>/actionCount`,
      message: "Flow action count exceeds its project contract or platform budget.",
    }]);
  });

  test("PA-GRAPH-001 rejects a predecessor from another container", async () => {
    const context = await inspectedContext(flowDefinition({
      Outer: {
        type: "Scope",
        runAfter: {},
        actions: {
          Inner: { type: "Compose", runAfter: {}, inputs: "synthetic" },
        },
      },
      Complete: {
        type: "Compose",
        runAfter: runAfter("Inner", "Succeeded"),
        inputs: "synthetic",
      },
    }));

    assert.deepEqual(await diagnostics("PA-GRAPH-001", context), [{
      code: "PA-GRAPH-001",
      path: `${PACKAGE_PATH}#/flows/<flow>/actions/<action>/runAfter/<predecessor>`,
      message: "Action predecessor is outside the action's container.",
    }]);
  });

  test("PA-GRAPH-001 rejects a predecessor from a sibling branch", async () => {
    const context = await inspectedContext(flowDefinition({
      Gate: {
        type: "If",
        runAfter: {},
        expression: "@equals('synthetic', 'synthetic')",
        actions: {
          Approved: { type: "Compose", runAfter: {}, inputs: "approved" },
        },
        else: {
          actions: {
            Rejected: {
              type: "Compose",
              runAfter: runAfter("Approved", "Succeeded"),
              inputs: "rejected",
            },
          },
        },
      },
    }));

    assert.deepEqual(await diagnostics("PA-GRAPH-001", context), [{
      code: "PA-GRAPH-001",
      path: `${PACKAGE_PATH}#/flows/<flow>/actions/<action>/runAfter/<predecessor>`,
      message: "Action predecessor is outside the action's container.",
    }]);
  });

  test("PA-GRAPH-001 applies first-action semantics within a container", async () => {
    const context = await inspectedContext(flowDefinition({
      First: { type: "Compose", runAfter: {}, inputs: "first" },
      Detached: { type: "Compose", runAfter: {}, inputs: "detached" },
    }));

    assert.deepEqual(await diagnostics("PA-GRAPH-001", context), [{
      code: "PA-GRAPH-001",
      path: `${PACKAGE_PATH}#/flows/<flow>/actions/<action>`,
      message: "Flow action graph contains a missing, cross-container, unreachable, or bypassable dependency.",
    }]);
  });

  test("package rules reject missing required adapter evidence", async () => {
    const context = {
      root: ".",
      offline: true,
      contract: projectContract(20),
      graph: { nodes: [], edges: [] },
      adapterEvidence: { packages: [], flows: [] },
    } as unknown as TestValidationContext;

    for (const ruleId of ["PKG-ARCHIVE-001", "PKG-INTEGRITY-001", "PKG-NATIVE-001"]) {
      assert.deepEqual(await diagnostics(ruleId, context), [{
        code: ruleId,
        path: `${PACKAGE_PATH}#/inspection`,
        message: "Required final package inspection evidence is missing.",
      }]);
    }
    assert.deepEqual(await diagnostics("PA-LIMIT-001", context), [{
      code: "PA-LIMIT-001",
      path: `${PACKAGE_PATH}#/inspection`,
      message: "Required normalized flow evidence is missing.",
    }]);

    const omittedEvidence = {
      root: ".",
      offline: true,
      contract: projectContract(20),
      graph: { nodes: [], edges: [] },
    } as unknown as TestValidationContext;
    assert.deepEqual(await diagnostics("PKG-NATIVE-001", omittedEvidence), [{
      code: "PKG-NATIVE-001",
      path: `${PACKAGE_PATH}#/inspection`,
      message: "Required final package inspection evidence is missing.",
    }]);
    assert.deepEqual(await diagnostics("PA-LIMIT-001", omittedEvidence), [{
      code: "PA-LIMIT-001",
      path: `${PACKAGE_PATH}#/inspection`,
      message: "Required normalized flow evidence is missing.",
    }]);
  });

  test("every flow rule rejects missing normalized evidence", async () => {
    const context = {
      root: ".",
      offline: true,
      contract: projectContract(20),
      graph: { nodes: [], edges: [] },
      adapterEvidence: { packages: [], flows: [] },
    } as unknown as TestValidationContext;
    const flowRules = [
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
    ] as const;

    for (const ruleId of flowRules) {
      assert.deepEqual(await diagnostics(ruleId, context), [{
        code: ruleId,
        path: `${PACKAGE_PATH}#/inspection`,
        message: "Required normalized flow evidence is missing.",
      }]);
    }
  });

  test("PKG-INTEGRITY-001 rejects extra manifest inventory", async () => {
    const rawFlow = flowDefinition({
      OnlyAction: { type: "Compose", runAfter: {}, inputs: "synthetic" },
    });
    const base = await inspectedContext(rawFlow);
    const packaged = base.adapterEvidence.packages[0]!;
    const graph: ArtifactGraphInput = {
      nodes: [{
        id: "manifest:artifacts/manifest.json:artifact-manifest-v1",
        kind: "manifest",
        relativePath: MANIFEST_PATH,
        digest: "e".repeat(64),
        sourceProfile: "artifact-manifest-v1",
        data: {
          files: [
            {
              path: PACKAGE_PATH,
              mediaType: "application/zip",
              bytes: packaged.bytes,
              sha256: packaged.sha256,
              role: "package",
            },
            {
              path: "artifacts/stale.txt",
              mediaType: "text/plain",
              bytes: 9,
              sha256: "f".repeat(64),
              role: "documentation",
            },
          ],
        },
        projections: {},
      }],
      edges: [],
    };
    const context = { ...base, graph };

    assert.deepEqual(await diagnostics("PKG-INTEGRITY-001", context), [{
      code: "PKG-INTEGRITY-001",
      path: `${MANIFEST_PATH}#/files`,
      message: "Artifact manifest inventory does not exactly match final release artifacts.",
    }]);
  });

  test("PKG-INTEGRITY-001 rejects adapter and manifest evidence without a ZIP artifact node", async () => {
    const rawFlow = flowDefinition({
      OnlyAction: { type: "Compose", runAfter: {}, inputs: "synthetic" },
    });
    const base = await inspectedContext(rawFlow);
    const packaged = base.adapterEvidence.packages[0]!;
    const contractDigest = "a".repeat(64);
    const definitionDigest = "b".repeat(64);
    const graph: ArtifactGraphInput = {
      nodes: [
        {
          id: "contract:project.contract.json:project-contract-v1",
          kind: "contract",
          relativePath: "project.contract.json",
          digest: contractDigest,
          byteLength: 100,
          sourceProfile: "project-contract-v1",
          data: {},
          projections: {},
        },
        {
          id: "definition:definitions/synthetic-flow.json:normalized-flow-v1",
          kind: "definition",
          relativePath: "definitions/synthetic-flow.json",
          digest: definitionDigest,
          byteLength: 200,
          sourceProfile: "normalized-flow-v1",
          data: { id: FLOW_ID },
          projections: {},
        },
        {
          id: "manifest:artifacts/manifest.json:artifact-manifest-v1",
          kind: "manifest",
          relativePath: MANIFEST_PATH,
          digest: "c".repeat(64),
          sourceProfile: "artifact-manifest-v1",
          data: {
            files: [
              {
                path: "project.contract.json",
                mediaType: "application/json",
                bytes: 100,
                sha256: contractDigest,
                role: "contract",
              },
              {
                path: "definitions/synthetic-flow.json",
                mediaType: "application/json",
                bytes: 200,
                sha256: definitionDigest,
                role: "definition",
              },
              {
                path: PACKAGE_PATH,
                mediaType: "application/zip",
                bytes: packaged.bytes,
                sha256: packaged.sha256,
                role: "package",
              },
            ],
          },
          projections: {},
        },
      ],
      edges: [],
    };

    assert.deepEqual(
      await diagnostics("PKG-INTEGRITY-001", { ...base, graph }),
      [{
        code: "PKG-INTEGRITY-001",
        path: `${MANIFEST_PATH}#/files`,
        message: "Artifact manifest inventory does not exactly match final release artifacts.",
      }],
    );
  });
});
