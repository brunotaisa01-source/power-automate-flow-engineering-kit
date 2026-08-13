import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, test } from "node:test";

import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";
import {
  ruleRegistry,
  type ArtifactGraphInput,
  type ValidationContext,
} from "../../packages/rules/src/registry.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_DIGEST = "c".repeat(64);
const SOURCE_DIGEST = "d".repeat(64);
const CONTRACT_BYTES = 2048;
const SOURCE_BYTES = 512;

type ExpectedKind = "builder" | "frontend";
type EvidenceSection =
  | "authorityChecks"
  | "permissionModels"
  | "permissionProbes"
  | "saveTransactions"
  | "paginationTraversals"
  | "odataRequests"
  | "fieldOperations"
  | "httpClassifications"
  | "indexPlans";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function fixtureContract(): ProjectContract {
  return {
    schemaVersion: "1.0",
    project: {
      id: "synthetic-wp06-remediation",
      displayName: "Synthetic WP-06 remediation",
      description: "Public synthetic adversarial contract.",
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
      scope: { mode: "field-match", targetField: "ScopeKey", accessField: "ScopeKey" },
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
      requiredRuleIds: [
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
      ],
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

async function fixture(ruleId: string, expectedKind: ExpectedKind, section: EvidenceSection) {
  const loaded = await readJson<ArtifactGraphInput>(
    resolve(ROOT, `fixtures/rules/${ruleId}/green/graph.json`),
  );
  const sourceEvidence = loaded.nodes.find((node) => {
    const data = node.data as Record<string, unknown>;
    return node.sourceProfile === "wp06-evidence-v1" && data[section] !== undefined;
  });
  assert.notEqual(sourceEvidence, undefined);
  const evidence = structuredClone(sourceEvidence) as unknown as Record<string, unknown>;
  const graph = {
    ...structuredClone(loaded),
    nodes: [evidence],
    edges: [],
  } as unknown as ArtifactGraphInput & { nodes: Array<Record<string, unknown>> };
  const evidenceData = evidence.data as Record<string, unknown>;
  const evidencePath = `artifacts/${ruleId.toLowerCase()}-evidence.json`;
  const sourcePath = `artifacts/${ruleId.toLowerCase()}-source.json`;
  evidence.id = `${expectedKind}:${evidencePath}:wp06-evidence-v1`;
  evidence.kind = expectedKind;
  evidence.relativePath = evidencePath;
  evidenceData.binding = {
    section,
    contractArtifactPath: "project.contract.json",
    contractArtifactSha256: CONTRACT_DIGEST,
    sourceArtifactPath: sourcePath,
    sourceArtifactSha256: SOURCE_DIGEST,
    sourceArtifactBytes: SOURCE_BYTES,
    sourceArtifactKind: expectedKind,
  };
  graph.nodes.push(
    {
      id: "contract:project.contract.json:project-contract-v1",
      kind: "contract",
      relativePath: "project.contract.json",
      digest: CONTRACT_DIGEST,
      byteLength: CONTRACT_BYTES,
      sourceProfile: "project-contract-v1",
      data: fixtureContract(),
      projections: {},
    },
    {
      id: `${expectedKind}:${sourcePath}:synthetic-source-v1`,
      kind: expectedKind,
      relativePath: sourcePath,
      digest: SOURCE_DIGEST,
      byteLength: SOURCE_BYTES,
      sourceProfile: "synthetic-source-v1",
      data: { synthetic: true },
      projections: {},
    },
  );
  return graph;
}

function context(graph: ArtifactGraphInput): ValidationContext {
  return {
    root: ".",
    offline: true,
    contract: fixtureContract(),
    graph,
    adapterEvidence: { packages: [], flows: [] },
  };
}

async function expectFailure(ruleId: string, graph: ArtifactGraphInput): Promise<void> {
  const diagnostics = await ruleRegistry.get(ruleId)!.validate(context(graph));
  assert.equal(diagnostics.at(0)?.code, ruleId);
}

describe("WP-06 remediation adversarial cases", () => {
  test("evidence fails closed when source or contract binding is absent, circular, or altered", async () => {
    const mutations: Array<(graph: ArtifactGraphInput & { nodes: Array<Record<string, unknown>> }) => void> = [
      (graph) => delete (graph.nodes[0]!.data as Record<string, unknown>).binding,
      (graph) => {
        const data = graph.nodes[0]!.data as { binding: Record<string, unknown> };
        data.binding.sourceArtifactPath = graph.nodes[0]!.relativePath;
      },
      (graph) => {
        const data = graph.nodes[0]!.data as { binding: Record<string, unknown> };
        data.binding.sourceArtifactSha256 = "e".repeat(64);
      },
      (graph) => {
        const data = graph.nodes[0]!.data as { binding: Record<string, unknown> };
        data.binding.sourceArtifactBytes = SOURCE_BYTES + 1;
      },
      (graph) => {
        const data = graph.nodes[0]!.data as { binding: Record<string, unknown> };
        data.binding.contractArtifactSha256 = "f".repeat(64);
      },
      (graph) => {
        const data = graph.nodes[0]!.data as { binding: Record<string, unknown> };
        data.binding.untrustedClaim = true;
      },
      (graph) => {
        const data = graph.nodes[0]!.data as Record<string, unknown>;
        data.untrustedClaim = true;
      },
    ];

    for (const mutate of mutations) {
      const graph = await fixture("APP-SAVE-001", "frontend", "saveTransactions");
      mutate(graph);
      await expectFailure("APP-SAVE-001", graph);
    }
  });

  test("catalog artifact kind and bound source kind are enforced", async () => {
    const frontend = await fixture("APP-SAVE-001", "frontend", "saveTransactions");
    frontend.nodes[0]!.kind = "builder";
    await expectFailure("APP-SAVE-001", frontend);

    const builder = await fixture("SP-AUTHZ-001", "builder", "authorityChecks");
    (builder.nodes[0]!.data as { binding: Record<string, unknown> }).binding.sourceArtifactKind =
      "frontend";
    await expectFailure("SP-AUTHZ-001", builder);
  });

  test("one evidence artifact owns exactly one section and duplicate traversals fail", async () => {
    const mixed = await fixture("APP-SAVE-001", "frontend", "saveTransactions");
    (mixed.nodes[0]!.data as Record<string, unknown>).paginationTraversals = [{
      completeness: "required",
    }];
    await expectFailure("APP-SAVE-001", mixed);

    const duplicate = await fixture(
      "APP-PAGINATION-001",
      "frontend",
      "paginationTraversals",
    );
    const data = duplicate.nodes[0]!.data as { paginationTraversals: unknown[] };
    data.paginationTraversals.push(structuredClone(data.paginationTraversals[0]));
    await expectFailure("APP-PAGINATION-001", duplicate);
  });

  test("unsupported HTTP statuses never authorize absence", async () => {
    for (const ruleId of ["HTTP-SEMANTIC-001", "HTTP-SEMANTIC-002"] as const) {
      const graph = await fixture(ruleId, "builder", "httpClassifications");
      const data = graph.nodes[0]!.data as { httpClassifications: Array<Record<string, unknown>> };
      data.httpClassifications = [{
        status: 500,
        phase: "preflight",
        requestKind: "initial-get",
        allowCreateMissing404: true,
        error: { platformCode: "SERVER_ERROR" },
        classification: "CREATE_MISSING",
      }];
      await expectFailure(ruleId, graph);
    }
  });

  test("undeclared list, field, operation, command, and index evidence fails closed", async () => {
    const save = await fixture("APP-SAVE-001", "frontend", "saveTransactions");
    const saveData = save.nodes[0]!.data as { saveTransactions: Array<Record<string, unknown>> };
    saveData.saveTransactions.push({ ...saveData.saveTransactions[0], listId: "undeclared-list" });
    await expectFailure("APP-SAVE-001", save);

    const acl = await fixture("SP-ACL-002", "builder", "permissionProbes");
    const aclData = acl.nodes[0]!.data as { permissionProbes: Array<Record<string, unknown>> };
    const operations = aclData.permissionProbes[0]!.operations as Record<string, boolean>;
    operations.approve = false;
    await expectFailure("SP-ACL-002", acl);

    const schema = await fixture("SP-SCHEMA-001", "builder", "fieldOperations");
    const schemaData = schema.nodes[0]!.data as { fieldOperations: Array<Record<string, unknown>> };
    schemaData.fieldOperations.push({
      listId: "protected-items",
      logicalName: "undeclared-field",
      identity: { source: "field-readback", internalName: "Other", entityPropertyName: "Other" },
      uses: [{ operation: "readback", fieldName: "Other", source: "entity-property-name" }],
    });
    await expectFailure("SP-SCHEMA-001", schema);

    const index = await fixture("SP-INDEX-001", "builder", "indexPlans");
    const indexData = index.nodes[0]!.data as { indexPlans: Array<Record<string, unknown>> };
    indexData.indexPlans.push({
      listId: "command-queue",
      currentFields: [],
      requiredFields: [],
      execution: "serial",
      digest: { fresh: true, bindsCurrent: true, bindsRequired: true },
      result: "NO_OP",
      maximumWrites: 0,
      writeCount: 0,
      operations: [],
      finalReadback: [],
    });
    await expectFailure("SP-INDEX-001", index);

    const auth = await fixture("SP-AUTHZ-001", "builder", "authorityChecks");
    const authData = auth.nodes[0]!.data as { authorityChecks: Array<Record<string, unknown>> };
    authData.authorityChecks.push({
      ...authData.authorityChecks[0],
      commandType: "undeclared-command",
    });
    await expectFailure("SP-AUTHZ-001", auth);
  });

  test("duplicate allowlist values fail instead of being silently deduplicated", async () => {
    const save = await fixture("APP-SAVE-001", "frontend", "saveTransactions");
    const saveData = save.nodes[0]!.data as {
      saveTransactions: Array<{ patchedFields: string[] }>;
    };
    saveData.saveTransactions[0]!.patchedFields.push("Title");
    await expectFailure("APP-SAVE-001", save);

    const odata = await fixture("SP-ODATA-001", "frontend", "odataRequests");
    const odataData = odata.nodes[0]!.data as { odataRequests: Array<{ fieldNames: string[] }> };
    odataData.odataRequests[0]!.fieldNames.push(odataData.odataRequests[0]!.fieldNames[0]!);
    await expectFailure("SP-ODATA-001", odata);

    const acl = await fixture("SP-ACL-001", "builder", "permissionModels");
    const aclData = acl.nodes[0]!.data as {
      permissionModels: Array<{ browserOperations: string[] }>;
    };
    aclData.permissionModels[0]!.browserOperations.push(
      aclData.permissionModels[0]!.browserOperations[0]!,
    );
    await expectFailure("SP-ACL-001", acl);

    const http = await fixture("HTTP-SEMANTIC-001", "builder", "httpClassifications");
    const httpData = http.nodes[0]!.data as { httpClassifications: unknown[] };
    httpData.httpClassifications.push(structuredClone(httpData.httpClassifications[0]));
    await expectFailure("HTTP-SEMANTIC-001", http);
  });
});
