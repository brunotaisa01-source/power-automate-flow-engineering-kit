import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { auditLearningRegistry, allowedLearningTransition, captureLearningCandidate, promoteLearningCandidate } from "../../../packages/core/src/self-improvement.ts";
import { learnAuditCommand } from "../../../packages/cli/src/commands/learn.ts";

describe("global self-improvement registry", () => {
  test("the canonical registry is consumable only after every candidate is promoted", async () => {
    const root = process.cwd();
    const result = await auditLearningRegistry(root, join(root, "knowledge/self-improvement/registry.json"));
    assert.equal(result.diagnostics.some(({ code }) => code === "SELF_LEARNING_CANDIDATE_OPEN"), false);
    assert.ok(result.approvedLessons?.some((lesson) => lesson.id === "runtime-binding-authority"));
  });

  test("an approved connector-neutral lesson with independent controls is GREEN", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-learning-green-"));
    try {
      await mkdir(join(root, "knowledge/self-improvement"), { recursive: true });
      await mkdir(join(root, "tests"), { recursive: true });
      await mkdir(join(root, "docs"), { recursive: true });
      const testPrefix = "import { test } from \"node:test\";\n";
      await writeFile(join(root, "tests/red.test.ts"), testPrefix + "test(\"red counterexample\", () => {});\n", "utf8");
      await writeFile(join(root, "tests/green.test.ts"), testPrefix + "test(\"green behavior\", () => {});\n", "utf8");
      await writeFile(join(root, "tests/positive.test.ts"), testPrefix + "test(\"independent positive control\", () => {});\n", "utf8");
      await writeFile(join(root, "docs/review.md"), "Decision: APPROVED\nReviewer role: independent-luna-max-reviewer\nReview evidence: RED/GREEN/positive-control tests; local synthetic only.\n", "utf8");
      await writeFile(join(root, "docs/source.md"), "WP-17 source record\n", "utf8");
      const registryPath = join(root, "knowledge/self-improvement/registry.json");
      const registryValue = {
        schemaVersion: "1.0",
        registryId: "sharepoint-flow-engineering-kit-global",
        revision: 1,
        lessons: [{
          id: "connector-status-readback",
          version: 1,
          status: "APPROVED",
          scope: ["power-automate", "excel", "power-apps", "connectors"],
          trigger: { kind: "runtime-counterexample", summary: "A connector body was accepted before its failed status was classified." },
          invariant: "Every connector checks status before parsing and requires semantic readback.",
          red: { path: "tests/red.test.ts", testName: "red counterexample", runner: "node-test", expectedExitCode: 0 },
          green: { path: "tests/green.test.ts", testName: "green behavior", runner: "node-test", expectedExitCode: 0 },
          positiveControl: { path: "tests/positive.test.ts", testName: "independent positive control", runner: "node-test", expectedExitCode: 0 },
          claimBoundary: "RUNTIME_SYNTHETIC",
          provenance: { workPackage: "WP-17", recordPath: "docs/source.md" },
          review: { decision: "APPROVED", recordPath: "docs/review.md", reviewerRole: "independent-luna-max-reviewer" },
          privacy: "synthetic-public",
          lifecycle: { current: "APPROVED", history: [{ status: "CANDIDATE", recordPath: "docs/source.md" }, { status: "APPROVED", recordPath: "docs/review.md" }] },
        }],
      };
      const registryText = JSON.stringify(registryValue);
      await writeFile(registryPath, registryText, "utf8");
      await writeFile(join(root, "knowledge/self-improvement/registry.sha256"), createHash("sha256").update(registryText, "utf8").digest("hex") + "\n", "utf8");
      const result = await auditLearningRegistry(root, registryPath, { executeBindings: true });
      assert.deepEqual(result.diagnostics, []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("lifecycle transitions are explicit and fail closed", () => {
    assert.equal(allowedLearningTransition("CANDIDATE", "BLOCKED"), true);
    assert.equal(allowedLearningTransition("BLOCKED", "CANDIDATE"), true);
    assert.equal(allowedLearningTransition("BLOCKED", "APPROVED"), true);
    assert.equal(allowedLearningTransition("APPROVED", "RETIRED"), true);
    assert.equal(allowedLearningTransition("CANDIDATE", "RETIRED"), false);
    assert.equal(allowedLearningTransition("RETIRED", "APPROVED"), false);
  });

  test("capture and promotion are local, reviewed, and digest-bound", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-learning-promote-"));
    try {
      await mkdir(join(root, "knowledge/self-improvement/candidates"), { recursive: true });
      await mkdir(join(root, "tests"), { recursive: true });
      await mkdir(join(root, "docs"), { recursive: true });
      const testText = "import { test } from \"node:test\"; test(\"bound control\", () => {});\n";
      await writeFile(join(root, "tests/red.test.ts"), testText, "utf8");
      await writeFile(join(root, "tests/green.test.ts"), testText.replaceAll("bound control", "green control"), "utf8");
      await writeFile(join(root, "tests/positive.test.ts"), testText.replaceAll("bound control", "positive control"), "utf8");
      await writeFile(join(root, "docs/source.md"), "WP-17 source\n", "utf8");
      await writeFile(join(root, "docs/approved.md"), "Decision: APPROVED\nReviewer role: independent-luna-max-reviewer\nReview evidence: RED/GREEN/positive-control tests; local synthetic only.\n", "utf8");
      const candidatePath = join(root, "knowledge/self-improvement/candidates/status-readback.json");
      const candidate = {
        id: "status-readback", version: 1, status: "CANDIDATE", scope: ["power-automate", "excel", "connectors"],
        trigger: { kind: "red-test", summary: "A failed connector response was trusted." },
        invariant: "Check status before body and require semantic readback.",
        red: { path: "tests/red.test.ts", testName: "bound control", runner: "node-test", expectedExitCode: 0 },
        green: { path: "tests/green.test.ts", testName: "green control", runner: "node-test", expectedExitCode: 0 },
        positiveControl: { path: "tests/positive.test.ts", testName: "positive control", runner: "node-test", expectedExitCode: 0 },
        claimBoundary: "RUNTIME_SYNTHETIC", provenance: { workPackage: "WP-17", recordPath: "docs/source.md" },
        review: { decision: "PENDING", recordPath: "docs/approved.md", reviewerRole: "pending" }, privacy: "synthetic-public",
        lifecycle: { current: "CANDIDATE", history: [{ status: "CANDIDATE", recordPath: "docs/source.md" }] },
      };
      await captureLearningCandidate(root, candidatePath, candidate);
      assert.equal(JSON.parse(await readFile(candidatePath, "utf8")).status, "CANDIDATE");
      const registryPath = join(root, "knowledge/self-improvement/registry.json");
      const registryText = JSON.stringify({ schemaVersion: "1.0", registryId: "sharepoint-flow-engineering-kit-global", revision: 1, lessons: [] });
      await writeFile(registryPath, registryText, "utf8");
      await writeFile(join(root, "knowledge/self-improvement/registry.sha256"), createHash("sha256").update(registryText, "utf8").digest("hex") + "\n", "utf8");
      await promoteLearningCandidate(root, candidatePath, "docs/approved.md", "independent-luna-max-reviewer");
      const audit = await auditLearningRegistry(root, registryPath, { executeBindings: true });
      assert.deepEqual(audit.diagnostics, []);
      assert.equal(JSON.parse(await readFile(candidatePath, "utf8")).status, "APPROVED");
      assert.equal(JSON.parse(await readFile(registryPath, "utf8")).lessons.length, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("digest, schema, and privacy tampering remain RED", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-learning-tamper-"));
    try {
      await mkdir(join(root, "knowledge/self-improvement"), { recursive: true });
      const registryPath = join(root, "knowledge/self-improvement/registry.json");
      const validText = JSON.stringify({ schemaVersion: "1.0", registryId: "sharepoint-flow-engineering-kit-global", revision: 1, lessons: [] });
      await writeFile(registryPath, validText, "utf8");
      const digestPath = join(root, "knowledge/self-improvement/registry.sha256");
      await writeFile(digestPath, createHash("sha256").update(validText, "utf8").digest("hex") + "\n", "utf8");
      await writeFile(digestPath, "0".repeat(64) + "\n", "utf8");
      const digestResult = await auditLearningRegistry(root, registryPath);
      assert.ok(digestResult.diagnostics.some(({ code }) => code === "SELF_LEARNING_DIGEST_MISMATCH"));
      const unknownText = JSON.stringify({ schemaVersion: "1.0", registryId: "sharepoint-flow-engineering-kit-global", revision: 1, lessons: [], unknown: true });
      await writeFile(registryPath, unknownText, "utf8");
      await writeFile(digestPath, createHash("sha256").update(unknownText, "utf8").digest("hex") + "\n", "utf8");
      const schemaResult = await auditLearningRegistry(root, registryPath);
      assert.ok(schemaResult.diagnostics.some(({ code }) => code === "SELF_LEARNING_SCHEMA_INVALID"));
      await assert.rejects(captureLearningCandidate(root, join(root, "knowledge/self-improvement/candidates/private.json"), { status: "CANDIDATE", privacy: "synthetic-public", value: "https://real.invalid/private" }));
      await assert.rejects(captureLearningCandidate(root, join(root, "knowledge/self-improvement/candidates/encoded.json"), { status: "CANDIDATE", privacy: "synthetic-public", value: "https%3A%2F%2Freal.invalid%2Fprivate" }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("the CLI exposes the fully promoted registry as a successful audit", async () => {
    const report = await learnAuditCommand.run([
      "learn",
      "audit",
      join(process.cwd(), "knowledge/self-improvement/registry.json"),
    ]);
    assert.equal(report.exitCode, 0);
    assert.equal(report.result, "PASS");
    assert.equal(report.diagnostics.some(({ code }) => code === "SELF_LEARNING_CANDIDATE_OPEN"), false);
  });
});
