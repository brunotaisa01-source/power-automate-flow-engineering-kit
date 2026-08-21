import { access, writeFile } from "node:fs/promises";

try {
  await access(".workspace-run-marker.request");
  await writeFile(".workspace-run-marker.ran", "ran\n", "utf8");
} catch {
  // The marker is used only by the compiled-CLI registry-gate integration test.
}

console.log("SYNTHETIC_WORKSPACE_GREEN_A");
