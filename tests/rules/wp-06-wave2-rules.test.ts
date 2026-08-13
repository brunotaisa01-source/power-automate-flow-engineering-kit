import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";
import {
  ruleRegistry,
  type ArtifactGraphInput,
  type ValidationContext,
} from "../../packages/rules/src/registry.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const RULE_IDS = [
  "APP-PAGINATION-001",
  "APP-SAVE-001",
  "HTTP-SEMANTIC-001",
  "HTTP-SEMANTIC-002",
  "SP-ACL-001",
  "SP-ACL-002",
  "SP-AUTHZ-001",
  "SP-AUTHZ-002",
  "SP-INDEX-001",
  "SP-INDEX-002",
  "SP-ODATA-001",
  "SP-SCHEMA-001",
  "SP-SCHEMA-002",
  "SP-SCHEMA-003",
] as const;

interface ExpectedDiagnostic {
  readonly code: string;
  readonly artifactPath: string;
  readonly messageContains: string;
}

interface ExpectedFixture {
  readonly schemaVersion: "1.0";
  readonly ruleId: string;
  readonly red: {
    readonly result: "FAIL";
    readonly diagnostics: readonly ExpectedDiagnostic[];
  };
  readonly green: { readonly result: "PASS"; readonly diagnostics: readonly [] };
  readonly positiveControl: { readonly result: "PASS"; readonly diagnostics: readonly [] };
  readonly mutation: {
    readonly source: "green";
    readonly recipe: string;
    readonly result: "FAIL";
    readonly diagnosticCode: string;
  };
}

interface MutationOperation {
  readonly op: "json-set" | "json-delete";
  readonly path: "graph.json";
  readonly pointer: string;
  readonly value?: unknown;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pointerSegments(pointer: string): string[] {
  assert.match(pointer, /^\/(?:[^/]+)(?:\/[^/]+)*$/);
  return pointer.slice(1).split("/").map((segment) =>
    segment.replaceAll("~1", "/").replaceAll("~0", "~")
  );
}

function applyMutation(graph: unknown, mutation: MutationOperation): ArtifactGraphInput {
  assert.equal(mutation.path, "graph.json");
  const result = structuredClone(graph);
  let current: unknown = result;
  const segments = pointerSegments(mutation.pointer);
  for (const segment of segments.slice(0, -1)) {
    assert.ok(isRecord(current) || Array.isArray(current));
    current = Array.isArray(current)
      ? current[Number(segment)]
      : current[segment];
  }
  assert.ok(isRecord(current) || Array.isArray(current));
  const key = segments.at(-1)!;
  if (mutation.op === "json-set") {
    assert.ok(Object.hasOwn(mutation, "value"));
    if (Array.isArray(current)) current[Number(key)] = mutation.value;
    else current[key] = mutation.value;
  } else if (Array.isArray(current)) {
    current.splice(Number(key), 1);
  } else {
    delete current[key];
  }
  return result as ArtifactGraphInput;
}

const IDENTITY_KEYS = new Set([
  "digest",
  "fixtureProfile",
  "id",
  "relativePath",
  "sourceProfile",
]);

function semanticStructure(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticStructure);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !IDENTITY_KEYS.has(key))
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, item]) => [key, semanticStructure(item)]),
    );
  }
  return value;
}

