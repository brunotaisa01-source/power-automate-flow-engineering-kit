import assert from "node:assert/strict";
import { test } from "node:test";

import { assessRuntimeBinding } from "../../../packages/core/src/runtime-binding.ts";

test("RED: a Connected physical connection does not prove the installed logical binding", () => {
  const result = assessRuntimeBinding({
    physicalConnectionStatus: "Connected",
    currentConnection: { logicalName: "shared_example", physicalName: "connection_current" },
    installedConnection: { logicalName: "shared_example", physicalName: "connection_installed" },
    registeredDataSourceAlias: "flow_alias_full",
    generatedDataSourceAlias: "flow_alias_short",
  });

  assert.equal(result.result, "FAIL");
  assert.deepEqual(result.diagnostics, [
    "RUNTIME-CONNECTION-REFERENCE-MISMATCH",
    "RUNTIME-DATASOURCE-ALIAS-MISMATCH",
  ]);
});
