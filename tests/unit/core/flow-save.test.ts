import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FlowDefinitionPreparationError,
  preparePowerAutomateDefinition,
} from "../../../packages/core/src/flow-save.ts";

const connectionReferences = {
  shared_commondataserviceforapps: {
    connectionName: "shared-commondataser-synthetic",
    connectionReferenceLogicalName: "prp_sharedcommondataserviceforapps_synthetic",
  },
};

function sourceDefinition() {
  return {
    triggers: { manual: { type: "Request" } },
    actions: {
      Create_Record: {
        type: "OpenApiConnection",
        runAfter: {},
        inputs: {
          host: {
            apiId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
            connectionName: "shared_commondataserviceforapps",
            operationId: "CreateRecord",
          },
          parameters: { entityName: "synthetic_records", item: { Name: "synthetic" } },
          authentication: "@parameters('$authentication')",
        },
      },
      Condition: {
        type: "If",
        runAfter: { Create_Record: ["Succeeded"] },
        expression: "@equals(1, 1)",
        actions: {
          Nested_Read: {
            type: "OpenApiConnection",
            runAfter: {},
            inputs: {
              host: {
                apiId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                connectionName: "shared_commondataserviceforapps",
                operationId: "GetItem",
              },
              parameters: { id: "synthetic" },
              authentication: "@parameters('$authentication')",
            },
          },
        },
      },
    },
  };
}

test("prepares every OpenApiConnection for an XRM-backed save without mutating input", () => {
  const source = sourceDefinition();
  const prepared = preparePowerAutomateDefinition(source, connectionReferences) as typeof source;

  const createHost = prepared.actions.Create_Record.inputs.host;
  const nestedHost = prepared.actions.Condition.actions.Nested_Read.inputs.host;
  assert.equal(createHost.connectionName, "shared_commondataserviceforapps");
  assert.equal(createHost.connectionReferenceName, "prp_sharedcommondataserviceforapps_synthetic");
  assert.equal(nestedHost.connectionReferenceName, "prp_sharedcommondataserviceforapps_synthetic");
  assert.equal("authentication" in prepared.actions.Create_Record.inputs, false);
  assert.equal("authentication" in prepared.actions.Condition.actions.Nested_Read.inputs, false);
  assert.deepEqual(prepared.actions.Create_Record.inputs.parameters, source.actions.Create_Record.inputs.parameters);
  assert.equal(source.actions.Create_Record.inputs.host.connectionReferenceName, undefined);
  assert.equal("authentication" in source.actions.Create_Record.inputs, true);
});

test("fails closed when an OpenApiConnection alias has no declared logical reference", () => {
  const source = sourceDefinition();
  source.actions.Create_Record.inputs.host.connectionName = "missing_alias";

  assert.throws(
    () => preparePowerAutomateDefinition(source, connectionReferences),
    (error: unknown) => error instanceof FlowDefinitionPreparationError
      && error.code === "MISSING_CONNECTION_REFERENCE",
  );
});

test("fails closed when present branch containers are malformed", () => {
  const malformedBranches = [
    {
      name: "else without actions",
      mutate(source: ReturnType<typeof sourceDefinition>) {
        source.actions.Condition.else = {};
      },
      path: "/actions/Condition/else/actions",
    },
    {
      name: "default with non-object actions",
      mutate(source: ReturnType<typeof sourceDefinition>) {
        source.actions.Condition.default = { actions: "synthetic-invalid-actions" };
      },
      path: "/actions/Condition/default/actions",
    },
    {
      name: "case with non-object entry",
      mutate(source: ReturnType<typeof sourceDefinition>) {
        source.actions.Condition.cases = { BrokenCase: "synthetic-invalid-case" };
      },
      path: "/actions/Condition/cases/BrokenCase",
    },
  ] as const;

  for (const fixture of malformedBranches) {
    const source = sourceDefinition();
    fixture.mutate(source);
    assert.throws(
      () => preparePowerAutomateDefinition(source, connectionReferences),
      (error: unknown) => error instanceof FlowDefinitionPreparationError
        && error.code === "INVALID_DEFINITION"
        && error.path === fixture.path,
      fixture.name,
    );
  }
});
