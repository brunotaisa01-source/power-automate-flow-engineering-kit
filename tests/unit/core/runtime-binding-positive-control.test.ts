import assert from "node:assert/strict";
import { test } from "node:test";

import { assessRuntimeBinding } from "../../../packages/core/src/runtime-binding.ts";

test("positive control: an independent valid connector binding remains GREEN", () => {
  const result = assessRuntimeBinding({
    physicalConnectionStatus: "Connected",
    currentConnection: { logicalName: "connector_other", physicalName: "connection_other" },
    installedConnection: { logicalName: "connector_other", physicalName: "connection_other" },
    registeredDataSourceAlias: "another_flow_alias",
    generatedDataSourceAlias: "another_flow_alias",
  });

  assert.equal(result.result, "PASS");
  assert.deepEqual(result.diagnostics, []);
});