function projectContract(): ProjectContract {
  return {
    schemaVersion: "1.0",
    project: {
      id: "synthetic-wp06",
      displayName: "Synthetic WP-06",
      description: "Public synthetic Wave-2 fixture contract.",
      contractRevision: 2,
      dataClassification: "synthetic-public",
    },
    runtime: {
      node: ">=22.0.0 <23.0.0",
      npm: ">=10.0.0 <11.0.0",
      moduleFormat: "esm",
      locale: "en",
      timeZone: "UTC",
      networkDuringOfflineVerify: "forbidden",
    },
    environmentBindings: [{
      key: "SYNTHETIC_SITE",
      kind: "site-url",
      requiredFor: ["generate"],
      sensitive: false,
      example: "https://synthetic.example.test/sites/work",
    }],
    sharePoint: {
      siteUrlBinding: "SYNTHETIC_SITE",
      lists: [
        {
          id: "protected-items",
          titleBinding: "PROTECTED_ITEMS",
          role: "protected-domain",
          writeModel: "direct-patch",
          readAllowlist: ["ID", "Title", "Amount", "ScopeKey"],
          createAllowlist: [],
          patchAllowlist: ["Title"],
          fields: [
            {
              logicalName: "title",
              internalName: "Title",
              type: "Text",
              required: true,
              indexed: true,
              unique: false,
              clientEditable: true,
              serverAuthoritative: false,
              immutableAfterCreate: false,
              sensitive: false,
              maxLength: 255,
            },
            {
              logicalName: "amount",
              internalName: "Amount",
              type: "Currency",
              required: true,
              indexed: false,
              unique: false,
              clientEditable: false,
              serverAuthoritative: true,
              immutableAfterCreate: false,
              sensitive: false,
            },
            {
              logicalName: "scope-key",
              internalName: "ScopeKey",
              type: "Text",
              required: true,
              indexed: true,
              unique: false,
              clientEditable: false,
              serverAuthoritative: true,
              immutableAfterCreate: true,
              sensitive: false,
              maxLength: 64,
            },
          ],
          indexes: [
            { field: "Title", order: 1, required: true },
            { field: "ScopeKey", order: 2, required: true },
          ],
          permissions: {
            inheritance: "break-clear",
            minimumRoles: [
              { principalBinding: "READERS", role: "read", allowedOperations: ["read"] },
              {
                principalBinding: "PROCESSOR",
                role: "processor",
                allowedOperations: ["read", "update"],
              },
            ],
            directUserGrants: "forbidden",
            effectivePermissionReadback: "required",
          },
          views: [],
        },
        {
          id: "command-queue",
          titleBinding: "COMMAND_QUEUE",
          role: "command-queue",
          writeModel: "append-command",
          readAllowlist: ["ID", "Status"],
          createAllowlist: ["CommandType", "TargetItemId", "TargetEtag"],
          patchAllowlist: [],
          fields: [],
          indexes: [],
          permissions: {
            inheritance: "break-clear",
            minimumRoles: [
              {
                principalBinding: "BROWSERS",
                role: "contribute-limited",
                allowedOperations: ["read", "create"],
              },
              {
                principalBinding: "PROCESSOR",
                role: "processor",
                allowedOperations: ["read", "update"],
              },
            ],
            directUserGrants: "forbidden",
            effectivePermissionReadback: "required",
          },
          views: [],
        },
        {
          id: "audit-log",
          titleBinding: "AUDIT_LOG",
          role: "audit",
          writeModel: "append-only",
          readAllowlist: ["ID"],
          createAllowlist: [],
          patchAllowlist: [],
          fields: [],
          indexes: [],
          permissions: {
            inheritance: "break-clear",
            minimumRoles: [
              { principalBinding: "PROCESSOR", role: "processor", allowedOperations: ["create"] },
              { principalBinding: "REVIEWERS", role: "audit-read", allowedOperations: ["read"] },
            ],
            directUserGrants: "forbidden",
            effectivePermissionReadback: "required",
          },
          views: [],
        },
        {
          id: "access-control",
          titleBinding: "ACCESS_CONTROL",
          role: "access-control",
          writeModel: "server-only",
          readAllowlist: [],
          createAllowlist: [],
          patchAllowlist: [],
          fields: [],
          indexes: [],
          permissions: {
            inheritance: "break-clear",
            minimumRoles: [
              { principalBinding: "PROCESSOR", role: "processor", allowedOperations: ["read"] },
            ],
            directUserGrants: "forbidden",
            effectivePermissionReadback: "required",
          },
          views: [],
        },
      ],
    },
    stateMachines: [{
      id: "item-state",
      listId: "protected-items",
      field: "Status",
      initial: "Pending",
      terminal: ["Applied"],
      states: ["Pending", "Applied"],
      transitions: [{
        id: "apply-transition",
        from: ["Pending"],
        to: "Applied",
        commandType: "apply-change",
        requiredCapability: "approve-items",
        serverGuards: ["current-state"],
      }],
    }],
    capabilities: [{
      id: "approve-items",
      accessListId: "access-control",
      activeField: "Active",
      principalField: "PrincipalKey",
      capabilityField: "Capability",
      scope: {
        mode: "field-match",
        targetField: "ScopeKey",
        accessField: "ScopeKey",
      },
      allowedCommands: ["apply-change"],
    }],
    commands: [{
      type: "apply-change",
      queueListId: "command-queue",
      targetListId: "protected-items",
      targetIdField: "TargetItemId",
      requestedFields: [],
      serverReadFields: ["Amount", "ScopeKey", "Status"],
      requiredCapability: "approve-items",
      transitionId: "apply-transition",
      idempotency: {
        keyFields: ["TargetItemId"],
        emptyKey: "reject",
        zeroMatches: "create-or-execute",
        oneMatch: "return-existing-or-continue",
        manyMatches: "fail-reconciliation",
        ambiguousWrite: "get-reconcile-no-blind-retry",
      },
      claim: {
        pendingState: "Pending",
        processingState: "Processing",
        succeededState: "Succeeded",
        failedState: "Failed",
        exactEtagRequired: true,
      },
      readback: {
        required: true,
        fields: ["Status"],
        assertions: [{ field: "Status", operator: "equals", expected: "Applied" }],
      },
    }],
    flows: [],
    packages: [],
    frontend: {
      root: "frontend",
      authModel: "existing-m365-session",
      secrets: "forbidden",
      protectedWriteModel: "typed-command-queue",
      directPatch: {
        enabled: true,
        listIds: ["protected-items"],
        explicitSave: true,
        digestPerTransaction: true,
        method: "POST",
        methodOverride: "MERGE",
        exactIfMatch: true,
        conflictStatus: 412,
        ambiguousWrite: "get-reconcile-no-blind-retry",
        semanticReadback: true,
      },
      pagination: { mode: "exhaust-continuation", sameOriginOnly: true },
    },
    security: {
      minimumPrivilege: true,
      clientActorAuthority: "forbidden",
      protectedClientWrites: "forbidden",
      allowlistedFieldsOnly: true,
      destructiveOperations: {
        dryRun: true,
        planDigest: true,
        humanApproval: true,
        itemLimit: 20,
        writeLimit: 20,
        stopOnUnexpected: true,
        semanticReadback: true,
      },
      httpClassification: {
        missingColumn400: "semantic-signature-only",
        other400: "GET_FAILED",
        initialPreflight404: "explicit-create-missing-only",
        applyOrReadback404: "strict-failure",
      },
    },
    verification: {
      globalCommand: "spflow verify --root . --offline --format json",
      requiredRuleIds: [...RULE_IDS],
      finalZipInspection: true,
      recursivePublicDataScan: true,
      mutationControls: true,
    },
    evidencePolicy: {
      permittedClaimClasses: ["LOCAL_STATIC"],
      localPromotionToTenant: "forbidden",
      exactArtifactBinding: true,
      synchronizedFolderIsPublication: false,
      successfulRunIsSemanticEffect: false,
    },
  };
}

