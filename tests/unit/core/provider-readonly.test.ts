import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, test } from "node:test";

import {
  validateReadonlyProviderSnapshot,
  type ReadonlyProviderSnapshot,
} from "../../../packages/core/src/provider-readonly.ts";

const ROOT = process.cwd();

function syntheticSnapshot(): ReadonlyProviderSnapshot {
  return {
    schemaVersion: "1.0",
    claimClass: "LOCAL_SYNTHETIC",
    identityCorrelation: "synthetic-correlation-001",
    adapter: {
      id: "spflow.provider-readonly",
      mode: "read-only",
      networkMode: "offline",
      tenantMutation: false,
    },
    environment: {
      id: "synthetic-environment-001",
      displayName: "Synthetic Environment",
      identityCorrelation: "synthetic-correlation-001",
    },
    solution: {
      id: "synthetic-solution-001",
      uniqueName: "synthetic_solution",
      displayName: "Synthetic Solution",
      version: "1.0.0",
      identityCorrelation: "synthetic-correlation-001",
      state: "present",
    },
    flows: [
      {
        id: "synthetic-flow-001",
        displayName: "Synthetic Read Flow",
        state: "present",
        identityCorrelation: "synthetic-correlation-001",
        connectionReferenceIds: ["synthetic-connection-reference-001"],
      },
    ],
    connectionReferences: [
      {
        id: "synthetic-connection-reference-001",
        displayName: "Synthetic Dataverse Connection",
        connector: "dataverse",
        state: "resolved",
        identityCorrelation: "synthetic-correlation-001",
        matchCount: 1,
        flowIds: ["synthetic-flow-001"],
      },
    ],
    capabilities: {
      mode: "read-only",
      networkMode: "offline",
      tenantMutation: false,
      operations: [
        "read-environment",
        "read-solution",
        "read-flow",
        "read-connection-reference",
      ],
      forbiddenOperations: [
        "import",
        "rebind",
        "publish",
        "enable",
        "trigger",
        "update",
        "delete",
      ],
    },
    evidence: {
      local: { claimClass: "LOCAL_SYNTHETIC", status: "PASS" },
      provider: { claimClass: "PROVIDER", status: "NOT_VERIFIED" },
      uat: { claimClass: "UAT", status: "NOT_VERIFIED" },
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("readonly provider snapshot validator", () => {
  test("accepts a complete offline read-only snapshot without mutating it", () => {
    const snapshot = syntheticSnapshot();
    const before = clone(snapshot);

    const result = validateReadonlyProviderSnapshot(snapshot);

    assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
    assert.deepEqual(snapshot, before);
    assert.deepEqual(result, validateReadonlyProviderSnapshot(snapshot));
  });

  test("rejects mutation capabilities and verbs", () => {
    const snapshot = syntheticSnapshot() as Record<string, unknown>;
    const capabilities = snapshot.capabilities as Record<string, unknown>;
    capabilities.tenantMutation = true;
    capabilities.operations = ["read-environment", "update"];

    const result = validateReadonlyProviderSnapshot(snapshot);

    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.some(({ code }) => code === "READONLY_PROVIDER_MUTATION_CAPABILITY"));
  });

  test("rejects missing or mismatched identity correlation", () => {
    const missing = syntheticSnapshot() as Record<string, unknown>;
    delete (missing.environment as Record<string, unknown>).identityCorrelation;
    const mismatch = syntheticSnapshot() as Record<string, unknown>;
    (mismatch.solution as Record<string, unknown>).identityCorrelation = "synthetic-correlation-other";

    for (const candidate of [missing, mismatch]) {
      const result = validateReadonlyProviderSnapshot(candidate);
      assert.equal(result.valid, false);
      assert.ok(result.diagnostics.some(({ code }) => code === "READONLY_PROVIDER_IDENTITY_CORRELATION"));
    }
  });

  test("rejects ambiguous connection references", () => {
    const snapshot = syntheticSnapshot() as Record<string, unknown>;
    const references = snapshot.connectionReferences as Array<Record<string, unknown>>;
    references[0]!.matchCount = 2;
    references[0]!.state = "ambiguous";

    const result = validateReadonlyProviderSnapshot(snapshot);

    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.some(({ code }) => code === "READONLY_PROVIDER_CONNECTION_REFERENCE_AMBIGUOUS"));
  });

  test("requires authoritative readback for provider and UAT PASS claims", () => {
    const snapshot = syntheticSnapshot() as Record<string, unknown>;
    (snapshot.evidence as Record<string, unknown>).provider = {
      claimClass: "PROVIDER",
      status: "PASS",
    };
    (snapshot.evidence as Record<string, unknown>).uat = {
      claimClass: "UAT",
      status: "PASS",
    };

    const result = validateReadonlyProviderSnapshot(snapshot);

    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.filter(({ code }) => code === "READONLY_PROVIDER_READBACK_REQUIRED").length >= 2);
  });

  test("requires the readback authority to match the claimed evidence class", () => {
    const snapshot = syntheticSnapshot() as Record<string, unknown>;
    snapshot.claimClass = "PROVIDER_READBACK";
    (snapshot.evidence as Record<string, unknown>).provider = {
      claimClass: "PROVIDER",
      status: "PASS",
      authoritativeReadback: {
        authority: "uat",
        status: "PASS",
        identityCorrelation: "synthetic-correlation-001",
        observedFields: ["environment", "solution", "flows", "connectionReferences"],
      },
    };

    const result = validateReadonlyProviderSnapshot(snapshot);

    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.some(({ code }) => code === "READONLY_PROVIDER_READBACK_REQUIRED"));
  });

  test("keeps local synthetic evidence distinct from provider and UAT evidence", () => {
    const snapshot = syntheticSnapshot() as Record<string, unknown>;
    const evidence = snapshot.evidence as Record<string, unknown>;
    evidence.local = { claimClass: "PROVIDER", status: "PASS" };

    const result = validateReadonlyProviderSnapshot(snapshot);

    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.some(({ code }) => code === "READONLY_PROVIDER_EVIDENCE_BOUNDARY"));
  });

  test("fails closed on unknown keys and secret-like values", () => {
    const unknown = syntheticSnapshot() as Record<string, unknown>;
    unknown.rawProviderPayload = { value: "forbidden" };
    const secret = syntheticSnapshot() as Record<string, unknown>;
    (secret.environment as Record<string, unknown>).displayName = "Bearer synthetic-secret-value";

    for (const candidate of [unknown, secret]) {
      const result = validateReadonlyProviderSnapshot(candidate);
      assert.equal(result.valid, false);
      assert.ok(result.diagnostics.some(({ code }) => code === "READONLY_PROVIDER_SCHEMA_INVALID" || code === "READONLY_PROVIDER_SECRET_VALUE"));
    }
  });

  test("returns invalid for cyclic, unsupported, and hostile runtime values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const hostile = new Proxy({}, {
      getPrototypeOf() {
        throw new Error("synthetic accessor failure");
      },
    });

    for (const candidate of [cyclic, 1n, hostile]) {
      assert.doesNotThrow(() => {
        const result = validateReadonlyProviderSnapshot(candidate);
        assert.equal(result.valid, false);
      });
    }
  });

  test("accepts a structurally different positive-control topology", () => {
    const snapshot = syntheticSnapshot();
    const positive = clone(snapshot);
    positive.flows = [{
      id: "synthetic-flow-002",
      displayName: "Synthetic Branch Read Flow",
      state: "disabled",
      identityCorrelation: positive.identityCorrelation,
      connectionReferenceIds: ["synthetic-connection-reference-002"],
    }];
    positive.connectionReferences = [{
      id: "synthetic-connection-reference-002",
      displayName: "Synthetic SharePoint Connection",
      connector: "sharepoint",
      state: "resolved",
      identityCorrelation: positive.identityCorrelation,
      matchCount: 1,
      flowIds: ["synthetic-flow-002"],
    }];

    const result = validateReadonlyProviderSnapshot(positive);

    assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  });

  test("validates the checked-in JSON contract with the same strict schema", async () => {
    const schema = JSON.parse(await readFile(resolve(ROOT, "contracts/provider-readonly.schema.json"), "utf8")) as object;
    const fixture = JSON.parse(await readFile(resolve(ROOT, "fixtures/provider-readonly/synthetic-readback.json"), "utf8")) as unknown;
    const validate = new Ajv2020({ allErrors: true, strict: true, validateFormats: false }).compile(schema);

    assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
    assert.equal(validateReadonlyProviderSnapshot(fixture).valid, true);
  });
});
