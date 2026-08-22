import assert from "node:assert/strict";
import { test } from "node:test";

import { assessRuntimeBinding } from "../../../packages/core/src/runtime-binding.ts";

test("GREEN: matching current and installed references plus the full alias pass", () => {
  const result = assessRuntimeBinding({
    physicalConnectionStatus: "Connected",
    currentConnection: { logicalName: "shared_example", physicalName: "connection_example" },
    installedConnection: { logicalName: "shared_example", physicalName: "connection_example" },
    registeredDataSourceAlias: "flow_alias_full",
    generatedDataSourceAlias: "flow_alias_full",
  });

  assert.equal(result.result, "PASS");
  assert.deepEqual(result.diagnostics, []);
});
