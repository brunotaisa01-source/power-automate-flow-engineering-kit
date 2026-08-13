import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { validateArtifactCommand } from "../../../packages/cli/src/commands/validate-artifact.ts";
import { validateContractCommand } from "../../../packages/cli/src/commands/validate-contract.ts";
import { validateEvidenceCommand } from "../../../packages/cli/src/commands/validate-evidence.ts";
import { validateRulesCommand } from "../../../packages/cli/src/commands/validate-rules.ts";
import { scanPublicDataCommand } from "../../../packages/cli/src/commands/scan-public-data.ts";
import { createVerifyCommand } from "../../../packages/cli/src/commands/verify.ts";
import {
  createCommandReport,
  type CommandHandler,
} from "../../../packages/cli/src/parse-args.ts";

describe("CLI command shells", () => {
  test("fails closed when shipped validators receive incomplete local evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-cli-"));
    try {
      const artifactPath = join(root, "synthetic-package.zip");
      const contractPath = join(root, "project.contract.json");
      await writeFile(artifactPath, "synthetic package placeholder\n", "utf8");
      await writeFile(
        contractPath,
        JSON.stringify({
          schemaVersion: "1.0",
          packages: [{ profile: "power-platform-solution-v1" }],
        }),
        "utf8",
      );

      const cases = [
        {
          command: validateRulesCommand,
          args: ["validate", "rules", "--root", root],
        },
        {
          command: validateArtifactCommand,
          args: [
            "validate",
            "artifact",
            artifactPath,
            "--contract",
            contractPath,
          ],
        },
      ] as const;

      for (const fixture of cases) {
        const report = await fixture.command.run(fixture.args);
        assert.equal(report.exitCode, 1, report.command);
        assert.equal(report.result, "FAIL", report.command);
        assert.equal(report.summary.notRun, 0, report.command);
        assert.ok(report.diagnostics.length > 0, report.command);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reports unavailable requested local validators as non-successful NOT_RUN", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-cli-deferred-"));
    try {
      const evidencePath = join(root, "evidence.json");
      await writeFile(evidencePath, JSON.stringify({ schemaVersion: "1.0" }), "utf8");

      const cases = [
        {
          command: validateEvidenceCommand,
          args: ["evidence", "validate", evidencePath],
        },
        {
          command: scanPublicDataCommand,
          args: ["scan", "public-data", root],
        },
      ] as const;

      for (const fixture of cases) {
        const report = await fixture.command.run(fixture.args);
        assert.equal(report.exitCode, 8, report.command);
        assert.equal(report.result, "FAIL", report.command);
        assert.equal(report.summary.notRun, 1, report.command);
        assert.equal(report.diagnostics[0]?.code, "CLI_VALIDATOR_NOT_RUN", report.command);
        assert.notEqual(report.diagnostics[0]?.residualGate, undefined, report.command);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("classifies malformed, invalid, and unsupported contract inputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-cli-contract-"));
    try {
      const malformed = join(root, "malformed.json");
      const invalid = join(root, "invalid.json");
      const unsupported = join(root, "unsupported.json");
      await writeFile(malformed, "{", "utf8");
      await writeFile(invalid, JSON.stringify({ schemaVersion: "1.0" }), "utf8");
      await writeFile(unsupported, JSON.stringify({ schemaVersion: "2.0" }), "utf8");

      const cases = [
        { path: join(root, "missing.json"), exitCode: 2 },
        { path: malformed, exitCode: 2 },
        { path: invalid, exitCode: 1 },
        { path: unsupported, exitCode: 3 },
      ] as const;

      for (const fixture of cases) {
        const report = await validateContractCommand.run([
          "validate",
          "contract",
          fixture.path,
        ]);
        assert.equal(report.exitCode, fixture.exitCode, fixture.path);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects an unsupported artifact profile before adapter execution", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-cli-profile-"));
    try {
      const artifactPath = join(root, "synthetic-package.zip");
      const contractPath = join(root, "project.contract.json");
      await writeFile(artifactPath, "synthetic package placeholder\n", "utf8");
      await writeFile(
        contractPath,
        JSON.stringify({ schemaVersion: "1.0", packages: [{ profile: "unknown-profile" }] }),
        "utf8",
      );

      const report = await validateArtifactCommand.run([
        "validate",
        "artifact",
        artifactPath,
        "--contract",
        contractPath,
      ]);
      assert.equal(report.exitCode, 3);
      assert.equal(report.diagnostics[0]?.code, "CLI_PROFILE_UNSUPPORTED");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("orchestrates local steps then the public-data gate in fixed offline order", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-cli-verify-"));
    try {
      await mkdir(root, { recursive: true });
      const calls: string[] = [];
      const step: CommandHandler = {
        async run() {
          calls.push("local");
          return createCommandReport("synthetic step", []);
        },
      };
      const scanner: CommandHandler = {
        async run(args) {
          calls.push("public-data");
          assert.deepEqual(args, ["scan", "public-data", root, "--history"]);
          return createCommandReport("scan public-data", []);
        },
      };
      const command = createVerifyCommand([step, step], scanner);

      const report = await command.run(["verify", "--root", root, "--offline"]);

      assert.deepEqual(calls, ["local", "local", "public-data"]);
      assert.equal(report.exitCode, 0);
      assert.equal(report.result, "PASS");
      assert.ok(report.summary.notRun > 0);
      assert.ok(report.diagnostics.every(({ residualGate }) => residualGate !== undefined));
      assert.ok(report.diagnostics.every(({ code }) => code.endsWith("_NOT_RUN")));
      assert.ok(report.diagnostics.some(({ code, residualGate }) =>
        code === "HTTP_SEMANTIC_001_LIVE_SMOKE_NOT_RUN"
        && residualGate === "rule:HTTP-SEMANTIC-001:LIVE_SMOKE"
      ));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("preserves unavailable public-data validation as non-successful NOT_RUN", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-cli-verify-deferred-"));
    try {
      const localStep: CommandHandler = {
        async run() {
          return createCommandReport("synthetic local step", []);
        },
      };
      const command = createVerifyCommand([localStep], scanPublicDataCommand);

      const report = await command.run(["verify", "--root", root, "--offline"]);

      assert.equal(report.exitCode, 8);
      assert.equal(report.result, "FAIL");
      assert.equal(report.summary.notRun, 9);
      assert.ok(report.diagnostics.some(({ code, residualGate }) =>
        code === "CLI_VALIDATOR_NOT_RUN" && residualGate === "public-data-scanner"
      ));
      assert.equal(report.diagnostics.some(({ code }) =>
        code === "PUBLIC_DATA_SCANNER_PASS"
      ), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
