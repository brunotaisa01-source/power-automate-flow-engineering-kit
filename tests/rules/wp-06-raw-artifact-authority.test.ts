import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";

import { buildArtifactGraph } from "../../packages/core/dist/artifact-graph.js";
import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";
import { inspectProjectRuleEvidence } from "../../packages/package-adapters/dist/solution-v1.js";
import { attachTrustedWp06Evidence } from "../../packages/package-adapters/dist/trusted-graph.js";
import {
  ruleRegistry,
  type ValidationContext,
} from "../../packages/rules/src/registry.ts";
import { syntheticSolution } from "../artifacts/synthetic-solution.ts";

const FRONTEND_RULES = ["APP-PAGINATION-001", "APP-SAVE-001", "SP-ODATA-001"];
const BUILDER_RULES = [
  "HTTP-SEMANTIC-001",
  "HTTP-SEMANTIC-002",
  "SP-ACL-001",
  "SP-AUTHZ-001",
  "SP-AUTHZ-002",
  "SP-SCHEMA-001",
  "SP-SCHEMA-002",
  "SP-SCHEMA-003",
];

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeBytes(root: string, path: string, bytes: Uint8Array): Promise<void> {
  const target = join(root, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

async function writeJson(root: string, path: string, value: unknown): Promise<Buffer> {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeBytes(root, path, bytes);
  return bytes;
}

function contract(requiredRuleIds: readonly string[], builder: boolean): ProjectContract {
  return {
    schemaVersion: "1.0",
    project: {
      id: "synthetic-raw-authority",
      displayName: "Synthetic raw authority",
      description: "Public synthetic adapter validation project.",
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
    environmentBindings: [],
    sharePoint: {
      siteUrlBinding: "SYNTHETIC_SITE",
      lists: [{
        id: "protected-items",
        titleBinding: "PROTECTED_ITEMS",
        role: "protected-domain",
        writeModel: "direct-patch",
        readAllowlist: ["ID", "Title"],
        createAllowlist: [],
        patchAllowlist: ["Title"],
        fields: [{
          logicalName: "title",
          internalName: "Title",
          type: "Text",
          required: true,
          indexed: false,
          unique: false,
          clientEditable: true,
          serverAuthoritative: false,
          immutableAfterCreate: false,
          sensitive: false,
          maxLength: 255,
        }],
        indexes: [],
        permissions: {
          inheritance: "break-clear",
          minimumRoles: [{
            principalBinding: "PROCESSOR",
            role: "processor",
            allowedOperations: ["read", "update"],
          }],
          directUserGrants: "forbidden",
          effectivePermissionReadback: "required",
        },
        views: [],
      }, {
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
          minimumRoles: [{
            principalBinding: "PROCESSOR",
            role: "processor",
            allowedOperations: ["read"],
          }],
          directUserGrants: "forbidden",
          effectivePermissionReadback: "required",
        },
        views: [],
      }],
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
        serverGuards: ["current-state", "exact-etag"],
      }],
    }],
    capabilities: [{
      id: "approve-items",
      accessListId: "access-control",
      activeField: "Active",
      principalField: "PrincipalKey",
      capabilityField: "Capability",
      scope: { mode: "field-match", targetField: "Title", accessField: "Title" },
      allowedCommands: ["apply-change"],
    }],
    commands: [{
      type: "apply-change",
      queueListId: "access-control",
      targetListId: "protected-items",
      targetIdField: "TargetItemId",
      requestedFields: [],
      serverReadFields: ["Title"],
      requiredCapability: "approve-items",
      transitionId: "apply-transition",
      idempotency: {
        keyFields: ["TargetItemId", "CommandType"],
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
    flows: builder ? [{
      id: "synthetic-processor",
      definitionPath: "flows/synthetic/definition.json",
      trigger: "manual",
      processorForCommandTypes: ["apply-change"],
      connectionReferences: ["PROCESSOR"],
      actionBudget: 30,
      concurrency: { enabled: true, degree: 1 },
      packageId: "synthetic-package",
    }] : [],
    packages: builder ? [{
      id: "synthetic-package",
      path: "artifacts/synthetic-solution.zip",
      profile: "power-platform-solution-v1",
      manifestPath: "artifacts/synthetic-solution.manifest.json",
      flowIds: ["synthetic-processor"],
      importMode: "disabled",
      nestedArchives: "forbidden",
    }] : [],
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
      requiredRuleIds: [...requiredRuleIds],
      finalZipInspection: true,
      recursivePublicDataScan: true,
      mutationControls: true,
    },
    evidencePolicy: {
      permittedClaimClasses: ["LOCAL_STATIC", "PACKAGE_ARTIFACT"],
      localPromotionToTenant: "forbidden",
      exactArtifactBinding: true,
      synchronizedFolderIsPublication: false,
      successfulRunIsSemanticEffect: false,
    },
  };
}

const FRONTEND_SOURCE = `
export async function saveSharePointItem(itemUrl, etag, digest, patch) {
  const response = await fetch(itemUrl, {
    method: "POST",
    headers: {
      "X-HTTP-Method": "MERGE",
      "IF-MATCH": etag,
      "X-RequestDigest": digest
    },
    body: JSON.stringify(patch)
  });
  if (response.status === 412) throw new Error("conflict");
  return fetch(itemUrl, { method: "GET" });
}

export async function loadAllSharePointPages(initialUrl, expectedOrigin, expectedPathname) {
  const visited = new Set();
  const items = [];
  let next = initialUrl;
  while (next) {
    const pageUrl = new URL(next);
    if (pageUrl.origin !== expectedOrigin || !pageUrl.pathname.startsWith(expectedPathname)) throw new Error("boundary");
    if (visited.has(pageUrl.href)) throw new Error("loop");
    visited.add(pageUrl.href);
    const response = await fetch(pageUrl, { method: "GET" });
    const body = await response.json();
    items.push(...body.value);
    next = body["@odata.nextLink"];
  }
  return items;
}

export function buildSharePointODataUrl(base, fields, value) {
  const url = new URL(base);
  const params = new URLSearchParams();
  params.set("$select", fields.join(","));
  params.set("$filter", value.replaceAll("'", "''"));
  url.search = params.toString();
  return url;
}
`;

function connectorAction(
  role: string,
  method: "GET" | "POST",
  coverage: readonly string[],
  predecessor?: string,
) {
  return {
    type: "OpenApiConnection",
    metadata: { spflowRole: role },
    ...(predecessor === undefined ? {} : { runAfter: { [predecessor]: ["Succeeded"] } }),
    inputs: {
      host: {
        connection: { referenceName: "PROCESSOR" },
        operationId: "HttpRequest",
      },
      method,
      uri: `/_api/${role}`,
      body: { coverage },
    },
  };
}

function builderDefinition(): Record<string, unknown> {
  const coverage = [
    "apply-change", "approve-items", "access-control", "Active", "PrincipalKey", "Capability",
    "protected-items", "Title", "-2147024809", "404",
  ];
  return {
    properties: {
      definition: {
        triggers: { SyntheticTrigger: { type: "Request", inputs: {} } },
        actions: {
          IdentityRead: connectorAction("identity-read", "GET", coverage),
          CapabilityRead: connectorAction("capability-read", "GET", coverage, "IdentityRead"),
          TargetRead: connectorAction("target-read", "GET", coverage, "CapabilityRead"),
          Mutation: connectorAction("mutation", "POST", coverage, "TargetRead"),
          PermissionWrite: connectorAction("permission-write", "POST", coverage, "Mutation"),
          PermissionReadback: connectorAction("permission-readback", "GET", coverage, "PermissionWrite"),
          FieldRead: connectorAction("field-read", "GET", coverage, "PermissionReadback"),
          FieldWrite: connectorAction("field-write", "POST", coverage, "FieldRead"),
          HttpClassifier: {
            type: "Condition",
            metadata: { spflowRole: "http-classifier" },
            runAfter: { FieldWrite: ["Succeeded"] },
            inputs: { expression: "400 404 -2147024809" },
          },
        },
      },
      connectionReferences: { PROCESSOR: { id: "synthetic" } },
    },
  };
}

async function writeContract(root: string, value: ProjectContract): Promise<void> {
  await writeJson(root, "project.contract.json", value);
}

async function writeFrontend(root: string, source = FRONTEND_SOURCE): Promise<void> {
  const sourceBytes = Buffer.from(source, "utf8");
  await writeBytes(root, "frontend/index.js", sourceBytes);
  await writeJson(root, "frontend/bundle.manifest.json", {
    artifactProfile: "spflow.frontend-bundle-v2",
    artifactRevision: 2,
    contractRevision: 2,
    entrypoint: "index.js",
    files: [{ path: "index.js", sha256: sha256(sourceBytes), bytes: sourceBytes.byteLength }],
    sources: ["index.js"],
  });
}

async function writeBuilder(root: string, definition: unknown, zipBytes?: Uint8Array): Promise<void> {
  await writeJson(root, "flows/synthetic/definition.json", definition);
  const solution = zipBytes ?? syntheticSolution(definition, "synthetic-processor");
  await writeBytes(root, "artifacts/synthetic-solution.zip", solution);
  await writeJson(root, "artifacts/synthetic-solution.manifest.json", {
    packageId: "synthetic-package",
    artifact: {
      path: "artifacts/synthetic-solution.zip",
      sha256: sha256(solution),
      bytes: solution.byteLength,
    },
  });
}

async function validationContext(root: string, value: ProjectContract): Promise<ValidationContext> {
  const repositoryGraph = await buildArtifactGraph(root, value);
  const adapterEvidence = await inspectProjectRuleEvidence(root, value);
  const graph = attachTrustedWp06Evidence(repositoryGraph, value, adapterEvidence);
  return {
    root,
    offline: true,
    contract: value,
    graph: graph.toJSON(),
    adapterEvidence,
  };
}

async function diagnostics(context: ValidationContext, ruleIds: readonly string[]) {
  const results = [];
  for (const ruleId of ruleIds) {
    results.push(...await ruleRegistry.get(ruleId)!.validate(context));
  }
  return results;
}

describe("WP-06 raw artifact authority", () => {
  test("real frontend inventory and parsed source create trusted evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-frontend-"));
    const value = contract(FRONTEND_RULES, false);
    try {
      await writeContract(root, value);
      await writeFrontend(root);
      const context = await validationContext(root, value);

      assert.equal(context.adapterEvidence.frontendBundles?.[0]?.valid, true);
      assert.equal(context.adapterEvidence.wp06Derivations?.length, 3);
      assert.deepEqual(await diagnostics(context, FRONTEND_RULES), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("missing, mismatched, extra, or structurally mutated frontend files remove authority", async () => {
    for (const scenario of [
      "missing-entrypoint",
      "digest-mismatch",
      "extra-file",
      "source-mutation",
    ] as const) {
      const root = await mkdtemp(join(tmpdir(), `spflow-raw-frontend-${scenario}-`));
      const value = contract(["APP-SAVE-001"], false);
      try {
        await writeContract(root, value);
        if (scenario === "source-mutation") {
          await writeFrontend(root, "export const unrelated = true;\n");
        } else {
          await writeFrontend(root);
          const sourceBytes = Buffer.from(FRONTEND_SOURCE, "utf8");
          if (scenario === "extra-file") {
            await writeBytes(root, "frontend/extra.js", Buffer.from("export {};\n", "utf8"));
          }
          await writeJson(root, "frontend/bundle.manifest.json", {
            artifactProfile: "spflow.frontend-bundle-v2",
            artifactRevision: 2,
            contractRevision: 2,
            entrypoint: scenario === "missing-entrypoint" ? "missing.js" : "index.js",
            files: [{
              path: "index.js",
              sha256: scenario === "digest-mismatch" ? "0".repeat(64) : sha256(sourceBytes),
              bytes: sourceBytes.byteLength,
            }],
            sources: ["index.js"],
          });
        }
        const context = await validationContext(root, value);

        assert.equal(context.adapterEvidence.wp06Derivations?.length, 0, scenario);
        assert.deepEqual(
          (await diagnostics(context, ["APP-SAVE-001"])).map(({ code }) => code),
          ["APP-SAVE-001"],
          scenario,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("multiple parser-accepted sources are ambiguous and fail closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-frontend-ambiguous-"));
    const value = contract(FRONTEND_RULES, false);
    try {
      await writeContract(root, value);
      const first = Buffer.from(FRONTEND_SOURCE, "utf8");
      const second = Buffer.from(`${FRONTEND_SOURCE}\n`, "utf8");
      await writeBytes(root, "frontend/index.js", first);
      await writeBytes(root, "frontend/alternate.js", second);
      await writeJson(root, "frontend/bundle.manifest.json", {
        artifactProfile: "spflow.frontend-bundle-v2",
        artifactRevision: 2,
        contractRevision: 2,
        entrypoint: "index.js",
        files: [
          { path: "alternate.js", sha256: sha256(second), bytes: second.byteLength },
          { path: "index.js", sha256: sha256(first), bytes: first.byteLength },
        ],
        sources: ["alternate.js", "index.js"],
      });
      const context = await validationContext(root, value);

      assert.equal(context.adapterEvidence.wp06Derivations?.length, 6);
      assert.deepEqual(
        (await diagnostics(context, FRONTEND_RULES)).map(({ code }) => code),
        FRONTEND_RULES,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("normalized definition and safely inspected ZIP authorize only structurally derived rules", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-"));
    const value = contract(BUILDER_RULES, true);
    try {
      await writeContract(root, value);
      await writeBuilder(root, builderDefinition());
      const context = await validationContext(root, value);

      assert.equal(context.adapterEvidence.definitions?.[0]?.failure, undefined);
      assert.equal(context.adapterEvidence.packages[0]?.inspection?.valid, true);
      assert.equal(context.adapterEvidence.wp06Derivations?.length, 4);
      assert.deepEqual(await diagnostics(context, BUILDER_RULES), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("unrelated definition and JSON named zip cannot create builder authority", async () => {
    for (const scenario of [
      "unrelated-definition",
      "definition-action-mutation",
      "definition-lineage-mutation",
      "json-zip",
    ] as const) {
      const root = await mkdtemp(join(tmpdir(), `spflow-raw-${scenario}-`));
      const value = contract(["SP-AUTHZ-001"], true);
      try {
        await writeContract(root, value);
        const definition = scenario === "unrelated-definition"
          ? { properties: { definition: { triggers: { T: { type: "Request" } }, actions: { A: { type: "Compose", inputs: "synthetic" } } } } }
          : builderDefinition() as any;
        if (scenario === "definition-action-mutation") {
          definition.properties.definition.actions.Mutation.inputs.method = "GET";
        }
        if (scenario === "definition-lineage-mutation") {
          delete definition.properties.definition.actions.Mutation.runAfter;
        }
        const zip = scenario === "json-zip"
          ? Buffer.from(JSON.stringify({ packageId: "synthetic-package" }), "utf8")
          : undefined;
        await writeBuilder(root, definition, zip);
        const context = await validationContext(root, value);

        assert.deepEqual((await diagnostics(context, ["SP-AUTHZ-001"])).map(({ code }) => code), [
          "SP-AUTHZ-001",
        ]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("caller-authored HTTP source IR cannot authorize FOUND", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-http-ir-"));
    const value = contract(["HTTP-SEMANTIC-001"], true);
    try {
      await writeContract(root, value);
      await writeBuilder(root, {
        properties: {
          definition: {
            triggers: { T: { type: "Request" } },
            actions: { A: { type: "Compose", inputs: "synthetic" } },
          },
        },
      });
      await writeJson(root, "flows/synthetic/builder-http-claims.json", {
        sourceIrProfile: "spflow.power-automate-source-ir-v1",
        sourceRevision: 1,
        contractRevision: 2,
        section: "httpClassifications",
        model: {
          requests: [{
            status: 200,
            phase: "preflight",
            kind: "initial-get",
            permitInitial404: false,
            error: {},
            parsedResponse: {
              schemaId: "sharepoint-list-item-v1:protected-items",
              targetList: "protected-items",
              expectedFields: ["ID", "Title"],
              body: { ID: 1, Title: "Synthetic" },
            },
            result: "FOUND",
          }],
        },
      });
      const context = await validationContext(root, value);

      assert.equal(context.adapterEvidence.wp06Derivations?.length, 0);
      assert.deepEqual((await diagnostics(context, ["HTTP-SEMANTIC-001"])).map(({ code }) => code), [
        "HTTP-SEMANTIC-001",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
