import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { validateActionGraph } from "../../packages/package-adapters/src/action-graph.ts";
import { normalizeFlow } from "../../packages/package-adapters/src/flow-normalizer.ts";
import { parseWdlExpression } from "../../packages/package-adapters/src/wdl-parser.ts";

interface RawAction {
  readonly type: string;
  readonly runAfter?: Readonly<Record<string, readonly string[]>>;
  readonly inputs?: unknown;
  readonly actions?: Readonly<Record<string, RawAction>>;
  readonly metadata?: { readonly spflowRole: string };
  readonly runtimeConfiguration?: unknown;
}

function definition(actions: Readonly<Record<string, RawAction>>): unknown {
  return {
    properties: {
      connectionReferences: {
        synthetic_connection: { connectorId: "synthetic-connector" },
      },
      definition: {
        triggers: { Synthetic_trigger: { type: "Request" } },
        actions,
      },
    },
  };
}

function action(
  type: string,
  runAfter: Readonly<Record<string, readonly string[]>> = {},
  role?: string,
  extra: Omit<RawAction, "type" | "runAfter" | "metadata"> = {},
): RawAction {
  return {
    type,
    runAfter,
    ...(role === undefined ? {} : { metadata: { spflowRole: role } }),
    ...extra,
  };
}

describe("package adapter action graph", () => {
  test("normalizes ancestry, runAfter, expressions, connectors, retries, and connections", () => {
    const flow = normalizeFlow(definition({
      Authorize: action("Compose", {}, "authorization", {
        inputs: "@equals(triggerBody()?['kind'], 'Synthetic')",
      }),
      Mutate: action("OpenApiConnection", { Authorize: ["Succeeded"] }, "mutation", {
        inputs: {
          host: {
            connection: { referenceName: "synthetic_connection" },
            operationId: "UpdateSyntheticItem",
          },
          method: "POST",
          uri: "/synthetic/items",
        },
        runtimeConfiguration: {
          retryPolicy: { type: "none", count: 0, interval: "PT1S" },
        },
      }),
      Readback_scope: action("Scope", { Mutate: ["Succeeded"] }, "readback", {
        actions: {
          Verify: action("Compose", {}, undefined, {
            inputs: "@outputs('Mutate')",
          }),
        },
      }),
      Complete: action("Compose", { Readback_scope: ["Succeeded"] }, "completion"),
    }), { id: "synthetic-flow" });

    assert.equal(flow.trigger.id, "Synthetic_trigger");
    assert.equal(flow.actionCount, 5);
    assert.deepEqual([...flow.connectionReferences], ["synthetic_connection"]);
    assert.deepEqual(flow.actions.get("Mutate")?.runAfter, [{
      actionId: "Authorize",
      statuses: ["Succeeded"],
    }]);
    assert.deepEqual(flow.actions.get("Mutate")?.connector, {
      reference: "synthetic_connection",
      operationId: "UpdateSyntheticItem",
      method: "POST",
      uriClass: "relative",
    });
    assert.deepEqual(flow.actions.get("Mutate")?.retryPolicy, {
      type: "none",
      count: 0,
      interval: "PT1S",
    });
    assert.equal(flow.actions.get("Verify")?.parentId, "Readback_scope");
    assert.equal(flow.actions.get("Verify")?.parentType, "Scope");
    assert.deepEqual(flow.actions.get("Verify")?.expressionPointers, ["/inputs"]);
    assert.deepEqual(validateActionGraph(flow), []);
  });

  test("reports a missing predecessor", () => {
    const flow = normalizeFlow(definition({
      Mutate: action("Compose", { Missing_guard: ["Succeeded"] }, "mutation"),
    }), { id: "synthetic-flow" });

    assert.deepEqual(validateActionGraph(flow), [{
      code: "PA-GRAPH-001",
      path: "<flow>#/actions/<action>/runAfter/<predecessor>",
      message: "An action references a predecessor that does not exist.",
    }]);
  });

  test("reports a predecessor from another action container", () => {
    const flow = normalizeFlow(definition({
      Outer: action("Scope", {}, undefined, {
        actions: {
          Inner: action("Compose"),
        },
      }),
      Complete: action("Compose", { Inner: ["Succeeded"] }),
    }), { id: "synthetic-flow" });

    assert.deepEqual(validateActionGraph(flow), [{
      code: "PA-GRAPH-001",
      path: "<flow>#/actions/<action>/runAfter/<predecessor>",
      message: "An action references a predecessor outside its container.",
    }]);
  });

  test("reports cycles in deterministic node order", () => {
    const flow = normalizeFlow(definition({
      Beta: action("Compose", { Alpha: ["Succeeded"] }),
      Alpha: action("Compose", { Beta: ["Succeeded"] }),
    }), { id: "synthetic-flow" });

    assert.deepEqual(validateActionGraph(flow), [{
      code: "PA-GRAPH-002",
      path: "<flow>#/actions/<action>",
      message: "The action graph contains a cycle.",
    }]);
  });

  test("reports an authorization action that is unreachable from the trigger", () => {
    const flow = normalizeFlow(definition({
      Authorize: action("Compose", { Authorize: ["Succeeded"] }, "authorization"),
    }), { id: "synthetic-flow" });

    assert.deepEqual(validateActionGraph(flow), [
      {
        code: "PA-GRAPH-001",
        path: "<flow>#/actions/<action>",
        message: "A required operation is unreachable from the trigger.",
      },
      {
        code: "PA-GRAPH-002",
        path: "<flow>#/actions/<action>",
        message: "The action graph contains a cycle.",
      },
    ]);
  });

  test("reports completion that bypasses semantic readback", () => {
    const flow = normalizeFlow(definition({
      Authorize: action("Compose", {}, "authorization"),
      Mutate: action("Compose", { Authorize: ["Succeeded"] }, "mutation"),
      Readback: action("Compose", { Mutate: ["Succeeded"] }, "readback"),
      Complete: action("Compose", { Mutate: ["Succeeded"] }, "completion"),
    }), { id: "synthetic-flow" });

    assert.deepEqual(validateActionGraph(flow), [{
      code: "FLOW-STATUS-001",
      path: "<flow>#/actions/<action>",
      message: "A completion action is reachable without semantic readback.",
    }]);
  });

  test("reports Terminate nested inside a loop", () => {
    const flow = normalizeFlow(definition({
      Process_items: action("Foreach", {}, undefined, {
        actions: {
          Stop: action("Terminate"),
        },
      }),
    }), { id: "synthetic-flow" });

    assert.deepEqual(validateActionGraph(flow), [{
      code: "PA-SCOPE-001",
      path: "<flow>#/actions/<action>",
      message: "A Terminate action has a loop ancestor.",
    }]);
  });

  test("parses WDL references and rejects malformed calls", () => {
    assert.deepEqual(
      parseWdlExpression("@equals(outputs('Authorize'), 'Synthetic')"),
      {
        functions: ["equals", "outputs"],
        actionReferences: ["Authorize"],
        readbackAssertions: [],
        root: {
          kind: "call",
          name: "equals",
          arguments: [
            {
              kind: "call",
              name: "outputs",
              arguments: [{ kind: "literal", value: "Authorize" }],
            },
            { kind: "literal", value: "Synthetic" },
          ],
        },
      },
    );
    assert.throws(
      () => parseWdlExpression("@equals(outputs('Authorize')"),
      (error: unknown) => error instanceof Error
        && "code" in error
        && error.code === "PA-WDL-001",
    );
    for (const malformed of [
      "@equals(, 'Synthetic')",
      "@equals('Synthetic',)",
      "@equals('Synthetic',, 'Synthetic')",
      "@equals(1 2)",
      "@equals(1, 2) trailing",
      "@concat('Synthetic',, 'Value')",
    ]) {
      assert.throws(
        () => parseWdlExpression(malformed),
        (error: unknown) => error instanceof Error
          && "code" in error
          && error.code === "PA-WDL-001",
      );
    }
  });

  test("sanitizes normalized flow and action identifiers in adapter diagnostics", () => {
    const flowId = "SensitiveFlowIdentifier";
    const actionId = "SensitiveActionIdentifier";
    const flow = normalizeFlow(definition({
      [actionId]: action("Compose", { MissingSensitivePredecessor: ["Succeeded"] }),
    }), { id: flowId });

    const serialized = JSON.stringify(validateActionGraph(flow));
    assert.equal(serialized.includes(flowId), false);
    assert.equal(serialized.includes(actionId), false);
    assert.equal(serialized.includes("MissingSensitivePredecessor"), false);
  });
});
