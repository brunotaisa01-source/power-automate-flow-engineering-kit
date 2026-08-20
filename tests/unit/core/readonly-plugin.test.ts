import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, test } from "node:test";

import { FORBIDDEN_PLUGIN_OPERATIONS, READONLY_PLUGIN_MANIFEST, runReadonlyPlugin } from "../../../packages/core/src/readonly-plugin.ts";

const ROOT = process.cwd();

describe("read-only plugin boundary", () => {
  test("manifest is schema-valid, offline, synthetic, and mutation-free", async () => {
    const schema = JSON.parse(await readFile(resolve(process.cwd(), "contracts/read-only-plugin.schema.json"), "utf8"));
    const manifestFile = JSON.parse(await readFile(resolve(process.cwd(), "plugins/sharepoint-flow-engineering-kit-readonly/manifest.json"), "utf8"));
    const validate = new Ajv2020({ allErrors: true, strict: true, validateFormats: false }).compile(schema);
    assert.equal(validate(manifestFile), true, JSON.stringify(validate.errors));
    const manifest = await runReadonlyPlugin(ROOT, { operation: "getManifest" });
    assert.deepEqual(manifest, READONLY_PLUGIN_MANIFEST);
    assert.equal(READONLY_PLUGIN_MANIFEST.networkMode, "offline");
    assert.equal(READONLY_PLUGIN_MANIFEST.tenantMutation, false);
    assert.ok(FORBIDDEN_PLUGIN_OPERATIONS.includes("mutate"));
  });

  test("synthetic discovery and preflight are read-only and connector-scoped", async () => {
    const discovery = await runReadonlyPlugin(ROOT, { operation: "discover", connector: "excel" }) as Record<string, unknown>;
    assert.equal(discovery.claimClass, "RUNTIME_SYNTHETIC");
    assert.equal(discovery.tenantRuntime, false);
    assert.equal((discovery.flows as unknown[]).length, 1);
    const preflight = await runReadonlyPlugin(ROOT, { operation: "preflight" }) as Record<string, unknown>;
    assert.equal(preflight.networkMode, "offline");
    assert.equal(preflight.flowCount, 9);
    assert.equal((preflight.profiles as Array<Record<string, unknown>>).every((item) => item.valid === true), true);
  });

  test("candidate status is readable and approved lesson consumption fails closed", async () => {
    const candidates = await runReadonlyPlugin(ROOT, { operation: "listCandidateStatus" }) as Array<Record<string, unknown>>;
    assert.ok(candidates.some((candidate) => candidate.status === "CANDIDATE"));
    await assert.rejects(runReadonlyPlugin(ROOT, { operation: "listApprovedLessons" }), /READONLY_PLUGIN_REGISTRY_NOT_CONSUMABLE/);
  });

  test("all forbidden operations are rejected", async () => {
    for (const operation of FORBIDDEN_PLUGIN_OPERATIONS) await assert.rejects(runReadonlyPlugin(ROOT, { operation }), /READONLY_PLUGIN_FORBIDDEN_OPERATION/);
  });
});
