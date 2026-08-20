import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCheckCommands } from "../../scripts/portable-check.mjs";

test("portable check exposes platform-neutral argument arrays for every required gate", () => {
  const commands = buildCheckCommands(process.cwd());
  const labels = new Set(commands.map((command) => command.label));

  assert.ok(labels.has("build"));
  assert.ok(labels.has("test"));
  assert.ok(labels.has("validate contract"));
  assert.ok(labels.has("validate rules"));
  assert.ok(labels.has("validate artifact"));
  assert.ok(labels.has("npm audit"));
  assert.ok(commands.every((command) => command.shell === false));
  assert.ok(commands.every((command) => !command.args.some((arg) => /&&|\|/.test(arg))));
});