function fixtureContext(graph: ArtifactGraphInput): ValidationContext {
  return {
    root: ".",
    offline: true,
    contract: projectContract(),
    graph,
    adapterEvidence: { packages: [], flows: [] },
  };
}

describe("WP-06 Wave 2 rules", () => {
  test("registry and fixture catalogs are complete", async () => {
    const ruleSchema = await readJson<Record<string, unknown>>(
      resolve(ROOT, "contracts/rule.schema.json"),
    );
    const validateCatalog = new Ajv2020({ strict: true }).compile(ruleSchema);
    for (const ruleId of RULE_IDS) {
      const fixtureRoot = resolve(ROOT, "fixtures/rules", ruleId);
      const catalog = await readJson<{
        readonly id: string;
        readonly detector: { readonly exportName: string };
      }>(resolve(ROOT, "rules/catalog", `${ruleId}.json`));
      const expected = await readJson<ExpectedFixture>(resolve(fixtureRoot, "expected.json"));
      const mutation = await readJson<MutationOperation>(resolve(fixtureRoot, "mutation.json"));

      assert.equal(catalog.id, ruleId);
      assert.equal(validateCatalog(catalog), true, JSON.stringify(validateCatalog.errors));
      assert.equal(expected.schemaVersion, "1.0");
      assert.equal(expected.ruleId, ruleId);
      assert.equal(expected.mutation.diagnosticCode, ruleId);
      assert.equal(mutation.path, "graph.json");
      assert.ok(ruleRegistry.has(ruleId));
    }
  });

  for (const ruleId of RULE_IDS) {
    test(`${ruleId} rejects RED exactly and passes GREEN and an independent control`, async () => {
      const fixtureRoot = resolve(ROOT, "fixtures/rules", ruleId);
      const catalog = await readJson<{ readonly id: string }>(
        resolve(ROOT, "rules/catalog", `${ruleId}.json`),
      );
      const expected = await readJson<ExpectedFixture>(resolve(fixtureRoot, "expected.json"));
      const red = await readJson<ArtifactGraphInput>(resolve(fixtureRoot, "red/graph.json"));
      const green = await readJson<ArtifactGraphInput>(resolve(fixtureRoot, "green/graph.json"));
      const positive = await readJson<ArtifactGraphInput>(
        resolve(fixtureRoot, "controls/positive/graph.json"),
      );
      const detector = ruleRegistry.get(ruleId);

      assert.equal(catalog.id, ruleId);
      assert.equal(expected.ruleId, ruleId);
      assert.notEqual(detector, undefined, `${ruleId} detector is not registered`);

      assert.notDeepEqual(
        semanticStructure(positive),
        semanticStructure(green),
        `${ruleId} positive control must be structurally independent`,
      );

      const diagnostics = await detector!.validate(fixtureContext(red));
      assert.deepEqual(
        diagnostics,
        expected.red.diagnostics.map((item) => ({
          code: item.code,
          path: item.artifactPath,
          message: item.messageContains,
        })),
      );
      assert.deepEqual(await detector!.validate(fixtureContext(green)), []);
      assert.deepEqual(await detector!.validate(fixtureContext(positive)), []);
    });

    test(`${ruleId} structural mutation restores the diagnostic`, async () => {
      const fixtureRoot = resolve(ROOT, "fixtures/rules", ruleId);
      const green = await readJson<ArtifactGraphInput>(resolve(fixtureRoot, "green/graph.json"));
      const red = await readJson<ArtifactGraphInput>(resolve(fixtureRoot, "red/graph.json"));
      const mutation = await readJson<MutationOperation>(resolve(fixtureRoot, "mutation.json"));
      const detector = ruleRegistry.get(ruleId)!;

      assert.doesNotMatch(
        mutation.pointer,
        /\/(?:id|role|fixtureProfile|sourceProfile|relativePath|digest)$/,
      );
      const mutated = applyMutation(green, mutation);
      assert.notDeepEqual(mutated, red, `${ruleId} mutation must not replay canonical RED`);
      const diagnostics = await detector.validate(fixtureContext(mutated));
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0]?.code, ruleId);
    });
  }

  test("diagnostics ignore decoy labels and remain stable when graph nodes reorder", async () => {
    for (const ruleId of RULE_IDS) {
      const detector = ruleRegistry.get(ruleId)!;
      const red = await readJson<ArtifactGraphInput>(
        resolve(ROOT, "fixtures/rules", ruleId, "red/graph.json"),
      );
      const changed = structuredClone(red) as {
        nodes: Array<{ data: Record<string, unknown> }>;
        edges: unknown[];
      };
      changed.nodes.reverse();
      changed.nodes.forEach((node) => {
        node.data.decoy = {
          label: `safe-${ruleId.toLowerCase()}`,
          text: "server-system-identity active-access-row exact-etag SP.Field MISSING_OBJECT",
        };
      });
      assert.deepEqual(
        await detector.validate(fixtureContext(changed as ArtifactGraphInput)),
        await detector.validate(fixtureContext(red)),
      );
    }
  });

  test("authorization evidence binds capability and scope fields to the contract", async () => {
    const authority = await readJson<ArtifactGraphInput>(
      resolve(ROOT, "fixtures/rules/SP-AUTHZ-001/green/graph.json"),
    ) as ArtifactGraphInput & {
      nodes: Array<{ data: { authorityChecks: Array<{
        capability: Record<string, unknown>;
      }> } }>;
    };
    authority.nodes[0]!.data.authorityChecks[0]!.capability.accessListId = "alternate-list";
    assert.equal(
      (await ruleRegistry.get("SP-AUTHZ-001")!.validate(fixtureContext(authority))).at(0)?.code,
      "SP-AUTHZ-001",
    );

    const scope = await readJson<ArtifactGraphInput>(
      resolve(ROOT, "fixtures/rules/SP-AUTHZ-002/green/graph.json"),
    ) as ArtifactGraphInput & {
      nodes: Array<{ data: { authorityChecks: Array<{
        scope: Record<string, unknown>;
      }> } }>;
    };
    scope.nodes[0]!.data.authorityChecks[0]!.scope.targetField = "AlternateScope";
    assert.equal(
      (await ruleRegistry.get("SP-AUTHZ-002")!.validate(fixtureContext(scope))).at(0)?.code,
      "SP-AUTHZ-002",
    );
  });

  test("GREEN results ignore filesystem, field, index, and sequenced-operation enumeration", async () => {
    for (const ruleId of [...RULE_IDS].reverse()) {
      const detector = ruleRegistry.get(ruleId)!;
      const green = await readJson<ArtifactGraphInput>(
        resolve(ROOT, "fixtures/rules", ruleId, "green/graph.json"),
      );
      const reordered = structuredClone(green) as ArtifactGraphInput & {
        nodes: Array<{ data: Record<string, unknown> }>;
      };
      reordered.nodes.reverse();
      for (const node of reordered.nodes) {
        for (const value of Object.values(node.data)) {
          if (Array.isArray(value)) value.reverse();
        }
        const plans = node.data.indexPlans;
        if (Array.isArray(plans)) {
          for (const plan of plans) {
            if (isRecord(plan) && Array.isArray(plan.operations)) plan.operations.reverse();
          }
        }
      }
      const context = fixtureContext(reordered);
      const lists = context.contract.sharePoint.lists as unknown as Array<{
        fields: unknown[];
        indexes: unknown[];
      }>;
      lists.reverse();
      lists.forEach((list) => {
        list.fields.reverse();
        list.indexes.reverse();
      });

      assert.deepEqual(await detector.validate(context), [], ruleId);
    }
  });
});
