import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
  const nodeCommands = commands.filter((command) => command.executable === process.execPath);
  assert.ok(nodeCommands.every((command) => command.shell === false));
  assert.ok(commands.every((command) => typeof command.shell === "boolean"));
  assert.ok(commands.every((command) => !command.args.some((arg) => /&&|\|/.test(arg))));
});

test("portable check uses the Windows command shell only for npm.cmd", () => {
  const commands = buildCheckCommands(process.cwd(), "win32");
  const npmCommands = commands.filter((command) => command.executable === "npm.cmd");
  const nodeCommands = commands.filter((command) => command.executable === process.execPath);

  assert.ok(npmCommands.length > 0);
  assert.ok(npmCommands.every((command) => command.shell === true));
  assert.ok(nodeCommands.every((command) => command.shell === false));
});

test("npm test uses the complete shell-neutral test inventory", async () => {
  const root = process.cwd();
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const runnerPath = join(root, "scripts", "test-all.mjs");

  assert.equal(packageJson.scripts?.test, "node scripts/test-all.mjs");
  assert.equal(existsSync(runnerPath), true);
  const runnerSource = readFileSync(runnerPath, "utf8");
  assert.match(runnerSource, /\.test\.ts/);
  assert.match(runnerSource, /\.test\.mjs/);

  const { buildTestCommand, discoverTestFiles } = await import("../../scripts/test-all.mjs");
  const discovered = discoverTestFiles(root);
  const portableTest = buildCheckCommands(root).find((command) => command.label === "test");

  assert.ok(portableTest);
  assert.deepEqual(portableTest.args.slice(2), discovered);
  assert.ok(discovered.some((file) => file.endsWith(".test.ts")));
  assert.ok(discovered.some((file) => file.endsWith(".test.mjs")));
  assert.ok(discovered.some((file) => file.endsWith("tests/unit/portable-check.test.mjs")));
  assert.deepEqual(buildTestCommand(root).args, ["--experimental-strip-types", "--test", ...discovered]);
});
