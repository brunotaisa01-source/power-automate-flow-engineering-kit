import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";

import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";
import { inspectTrustedProjectArtifacts } from "../../packages/package-adapters/dist/solution-v1.js";
import {
  ruleRegistry,
  type ValidationContext,
} from "../../packages/rules/src/registry.ts";
import { syntheticSolution } from "../artifacts/synthetic-solution.ts";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../..");
const BUILT_CLI = resolve(REPOSITORY_ROOT, "packages/cli/dist/bin/spflow.js");

const FRONTEND_RULES = ["APP-PAGINATION-001", "APP-SAVE-001", "SP-ODATA-001"];
const BUILDER_RULES = [
  "HTTP-SEMANTIC-001",
  "HTTP-SEMANTIC-002",
  "SP-ACL-001",
  "SP-ACL-002",
  "SP-AUTHZ-001",
  "SP-AUTHZ-002",
  "SP-INDEX-001",
  "SP-INDEX-002",
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
    environmentBindings: [{
      key: "SYNTHETIC_SITE",
      kind: "site-url",
      requiredFor: ["generate", "tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: false,
      example: "https://synthetic.example.test/sites/spflow",
    }, {
      key: "PROTECTED_ITEMS",
      kind: "list-title",
      requiredFor: ["generate", "tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: false,
      example: "{PROTECTED_ITEMS}",
    }, {
      key: "ACCESS_CONTROL",
      kind: "list-title",
      requiredFor: ["generate", "tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: false,
      example: "{ACCESS_CONTROL}",
    }, {
      key: "PROCESSOR",
      kind: "connection-reference",
      requiredFor: ["generate", "tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: true,
      example: "{PROCESSOR}",
    }],
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
          indexed: true,
          unique: false,
          clientEditable: true,
          serverAuthoritative: false,
          immutableAfterCreate: false,
          sensitive: false,
          maxLength: 255,
        }, {
          logicalName: "status",
          internalName: "Status",
          type: "Text",
          required: true,
          indexed: false,
          unique: false,
          clientEditable: false,
          serverAuthoritative: true,
          immutableAfterCreate: false,
          sensitive: false,
          maxLength: 64,
        }, {
          logicalName: "owner",
          internalName: "Owner",
          type: "Text",
          required: true,
          indexed: false,
          unique: false,
          clientEditable: false,
          serverAuthoritative: true,
          immutableAfterCreate: false,
          sensitive: false,
          maxLength: 255,
        }, {
          logicalName: "amount",
          internalName: "Amount",
          type: "Number",
          required: true,
          indexed: false,
          unique: false,
          clientEditable: false,
          serverAuthoritative: true,
          immutableAfterCreate: false,
          sensitive: false,
        }],
        indexes: [{ field: "Title", order: 1, required: true }],
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
        fields: [{
          logicalName: "active",
          internalName: "Active",
          type: "Boolean",
          required: true,
          indexed: false,
          unique: false,
          clientEditable: false,
          serverAuthoritative: true,
          immutableAfterCreate: false,
          sensitive: false,
        }, {
          logicalName: "principal-key",
          internalName: "PrincipalKey",
          type: "Text",
          required: true,
          indexed: false,
          unique: false,
          clientEditable: false,
          serverAuthoritative: true,
          immutableAfterCreate: false,
          sensitive: false,
          maxLength: 255,
        }, {
          logicalName: "capability",
          internalName: "Capability",
          type: "Text",
          required: true,
          indexed: false,
          unique: false,
          clientEditable: false,
          serverAuthoritative: true,
          immutableAfterCreate: false,
          sensitive: false,
          maxLength: 255,
        }, {
          logicalName: "scope-title",
          internalName: "Title",
          type: "Text",
          required: true,
          indexed: false,
          unique: false,
          clientEditable: false,
          serverAuthoritative: true,
          immutableAfterCreate: false,
          sensitive: false,
          maxLength: 255,
        }, {
          logicalName: "target-item-id",
          internalName: "TargetItemId",
          type: "Number",
          required: true,
          indexed: false,
          unique: false,
          clientEditable: false,
          serverAuthoritative: true,
          immutableAfterCreate: true,
          sensitive: false,
        }, {
          logicalName: "command-type",
          internalName: "CommandType",
          type: "Text",
          required: true,
          indexed: false,
          unique: false,
          clientEditable: false,
          serverAuthoritative: true,
          immutableAfterCreate: true,
          sensitive: false,
          maxLength: 64,
        }],
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
      serverReadFields: ["Title", "Owner", "Amount"],
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
const PATCH_ALLOWLISTS = Object.freeze({ "protected-items": Object.freeze(["Title"]) });
const READ_ALLOWLISTS = Object.freeze({ "protected-items": Object.freeze(["ID", "Title"]) });

function allowlistedPatch(listId, patch) {
  const fields = PATCH_ALLOWLISTS[listId];
  if (!fields) throw new Error("unknown-list");
  const entries = Object.entries(patch);
  if (entries.length === 0 || !entries.every(([field, value]) => fields.includes(field) && value !== undefined)) throw new Error("invalid-patch");
  return Object.fromEntries(entries);
}

async function freshDigest(itemUrl) {
  const response = await globalThis.fetch(new URL("/_api/contextinfo", itemUrl), { method: "POST" });
  const body = await response.json();
  return body.FormDigestValue;
}

export async function saveSharePointItem(listId, itemUrl, etag, patch) {
  const body = allowlistedPatch(listId, patch);
  const digest = await freshDigest(itemUrl);
  const response = await globalThis.fetch(itemUrl, {
    method: "POST",
    headers: {
      "X-HTTP-Method": "MERGE",
      "IF-MATCH": etag,
      "X-RequestDigest": digest
    },
    body: JSON.stringify(body)
  });
  if (response.status === 412) throw new Error("conflict");
  if (!response.ok) {
    await globalThis.fetch(itemUrl, { method: "GET" });
    throw new Error("ambiguous-write");
  }
  const readback = await globalThis.fetch(itemUrl, { method: "GET" });
  const current = await readback.json();
  if (!Object.entries(body).every(([field, value]) => Object.is(current[field], value))) throw new Error("readback-mismatch");
  return current;
}

export async function loadAllSharePointPages(initialUrl, expectedOrigin, expectedPathname) {
  const visited = new Set();
  const items = [];
  let next = initialUrl;
  let pages = 0;
  while (next) {
    pages += 1;
    if (pages > 50) throw new Error("page-limit");
    const pageUrl = new URL(next);
    if (pageUrl.origin !== expectedOrigin || !pageUrl.pathname.startsWith(expectedPathname)) throw new Error("boundary");
    if (visited.has(pageUrl.href)) throw new Error("loop");
    visited.add(pageUrl.href);
    const response = await globalThis.fetch(pageUrl, { method: "GET" });
    const body = await response.json();
    items.push(...body.value);
    next = body["@odata.nextLink"];
  }
  return items;
}

export function buildSharePointODataUrl(base, listId, field, value) {
  const fields = READ_ALLOWLISTS[listId];
  if (!fields) throw new Error("unknown-list");
  if (!fields.includes(field)) throw new Error("unknown-field");
  const url = new URL(base);
  const params = new URLSearchParams();
  params.set("$select", fields.join(","));
  const escaped = String(value).replaceAll("'", "''");
  params.set("$filter", \`\${field} eq '\${escaped}'\`);
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

function inertBuilderDefinition(): Record<string, unknown> {
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

function semanticConnector(
  role: string,
  method: "GET" | "POST",
  uri: string,
  parameters: Record<string, unknown>,
  predecessor?: string,
  extra: Record<string, unknown> = {},
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
      uri,
      parameters,
      ...extra,
    },
  };
}

function failureElse(id: string) {
  return {
    actions: {
      [id]: {
        type: "Terminate",
        inputs: { status: "Failed" },
      },
    },
  };
}

function indexPlanActions(
  mode: "APPLY" | "NO_OP",
  protectedUri: string,
  predecessor: string,
): Record<string, unknown> {
  const query = "$select=InternalName,Indexed&$filter=Indexed eq true&$orderby=InternalName";
  const currentFields = mode === "APPLY" ? ["LegacyCode"] : ["Title"];
  const setExpression = (actionId: string, fields: readonly string[]) => fields.length === 0
    ? `@equals(length(body('${actionId}')['value']),0)`
    : `@and(equals(length(body('${actionId}')['value']),${fields.length}),${fields.flatMap((field, index) => [
        `equals(body('${actionId}')['value'][${index}]['InternalName'],'${field}')`,
        `equals(body('${actionId}')['value'][${index}]['Indexed'],true)`,
      ]).join(",")})`;
  const applyActions: Record<string, unknown> = mode === "APPLY" ? {
    IndexRequestDigest: semanticConnector(
      "index-request-digest:protected-items",
      "POST",
      "/_api/contextinfo",
      {},
      "IndexPlanAssert",
    ),
    IndexRemoveLegacy: semanticConnector(
      "index-remove:protected-items:LegacyCode",
      "POST",
      `${protectedUri}/fields/getbyinternalnameortitle('LegacyCode')`,
      {},
      "IndexRequestDigest",
      {
        headers: { "X-RequestDigest": "@{body('IndexRequestDigest')['FormDigestValue']}" },
        body: { __metadata: { type: "SP.Field" }, Indexed: false },
      },
    ),
    IndexStepReadbackLegacy: semanticConnector(
      "index-step-readback:protected-items:remove:LegacyCode",
      "GET",
      `${protectedUri}/fields?${query}`,
      {},
      "IndexRemoveLegacy",
    ),
    IndexStepAssertLegacy: {
      type: "If",
      metadata: { spflowRole: "index-step-assert:protected-items:remove:LegacyCode" },
      runAfter: { IndexStepReadbackLegacy: ["Succeeded"] },
      expression: setExpression("IndexStepReadbackLegacy", []),
      actions: {},
      else: failureElse("IndexRemoveReadbackFailed"),
    },
    IndexAddTitle: semanticConnector(
      "index-add:protected-items:Title",
      "POST",
      `${protectedUri}/fields/getbyinternalnameortitle('Title')`,
      {},
      "IndexStepAssertLegacy",
      {
        headers: { "X-RequestDigest": "@{body('IndexRequestDigest')['FormDigestValue']}" },
        body: { __metadata: { type: "SP.Field" }, Indexed: true },
      },
    ),
    IndexStepReadbackTitle: semanticConnector(
      "index-step-readback:protected-items:add:Title",
      "GET",
      `${protectedUri}/fields?${query}`,
      {},
      "IndexAddTitle",
    ),
    IndexStepAssertTitle: {
      type: "If",
      metadata: { spflowRole: "index-step-assert:protected-items:add:Title" },
      runAfter: { IndexStepReadbackTitle: ["Succeeded"] },
      expression: setExpression("IndexStepReadbackTitle", ["Title"]),
      actions: {},
      else: failureElse("IndexAddReadbackFailed"),
    },
  } : {};
  const finalPredecessor = mode === "APPLY" ? "IndexStepAssertTitle" : "IndexPlanAssert";
  return {
    IndexRead: semanticConnector(
      "index-read:protected-items",
      "GET",
      `${protectedUri}/fields?${query}`,
      {},
      predecessor,
    ),
    IndexCurrentAssert: {
      type: "If",
      metadata: { spflowRole: "index-current-assert:protected-items" },
      runAfter: { IndexRead: ["Succeeded"] },
      expression: setExpression("IndexRead", currentFields),
      actions: {
        IndexPlanDigest: {
          type: "Compose",
          metadata: { spflowRole: "index-plan-digest:protected-items" },
          inputs: "@sha256(concat(string(body('IndexRead')['value']),'|','Title'))",
        },
        IndexPlanAssert: {
          type: "If",
          metadata: { spflowRole: "index-plan-assert:protected-items" },
          runAfter: { IndexPlanDigest: ["Succeeded"] },
          expression: "@equals(triggerBody()['ApprovedPlanDigest'],outputs('IndexPlanDigest'))",
          actions: {},
          else: failureElse("IndexPlanDigestMismatch"),
        },
        ...applyActions,
        IndexFinalReadback: semanticConnector(
          "index-final-readback:protected-items",
          "GET",
          `${protectedUri}/fields?${query}`,
          {},
          finalPredecessor,
        ),
        IndexFinalAssert: {
          type: "If",
          metadata: { spflowRole: "index-final-assert:protected-items" },
          runAfter: { IndexFinalReadback: ["Succeeded"] },
          expression: setExpression("IndexFinalReadback", ["Title"]),
          actions: {},
          else: failureElse("IndexFinalReadbackFailed"),
        },
        IndexResult: {
          type: "Compose",
          metadata: { spflowRole: "index-result:protected-items" },
          runAfter: { IndexFinalAssert: ["Succeeded"] },
          inputs: {
            result: mode,
            planDigest: "@{outputs('IndexPlanDigest')}",
          },
        },
      },
      else: failureElse("IndexCurrentStateMismatch"),
    },
  };
}

function builderDefinition(indexMode: "APPLY" | "NO_OP" = "APPLY"): Record<string, unknown> {
  const protectedUri = "/_api/web/lists/getbytitle('PROTECTED_ITEMS')";
  const accessUri = "/_api/web/lists/getbytitle('ACCESS_CONTROL')";
  const fieldActions: Record<string, unknown> = {};
  let fieldPredecessor = "PermissionAssertAccess";
  for (const field of [
    {
      listId: "protected-items", listUri: protectedUri, logicalName: "title",
      internalName: "Title", type: "Text", metadataType: "SP.FieldText", fieldTypeKind: 2,
      indexed: true, clientEditable: true, serverAuthoritative: false,
      immutableAfterCreate: false, maxLength: 255,
    },
    {
      listId: "protected-items", listUri: protectedUri, logicalName: "status",
      internalName: "Status", type: "Text", metadataType: "SP.FieldText", fieldTypeKind: 2,
      indexed: false, clientEditable: false, serverAuthoritative: true,
      immutableAfterCreate: false, maxLength: 64,
    },
    {
      listId: "protected-items", listUri: protectedUri, logicalName: "owner",
      internalName: "Owner", type: "Text", metadataType: "SP.FieldText", fieldTypeKind: 2,
      indexed: false, clientEditable: false, serverAuthoritative: true,
      immutableAfterCreate: false, maxLength: 255,
    },
    {
      listId: "protected-items", listUri: protectedUri, logicalName: "amount",
      internalName: "Amount", type: "Number", metadataType: "SP.FieldNumber", fieldTypeKind: 9,
      indexed: false, clientEditable: false, serverAuthoritative: true,
      immutableAfterCreate: false,
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "active",
      internalName: "Active", type: "Boolean", metadataType: "SP.FieldBoolean", fieldTypeKind: 8,
      indexed: false, clientEditable: false, serverAuthoritative: true,
      immutableAfterCreate: false,
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "principal-key",
      internalName: "PrincipalKey", type: "Text", metadataType: "SP.FieldText", fieldTypeKind: 2,
      indexed: false, clientEditable: false, serverAuthoritative: true,
      immutableAfterCreate: false, maxLength: 255,
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "capability",
      internalName: "Capability", type: "Text", metadataType: "SP.FieldText", fieldTypeKind: 2,
      indexed: false, clientEditable: false, serverAuthoritative: true,
      immutableAfterCreate: false, maxLength: 255,
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "scope-title",
      internalName: "Title", type: "Text", metadataType: "SP.FieldText", fieldTypeKind: 2,
      indexed: false, clientEditable: false, serverAuthoritative: true,
      immutableAfterCreate: false, maxLength: 255,
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "target-item-id",
      internalName: "TargetItemId", type: "Number", metadataType: "SP.FieldNumber", fieldTypeKind: 9,
      indexed: false, clientEditable: false, serverAuthoritative: true,
      immutableAfterCreate: true,
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "command-type",
      internalName: "CommandType", type: "Text", metadataType: "SP.FieldText", fieldTypeKind: 2,
      indexed: false, clientEditable: false, serverAuthoritative: true,
      immutableAfterCreate: true, maxLength: 64,
    },
  ]) {
    const suffix = `${field.listId.replaceAll("-", "_")}_${field.internalName}`;
    const readId = `FieldRead_${suffix}`;
    const foundId = `FieldFound_${suffix}`;
    const foundAssertId = `FieldFoundAssert_${suffix}`;
    const missingId = `FieldMissing_${suffix}`;
    const writeId = `FieldWrite_${suffix}`;
    const readbackId = `FieldReadback_${suffix}`;
    const readbackAssertId = `FieldReadbackAssert_${suffix}`;
    const actual = {
      logicalName: field.logicalName,
      internalName: field.internalName,
      type: field.type,
      required: true,
      indexed: field.indexed,
      unique: false,
      clientEditable: field.clientEditable,
      serverAuthoritative: field.serverAuthoritative,
      immutableAfterCreate: field.immutableAfterCreate,
      sensitive: false,
      ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    };
    const select = ["InternalName", "EntityPropertyName", ...Object.keys(actual)].join(",");
    const literal = (value: unknown) => typeof value === "string"
      ? `'${value.replaceAll("'", "''")}'`
      : String(value);
    const comparison = (actionId: string) => `@and(`
      + `equals(body('${actionId}')['InternalName'],'${field.internalName}'),`
      + `equals(body('${actionId}')['EntityPropertyName'],'${field.internalName}'),`
      + `${Object.entries(actual).map(([name, value]) =>
        `equals(body('${actionId}')['${name}'],${literal(value)})`
      ).join(",")})`;
    fieldActions[readId] = semanticConnector(
      `field-read:${field.listId}:${field.internalName}`,
      "GET",
      `${field.listUri}/fields/getbyinternalnameortitle('${field.internalName}')?$select=${select}`,
      {},
      fieldPredecessor,
    );
    fieldActions[foundId] = {
      type: "If",
      metadata: { spflowRole: `field-found:${field.listId}:${field.internalName}` },
      runAfter: { [readId]: ["Failed", "Succeeded"] },
      expression: `@equals(outputs('${readId}')['statusCode'],200)`,
      actions: {
        [foundAssertId]: {
          type: "If",
          metadata: { spflowRole: `field-found-assert:${field.listId}:${field.internalName}` },
          expression: comparison(readId),
          actions: {},
          else: failureElse(`FieldFoundIncompatible_${suffix}`),
        },
      },
      else: {
        actions: {
          [missingId]: {
            type: "If",
            metadata: { spflowRole: `field-missing:${field.listId}:${field.internalName}` },
            expression: `@equals(outputs('${readId}')['statusCode'],404)`,
            actions: {
              [writeId]: semanticConnector(
                `field-write:${field.listId}:${field.internalName}`,
                "POST",
                `${field.listUri}/fields`,
                {},
                undefined,
                {
                  body: {
                    __metadata: { type: field.metadataType },
                    FieldTypeKind: field.fieldTypeKind,
                    InternalName: field.internalName,
                    Required: true,
                    Indexed: field.indexed,
                    EnforceUniqueValues: false,
                    ...(field.maxLength === undefined ? {} : { MaxLength: field.maxLength }),
                  },
                },
              ),
              [readbackId]: semanticConnector(
                `field-readback:${field.listId}:${field.internalName}`,
                "GET",
                `${field.listUri}/fields/getbyinternalnameortitle('${field.internalName}')?$select=${select}`,
                {},
                writeId,
              ),
              [readbackAssertId]: {
                type: "If",
                metadata: { spflowRole: `field-readback-assert:${field.listId}:${field.internalName}` },
                runAfter: { [readbackId]: ["Succeeded"] },
                expression: comparison(readbackId),
                actions: {},
                else: failureElse(`FieldReadbackFailed_${suffix}`),
              },
            },
            else: failureElse(`FieldGetFailed_${suffix}`),
          },
        },
      },
    };
    fieldPredecessor = foundId;
  }
  return {
    properties: {
      definition: {
        triggers: { SyntheticTrigger: { type: "Request", inputs: {} } },
        actions: {
          IdentityRead: semanticConnector(
            "identity-read",
            "GET",
            "/_api/web/currentuser?$select=Id,LoginName",
            { actorSource: "server-system-identity" },
          ),
          CapabilityRead: semanticConnector(
            "capability-read",
            "GET",
            `${accessUri}/items?$select=Active,PrincipalKey,Capability,Title&$filter=Active eq 1 and PrincipalKey eq '@{body('IdentityRead')['LoginName']}' and Capability eq 'approve-items'`,
            {},
            "IdentityRead",
          ),
          TargetRead: semanticConnector(
            "target-read",
            "GET",
            `${protectedUri}/items(@{triggerBody()['TargetItemId']})?$select=Title,Owner,Amount,Status`,
            {},
            "CapabilityRead",
          ),
          AuthorizationGuard: {
            type: "If",
            metadata: { spflowRole: "authorization-guard" },
            runAfter: { TargetRead: ["Succeeded"] },
            expression: "@and(equals(length(body('CapabilityRead')['value']),1),equals(body('CapabilityRead')['value'][0]['Title'],body('TargetRead')['Title']),not(empty(body('TargetRead')['Owner'])),greaterOrEquals(body('TargetRead')['Amount'],0),equals(triggerBody()['CommandType'],'apply-change'),equals(body('TargetRead')['Status'],'Pending'))",
            actions: {
              Mutation: semanticConnector(
                "mutation",
                "POST",
                `${protectedUri}/items(@{triggerBody()['TargetItemId']})`,
                {},
                undefined,
                {
                  headers: {
                    "X-HTTP-Method": "MERGE",
                    "IF-MATCH": "@{body('TargetRead')['@odata.etag']}",
                  },
                  body: { Status: "Applied" },
                },
              ),
              MutationReadback: semanticConnector(
                "mutation-readback",
                "GET",
                `${protectedUri}/items(@{triggerBody()['TargetItemId']})?$select=Status`,
                {},
                "Mutation",
              ),
              MutationReadbackAssert: {
                type: "If",
                metadata: { spflowRole: "mutation-readback-assert" },
                runAfter: { MutationReadback: ["Succeeded"] },
                expression: "@equals(body('MutationReadback')['Status'],'Applied')",
                actions: {},
                else: failureElse("MutationReadbackFailed"),
              },
            },
            else: failureElse("AuthorizationFailed"),
          },
          PermissionModelProtected: semanticConnector(
            "permission-model:protected-items",
            "POST",
            `${protectedUri}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`,
            {},
            "AuthorizationGuard",
          ),
          PermissionPrincipalProtected: semanticConnector(
            "permission-principal:protected-items:PROCESSOR",
            "GET",
            "/_api/web/siteusers/getbyloginname(@p)?@p='PROCESSOR'",
            {},
            "PermissionModelProtected",
          ),
          PermissionRoleProtected: semanticConnector(
            "permission-role:protected-items:PROCESSOR",
            "GET",
            "/_api/web/roledefinitions/getbyname('processor')?$select=Id,Name",
            {},
            "PermissionPrincipalProtected",
          ),
          PermissionGrantProtected: semanticConnector(
            "permission-grant:protected-items:PROCESSOR",
            "POST",
            `${protectedUri}/roleassignments/addroleassignment(principalid=@{body('PermissionPrincipalProtected')['Id']},roledefid=@{body('PermissionRoleProtected')['Id']})`,
            {},
            "PermissionRoleProtected",
          ),
          PermissionReadbackProtected: semanticConnector(
            "permission-readback:protected-items:PROCESSOR",
            "GET",
            `${protectedUri}/roleassignments?$expand=Member,RoleDefinitionBindings`,
            {},
            "PermissionGrantProtected",
          ),
          PermissionGrantAssertProtected: {
            type: "If",
            metadata: { spflowRole: "permission-grant-assert:protected-items:PROCESSOR" },
            runAfter: { PermissionReadbackProtected: ["Succeeded"] },
            expression: "@and(contains(string(body('PermissionReadbackProtected')),'PROCESSOR'),contains(string(body('PermissionReadbackProtected')),'processor'))",
            actions: {},
            else: failureElse("PermissionGrantProtectedFailed"),
          },
          PermissionProbeProtected: semanticConnector(
            "permission-probe:protected-items:PROCESSOR",
            "GET",
            `${protectedUri}/getusereffectivepermissions(@p)?@p='PROCESSOR'`,
            {},
            "PermissionGrantAssertProtected",
          ),
          PermissionAssertProtected: {
            type: "If",
            metadata: { spflowRole: "permission-assert:protected-items:PROCESSOR" },
            runAfter: { PermissionProbeProtected: ["Succeeded"] },
            expression: "@and(equals(body('PermissionProbeProtected')['operations/create'],false),equals(body('PermissionProbeProtected')['operations/delete'],false),equals(body('PermissionProbeProtected')['operations/read'],true),equals(body('PermissionProbeProtected')['operations/update'],true))",
            actions: {},
            else: failureElse("PermissionProbeProtectedFailed"),
          },
          PermissionModelAccess: semanticConnector(
            "permission-model:access-control",
            "POST",
            `${accessUri}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`,
            {},
            "PermissionAssertProtected",
          ),
          PermissionPrincipalAccess: semanticConnector(
            "permission-principal:access-control:PROCESSOR",
            "GET",
            "/_api/web/siteusers/getbyloginname(@p)?@p='PROCESSOR'",
            {},
            "PermissionModelAccess",
          ),
          PermissionRoleAccess: semanticConnector(
            "permission-role:access-control:PROCESSOR",
            "GET",
            "/_api/web/roledefinitions/getbyname('processor')?$select=Id,Name",
            {},
            "PermissionPrincipalAccess",
          ),
          PermissionGrantAccess: semanticConnector(
            "permission-grant:access-control:PROCESSOR",
            "POST",
            `${accessUri}/roleassignments/addroleassignment(principalid=@{body('PermissionPrincipalAccess')['Id']},roledefid=@{body('PermissionRoleAccess')['Id']})`,
            {},
            "PermissionRoleAccess",
          ),
          PermissionReadbackAccess: semanticConnector(
            "permission-readback:access-control:PROCESSOR",
            "GET",
            `${accessUri}/roleassignments?$expand=Member,RoleDefinitionBindings`,
            {},
            "PermissionGrantAccess",
          ),
          PermissionGrantAssertAccess: {
            type: "If",
            metadata: { spflowRole: "permission-grant-assert:access-control:PROCESSOR" },
            runAfter: { PermissionReadbackAccess: ["Succeeded"] },
            expression: "@and(contains(string(body('PermissionReadbackAccess')),'PROCESSOR'),contains(string(body('PermissionReadbackAccess')),'processor'))",
            actions: {},
            else: failureElse("PermissionGrantAccessFailed"),
          },
          PermissionProbeAccess: semanticConnector(
            "permission-probe:access-control:PROCESSOR",
            "GET",
            `${accessUri}/getusereffectivepermissions(@p)?@p='PROCESSOR'`,
            {},
            "PermissionGrantAssertAccess",
          ),
          PermissionAssertAccess: {
            type: "If",
            metadata: { spflowRole: "permission-assert:access-control:PROCESSOR" },
            runAfter: { PermissionProbeAccess: ["Succeeded"] },
            expression: "@and(equals(body('PermissionProbeAccess')['operations/create'],false),equals(body('PermissionProbeAccess')['operations/delete'],false),equals(body('PermissionProbeAccess')['operations/read'],true),equals(body('PermissionProbeAccess')['operations/update'],false))",
            actions: {},
            else: failureElse("PermissionProbeAccessFailed"),
          },
          ...fieldActions,
          HttpObservation: semanticConnector(
            "http-observation",
            "GET",
            `${protectedUri}/items(@{triggerBody()['TargetItemId']})?$select=ID,Title`,
            {},
            fieldPredecessor,
          ),
          HttpClassifier: {
            type: "If",
            metadata: { spflowRole: "http-classifier" },
            runAfter: { HttpObservation: ["Failed", "Succeeded"] },
            expression: "@and(equals(outputs('HttpObservation')['statusCode'],400),or(equals(body('HttpObservation')['error/code'],'-2147024809'),equals(body('HttpObservation')['messageCategory'],'column-does-not-exist')))",
            actions: {
              HttpMissingResult: {
                type: "Compose",
                metadata: { spflowRole: "http-result:missing-column" },
                inputs: "MISSING_OBJECT",
              },
            },
            else: {
              actions: {
                HttpOther400: {
                  type: "If",
                  metadata: { spflowRole: "http-classifier:other-400" },
                  expression: "@equals(outputs('HttpObservation')['statusCode'],400)",
                  actions: {
                    HttpOther400Result: {
                      type: "Compose",
                      metadata: { spflowRole: "http-result:other-400" },
                      inputs: "GET_FAILED",
                    },
                  },
                  else: {
                    actions: {
                      HttpPreflight404: {
                        type: "If",
                        metadata: { spflowRole: "http-classifier:preflight-404" },
                        expression: "@and(equals(outputs('HttpObservation')['statusCode'],404),equals(triggerBody()['Phase'],'preflight'),equals(triggerBody()['RequestKind'],'initial-get'),equals(triggerBody()['AllowCreateMissing404'],true))",
                        actions: {
                          HttpPreflight404Result: {
                            type: "Compose",
                            metadata: { spflowRole: "http-result:preflight-404" },
                            inputs: "CREATE_MISSING",
                          },
                        },
                        else: {
                          actions: {
                            HttpStrict404: {
                              type: "If",
                              metadata: { spflowRole: "http-classifier:strict-404" },
                              expression: "@equals(outputs('HttpObservation')['statusCode'],404)",
                              actions: {
                                HttpStrict404Result: {
                                  type: "Compose",
                                  metadata: { spflowRole: "http-result:strict-404" },
                                  inputs: "GET_FAILED",
                                },
                              },
                              else: {
                                actions: {
                                  HttpDefaultResult: {
                                    type: "Compose",
                                    metadata: { spflowRole: "http-result:default" },
                                    inputs: "GET_FAILED",
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          ...indexPlanActions(indexMode, protectedUri, "HttpClassifier"),
        },
      },
      connectionReferences: { PROCESSOR: { id: "synthetic" } },
    },
  };
}

function visitDefinitionActions(
  definition: Record<string, unknown>,
  visit: (action: Record<string, unknown>) => void,
): void {
  const root = (definition as any).properties.definition.actions as Record<string, unknown>;
  const walk = (actions: Record<string, unknown>): void => {
    for (const value of Object.values(actions)) {
      const action = value as Record<string, unknown>;
      visit(action);
      const nested = action.actions as Record<string, unknown> | undefined;
      if (nested !== undefined) walk(nested);
      const otherwise = (action.else as { actions?: Record<string, unknown> } | undefined)?.actions;
      if (otherwise !== undefined) walk(otherwise);
    }
  };
  walk(root);
}

function removeDefinitionActionsByRole(
  definition: Record<string, unknown>,
  rolePrefix: string,
): void {
  const root = (definition as any).properties.definition.actions as Record<string, unknown>;
  const walk = (actions: Record<string, unknown>): void => {
    for (const [id, value] of Object.entries(actions)) {
      const action = value as any;
      const role = action.metadata?.spflowRole;
      if (typeof role === "string" && (role === rolePrefix || role.startsWith(`${rolePrefix}:`))) {
        delete actions[id];
        continue;
      }
      if (action.actions !== undefined) walk(action.actions);
      if (action.else?.actions !== undefined) walk(action.else.actions);
    }
  };
  walk(root);
}

function configureFieldFixture(
  value: ProjectContract,
  definition: Record<string, unknown>,
  listId: string,
  internalName: string,
  changes: Record<string, unknown>,
): void {
  const list = value.sharePoint.lists.find(({ id }) => id === listId)!;
  const field = list.fields.find((candidate) => candidate.internalName === internalName)! as any;
  for (const optional of ["maxLength", "dateTimeMode", "choices", "lookupListId", "lookupField"]) {
    delete field[optional];
  }
  Object.assign(field, changes);

  const actions = new Map<string, any>();
  visitDefinitionActions(definition, (action) => {
    const role = (action.metadata as any)?.spflowRole;
    if (typeof role === "string") actions.set(role, action);
  });
  const suffix = `${listId.replaceAll("-", "_")}_${internalName}`;
  const readId = `FieldRead_${suffix}`;
  const readbackId = `FieldReadback_${suffix}`;
  const expected = {
    logicalName: field.logicalName,
    internalName: field.internalName,
    type: field.type,
    required: field.required,
    indexed: field.indexed,
    unique: field.unique,
    clientEditable: field.clientEditable,
    serverAuthoritative: field.serverAuthoritative,
    immutableAfterCreate: field.immutableAfterCreate,
    sensitive: field.sensitive,
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    ...(field.dateTimeMode === undefined ? {} : { dateTimeMode: field.dateTimeMode }),
    ...(field.choices === undefined ? {} : { choices: field.choices }),
    ...(field.lookupListId === undefined ? {} : { lookupListId: field.lookupListId }),
    ...(field.lookupField === undefined ? {} : { lookupField: field.lookupField }),
  };
  const literal = (value: unknown) => typeof value === "string"
    ? `'${value.replaceAll("'", "''")}'`
    : String(value);
  const comparison = (actionId: string) => `@and(`
    + `equals(body('${actionId}')['InternalName'],'${internalName}'),`
    + `equals(body('${actionId}')['EntityPropertyName'],'${internalName}'),`
    + `${Object.entries(expected).map(([name, property]) => Array.isArray(property)
      ? `equals(string(body('${actionId}')['${name}']),'${JSON.stringify(property)}')`
      : `equals(body('${actionId}')['${name}'],${literal(property)})`
    ).join(",")})`;
  const select = ["InternalName", "EntityPropertyName", ...Object.keys(expected)].join(",");
  const fieldPath = `/_api/web/lists/getbytitle('${list.titleBinding}')/fields/getbyinternalnameortitle('${internalName}')`;
  actions.get(`field-read:${listId}:${internalName}`).inputs.uri = `${fieldPath}?$select=${select}`;
  actions.get(`field-readback:${listId}:${internalName}`).inputs.uri = `${fieldPath}?$select=${select}`;
  actions.get(`field-found-assert:${listId}:${internalName}`).expression = comparison(readId);
  actions.get(`field-readback-assert:${listId}:${internalName}`).expression = comparison(readbackId);

  const payloadByType: Record<string, readonly [string, number]> = {
    Boolean: ["SP.FieldBoolean", 8], Choice: ["SP.FieldChoice", 6], Currency: ["SP.FieldCurrency", 10],
    DateTime: ["SP.FieldDateTime", 4], Guid: ["SP.FieldGuid", 14], Lookup: ["SP.FieldLookup", 7],
    Note: ["SP.FieldMultiLineText", 3], Number: ["SP.FieldNumber", 9], Text: ["SP.FieldText", 2],
    User: ["SP.FieldUser", 20],
  };
  const payload = payloadByType[field.type]!;
  actions.get(`field-write:${listId}:${internalName}`).inputs.body = {
    __metadata: { type: payload[0] },
    FieldTypeKind: payload[1],
    InternalName: field.internalName,
    Required: field.required,
    Indexed: field.indexed,
    EnforceUniqueValues: field.unique,
    ...(field.maxLength === undefined ? {} : { MaxLength: field.maxLength }),
    ...(field.dateTimeMode === undefined
      ? {}
      : { DisplayFormat: field.dateTimeMode === "DateOnly" ? 0 : 1 }),
    ...(field.choices === undefined ? {} : { Choices: { results: field.choices } }),
    ...(field.lookupListId === undefined ? {} : { LookupList: field.lookupListId }),
    ...(field.lookupField === undefined ? {} : { LookupField: field.lookupField }),
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
  const { graph, adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);
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

async function runBuiltCli(root: string): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly report: {
    readonly result: string;
    readonly diagnostics: readonly Array<{ readonly code: string }>;
  };
}> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [
      BUILT_CLI,
      "validate",
      "rules",
      "--root",
      root,
      "--required-only",
      "--format",
      "json",
    ], {
      cwd: REPOSITORY_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => stdout += chunk);
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => stderr += chunk);
    child.once("error", reject);
    child.once("close", (code) => {
      try {
        resolveResult({
          exitCode: code ?? -1,
          stdout,
          stderr,
          report: JSON.parse(stdout),
        });
      } catch (error) {
        reject(error);
      }
    });
  });
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

  test("raw OData fragments cannot create authority while the parameterized grammar can", async () => {
    const approvedRoot = await mkdtemp(join(tmpdir(), "spflow-odata-parameterized-"));
    const rawRoot = await mkdtemp(join(tmpdir(), "spflow-odata-raw-"));
    const value = contract(["SP-ODATA-001"], false);
    const rawSource = FRONTEND_SOURCE
      .replace(
        "export function buildSharePointODataUrl(base, listId, field, value) {",
        "export function buildSharePointODataUrl(base, listId, value) {",
      )
      .replace('  if (!fields.includes(field)) throw new Error("unknown-field");\n', "")
      .replace('  const escaped = String(value).replaceAll("\'", "\'\'");\n  params.set("$filter", `${field} eq \'${escaped}\'`);',
        '  params.set("$filter", value);');
    try {
      await writeContract(approvedRoot, value);
      await writeFrontend(approvedRoot);
      const approved = await validationContext(approvedRoot, value);
      assert.deepEqual(await diagnostics(approved, ["SP-ODATA-001"]), []);

      await writeContract(rawRoot, value);
      await writeFrontend(rawRoot, rawSource);
      const raw = await validationContext(rawRoot, value);
      assert.equal(raw.adapterEvidence.wp06Derivations?.some(({ section }) => section === "odataRequests"), false);
      assert.deepEqual(
        (await diagnostics(raw, ["SP-ODATA-001"])).map(({ code }) => code),
        ["SP-ODATA-001"],
      );
    } finally {
      await rm(approvedRoot, { recursive: true, force: true });
      await rm(rawRoot, { recursive: true, force: true });
    }
  });

  test("a GET without a field-by-field assertion is not semantic save readback", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-save-nonsemantic-readback-"));
    const value = contract(["APP-SAVE-001"], false);
    const nonSemantic = FRONTEND_SOURCE.replace(
      '  if (!Object.entries(body).every(([field, value]) => Object.is(current[field], value))) throw new Error("readback-mismatch");',
      '  if (false) throw new Error("readback-mismatch");',
    );
    try {
      await writeContract(root, value);
      await writeFrontend(root, nonSemantic);
      const context = await validationContext(root, value);

      assert.equal(context.adapterEvidence.wp06Derivations?.some(({ section }) => section === "saveTransactions"), false);
      assert.deepEqual(
        (await diagnostics(context, ["APP-SAVE-001"])).map(({ code }) => code),
        ["APP-SAVE-001"],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("unreachable frontend tokens cannot create trusted evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-frontend-unreachable-"));
    const value = contract(FRONTEND_RULES, false);
    const unreachable = FRONTEND_SOURCE
      .replace(
        "export async function saveSharePointItem(listId, itemUrl, etag, patch) {",
        "export async function saveSharePointItem(listId, itemUrl, etag, patch) { return undefined;",
      )
      .replace(
        "export async function loadAllSharePointPages(initialUrl, expectedOrigin, expectedPathname) {",
        "export async function loadAllSharePointPages(initialUrl, expectedOrigin, expectedPathname) { return [];",
      )
      .replace(
        "export function buildSharePointODataUrl(base, listId, value) {",
        "export function buildSharePointODataUrl(base, listId, value) { return base;",
      );
    try {
      await writeContract(root, value);
      await writeFrontend(root, unreachable);
      const context = await validationContext(root, value);

      assert.equal(context.adapterEvidence.wp06Derivations?.length, 0);
      assert.deepEqual(
        (await diagnostics(context, FRONTEND_RULES)).map(({ code }) => code),
        FRONTEND_RULES,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("unconditional conditional exits before frontend behavior fail closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-frontend-conditional-exit-"));
    const value = contract(FRONTEND_RULES, false);
    const unreachable = FRONTEND_SOURCE
      .replace(
        "export async function saveSharePointItem(listId, itemUrl, etag, patch) {",
        "export async function saveSharePointItem(listId, itemUrl, etag, patch) { if (true) return undefined;",
      )
      .replace(
        "export async function loadAllSharePointPages(initialUrl, expectedOrigin, expectedPathname) {",
        "export async function loadAllSharePointPages(initialUrl, expectedOrigin, expectedPathname) { if (true) return [];",
      )
      .replace(
        "export function buildSharePointODataUrl(base, listId, value) {",
        "export function buildSharePointODataUrl(base, listId, value) { if (true) return base;",
      );
    try {
      await writeContract(root, value);
      await writeFrontend(root, unreachable);
      const context = await validationContext(root, value);

      assert.equal(context.adapterEvidence.wp06Derivations?.length, 0);
      assert.deepEqual(
        (await diagnostics(context, FRONTEND_RULES)).map(({ code }) => code),
        FRONTEND_RULES,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("shadowed globalThis, unreachable conflict handling, and parser errors fail closed", async () => {
    const scenarios = [
      `const globalThis = Object.freeze({ fetch: async () => ({ ok: true }) });\n${FRONTEND_SOURCE}`,
      FRONTEND_SOURCE.replace(
        'if (response.status === 412) throw new Error("conflict");',
        'if (response.status === 412) { return globalThis.fetch(itemUrl, { method: "GET" }); throw new Error("conflict"); }',
      ),
      `${FRONTEND_SOURCE}\nexport const malformed = ;\n`,
      `const frontendBehaviorDecoy = ${JSON.stringify(FRONTEND_SOURCE)};\n`,
    ];
    for (const source of scenarios) {
      const root = await mkdtemp(join(tmpdir(), "spflow-raw-frontend-fail-closed-"));
      const value = contract(FRONTEND_RULES, false);
      try {
        await writeContract(root, value);
        await writeFrontend(root, source);
        const context = await validationContext(root, value);

        assert.equal(context.adapterEvidence.wp06Derivations?.length, 0);
        assert.deepEqual(
          (await diagnostics(context, FRONTEND_RULES)).map(({ code }) => code),
          FRONTEND_RULES,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("shadowed fetch and unreachable loop behavior cannot create frontend authority", async () => {
    for (const source of [
      `function fetch() { return { ok: true, json: async () => ({}) }; }\n${FRONTEND_SOURCE.replaceAll("globalThis.fetch", "fetch")}`,
      FRONTEND_SOURCE.replace("while (next) {", "while (next) { if (true) break;"),
    ]) {
      const root = await mkdtemp(join(tmpdir(), "spflow-raw-frontend-shadowed-"));
      const value = contract(FRONTEND_RULES, false);
      try {
        await writeContract(root, value);
        await writeFrontend(root, source);
        const context = await validationContext(root, value);

        assert.equal(context.adapterEvidence.wp06Derivations?.length, 0);
        assert.deepEqual(
          (await diagnostics(context, FRONTEND_RULES)).map(({ code }) => code),
          FRONTEND_RULES,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
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

  test("normalized definition and safely inspected ZIP cover every builder section", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-"));
    const value = contract(BUILDER_RULES, true);
    try {
      await writeContract(root, value);
      await writeBuilder(root, builderDefinition());
      const context = await validationContext(root, value);

      assert.equal(context.adapterEvidence.definitions?.[0]?.failure, undefined);
      assert.equal(context.adapterEvidence.packages[0]?.inspection?.valid, true);
      assert.equal(context.adapterEvidence.wp06Derivations?.length, 6);
      assert.deepEqual(await diagnostics(context, BUILDER_RULES), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("compiled CLI process validates all fourteen WP06 rules from raw artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-built-cli-"));
    const ruleIds = [...FRONTEND_RULES, ...BUILDER_RULES].sort();
    const value = contract(ruleIds, true);
    try {
      await writeContract(root, value);
      await writeFrontend(root);
      await writeBuilder(root, builderDefinition());

      const result = await runBuiltCli(root);

      assert.equal(result.exitCode, 0, result.stdout);
      assert.equal(result.report.result, "PASS", result.stdout);
      assert.deepEqual(result.report.diagnostics, []);
      assert.equal(result.stderr, "");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a contract without indexes preserves unrelated builder derivations", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-no-index-"));
    const value = contract(BUILDER_RULES.filter((ruleId) => !ruleId.startsWith("SP-INDEX-")), true);
    value.sharePoint.lists[0]!.indexes = [];
    const definition = builderDefinition() as any;
    const actions = definition.properties.definition.actions;
    delete actions.IndexRead;
    delete actions.IndexCurrentAssert;
    try {
      await writeContract(root, value);
      await writeBuilder(root, definition);
      const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

      assert.deepEqual(
        adapterEvidence.wp06Derivations?.map(({ section }) => section).sort(),
        [
          "authorityChecks",
          "fieldOperations",
          "httpClassifications",
          "permissionModels",
          "permissionProbes",
        ],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("inert builder tokens and no-op connector URIs cannot create trusted evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-inert-"));
    const value = contract(BUILDER_RULES, true);
    try {
      await writeContract(root, value);
      await writeBuilder(root, inertBuilderDefinition());
      const context = await validationContext(root, value);

      assert.equal(context.adapterEvidence.wp06Derivations?.length, 0);
      assert.deepEqual(
        (await diagnostics(context, BUILDER_RULES)).map(({ code }) => code),
        BUILDER_RULES,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("canonical SharePoint endpoints hidden inside no-op URIs fail closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-noop-prefix-"));
    const value = contract(BUILDER_RULES, true);
    const definition = builderDefinition();
    visitDefinitionActions(definition, (action) => {
      const inputs = action.inputs as Record<string, unknown> | undefined;
      if (typeof inputs?.uri === "string") {
        inputs.uri = `/_api/noop?claimed=${inputs.uri}`;
      }
    });
    try {
      await writeContract(root, value);
      await writeBuilder(root, definition);
      const context = await validationContext(root, value);

      assert.equal(context.adapterEvidence.wp06Derivations?.length, 0);
      assert.deepEqual(
        (await diagnostics(context, BUILDER_RULES)).map(({ code }) => code),
        BUILDER_RULES,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("canonical endpoint parsing rejects absolute, suffixed, and duplicate-query identities", async () => {
    for (const uri of [
      "https://synthetic.example.test/_api/web/currentuser?$select=Id,LoginName",
      "/_api/web/currentuser/claimed?$select=Id,LoginName",
      "/_api/web/currentuser?$select=Id,LoginName&$select=Id,LoginName",
    ]) {
      const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-noncanonical-"));
      const value = contract(BUILDER_RULES, true);
      const definition = builderDefinition() as any;
      definition.properties.definition.actions.IdentityRead.inputs.uri = uri;
      try {
        await writeContract(root, value);
        await writeBuilder(root, definition);
        const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

        assert.equal(
          adapterEvidence.wp06Derivations?.some(({ section }) => section === "authorityChecks"),
          false,
          uri,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("builder sections require dominating actions and response data flow", async () => {
    const scenarios = [
      {
        section: "authorityChecks",
        mutate(actions: any) {
          actions.AuthorizationGuard.runAfter = {};
        },
      },
      {
        section: "permissionModels",
        mutate(actions: any) {
          actions.PermissionGrantProtected.runAfter = { PermissionModelProtected: ["Succeeded"] };
        },
      },
      {
        section: "httpClassifications",
        mutate(actions: any) {
          actions.HttpClassifier.expression = "@equals(outputs('TargetRead')['statusCode'],400)";
        },
      },
      {
        section: "indexPlans",
        mutate(actions: any) {
          actions.IndexCurrentAssert.actions.IndexPlanDigest.inputs = "@sha256('Title')";
        },
      },
    ] as const;
    for (const scenario of scenarios) {
      const root = await mkdtemp(join(tmpdir(), `spflow-raw-builder-${scenario.section}-`));
      const value = contract(BUILDER_RULES, true);
      const definition = builderDefinition() as any;
      scenario.mutate(definition.properties.definition.actions);
      try {
        await writeContract(root, value);
        await writeBuilder(root, definition);
        const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

        assert.equal(
          adapterEvidence.wp06Derivations?.some(({ section }) => section === scenario.section),
          false,
          scenario.section,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("schema creation without response branches and post-write readback fails closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-schema-branches-"));
    const value = contract(BUILDER_RULES, true);
    const definition = builderDefinition() as any;
    const actions = definition.properties.definition.actions;
    const found = actions.FieldFound_protected_items_Title;
    const write = found.else.actions.FieldMissing_protected_items_Title
      .actions.FieldWrite_protected_items_Title;
    write.runAfter = { FieldRead_protected_items_Title: ["Succeeded"] };
    actions.FieldWrite_protected_items_Title = write;
    delete actions.FieldFound_protected_items_Title;
    try {
      await writeContract(root, value);
      await writeBuilder(root, definition);
      const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

      assert.equal(
        adapterEvidence.wp06Derivations?.some(({ section }) => section === "fieldOperations"),
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("schema creation payload must include every contract-required property", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-schema-payload-"));
    const value = contract(BUILDER_RULES, true);
    const definition = builderDefinition();
    visitDefinitionActions(definition, (action) => {
      if ((action.metadata as any)?.spflowRole === "field-write:protected-items:Title") {
        const body = (action.inputs as any).body;
        delete body.Required;
        delete body.MaxLength;
      }
    });
    try {
      await writeContract(root, value);
      await writeBuilder(root, definition);
      const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

      assert.equal(
        adapterEvidence.wp06Derivations?.some(({ section }) => section === "fieldOperations"),
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("Choice, Lookup, and DateTime fields require complete type-specific comparison and create payloads", async () => {
    const validRoot = await mkdtemp(join(tmpdir(), "spflow-raw-builder-schema-types-valid-"));
    const value = contract(["SP-SCHEMA-001", "SP-SCHEMA-002", "SP-SCHEMA-003"], true);
    const definition = builderDefinition();
    configureFieldFixture(value, definition, "protected-items", "Title", {
      type: "Choice",
      choices: ["Open", "Closed"],
    });
    configureFieldFixture(value, definition, "access-control", "PrincipalKey", {
      type: "Lookup",
      lookupListId: "protected-items",
      lookupField: "Title",
    });
    configureFieldFixture(value, definition, "protected-items", "Amount", {
      type: "DateTime",
      dateTimeMode: "DateOnly",
    });
    try {
      await writeContract(validRoot, value);
      await writeBuilder(validRoot, definition);
      const context = await validationContext(validRoot, value);
      assert.equal(context.adapterEvidence.wp06Derivations?.some(({ section }) => section === "fieldOperations"), true);
      assert.deepEqual(await diagnostics(context, ["SP-SCHEMA-001", "SP-SCHEMA-002", "SP-SCHEMA-003"]), []);
    } finally {
      await rm(validRoot, { recursive: true, force: true });
    }

    for (const scenario of ["choices", "lookup", "date-time"] as const) {
      const root = await mkdtemp(join(tmpdir(), `spflow-raw-builder-schema-${scenario}-`));
      const mutatedValue = contract(["SP-SCHEMA-001", "SP-SCHEMA-002", "SP-SCHEMA-003"], true);
      const mutated = builderDefinition();
      configureFieldFixture(mutatedValue, mutated, "protected-items", "Title", {
        type: "Choice",
        choices: ["Open", "Closed"],
      });
      configureFieldFixture(mutatedValue, mutated, "access-control", "PrincipalKey", {
        type: "Lookup",
        lookupListId: "protected-items",
        lookupField: "Title",
      });
      configureFieldFixture(mutatedValue, mutated, "protected-items", "Amount", {
        type: "DateTime",
        dateTimeMode: "DateOnly",
      });
      visitDefinitionActions(mutated, (action) => {
        const role = (action.metadata as any)?.spflowRole;
        if (scenario === "choices" && role === "field-write:protected-items:Title") {
          delete (action.inputs as any).body.Choices;
        }
        if (scenario === "lookup" && role === "field-write:access-control:PrincipalKey") {
          delete (action.inputs as any).body.LookupField;
        }
        if (scenario === "date-time" && role === "field-write:protected-items:Amount") {
          delete (action.inputs as any).body.DisplayFormat;
        }
      });
      try {
        await writeContract(root, mutatedValue);
        await writeBuilder(root, mutated);
        const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, mutatedValue);
        assert.equal(
          adapterEvidence.wp06Derivations?.some(({ section }) => section === "fieldOperations"),
          false,
          scenario,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("unlabelled writes inside trusted schema or index branches fail closed", async () => {
    for (const section of ["fieldOperations", "indexPlans"] as const) {
      const root = await mkdtemp(join(tmpdir(), `spflow-raw-builder-extra-${section}-`));
      const value = contract(BUILDER_RULES, true);
      const definition = builderDefinition() as any;
      const actions = definition.properties.definition.actions;
      const branch = section === "fieldOperations"
        ? actions.FieldFound_protected_items_Title.else.actions.FieldMissing_protected_items_Title.actions
        : actions.IndexCurrentAssert.actions;
      branch.UnlabelledWrite = semanticConnector(
        "unrelated-write",
        "POST",
        "/_api/web/lists/getbytitle('PROTECTED_ITEMS')/fields",
        {},
      );
      delete branch.UnlabelledWrite.metadata;
      try {
        await writeContract(root, value);
        await writeBuilder(root, definition);
        const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

        assert.equal(
          adapterEvidence.wp06Derivations?.some(({ section: derived }) => derived === section),
          false,
          section,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("compiled CLI rejects flow-wide index, schema, permission, and protected-item bypass writes", async () => {
    const protectedUri = "/_api/web/lists/getbytitle('PROTECTED_ITEMS')";
    for (const scenario of ["index", "schema", "permission", "protected-item"] as const) {
      const root = await mkdtemp(join(tmpdir(), `spflow-raw-builder-bypass-${scenario}-`));
      const value = contract(BUILDER_RULES, true);
      const definition = builderDefinition() as any;
      const actions = definition.properties.definition.actions;
      const bypass = scenario === "index"
        ? semanticConnector("bypass", "POST", `${protectedUri}/fields/getbyinternalnameortitle('Title')`, {}, undefined, {
          body: { __metadata: { type: "SP.Field" }, Indexed: false },
        })
        : scenario === "schema"
        ? semanticConnector("bypass", "POST", `${protectedUri}/fields`, {}, undefined, {
          body: { __metadata: { type: "SP.FieldText" }, FieldTypeKind: 2, InternalName: "Bypass" },
        })
        : scenario === "permission"
        ? semanticConnector("bypass", "POST", `${protectedUri}/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=false)`, {})
        : semanticConnector("bypass", "POST", `${protectedUri}/items(1)`, {}, undefined, {
          headers: { "X-HTTP-Method": "MERGE", "IF-MATCH": "*" },
          body: { Status: "Bypassed" },
        });
      delete (bypass as any).metadata;
      actions[`Bypass_${scenario.replace("-", "_")}`] = bypass;
      try {
        await writeContract(root, value);
        await writeBuilder(root, definition);
        const result = await runBuiltCli(root);

        assert.notEqual(result.exitCode, 0, `${scenario}: ${result.stdout}`);
        assert.equal(result.report.result, "FAIL", `${scenario}: ${result.stdout}`);
        assert.ok(result.report.diagnostics.length > 0, scenario);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("a forged mutation role cannot extend the exact approved action set", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-forged-mutation-role-"));
    const value = contract(BUILDER_RULES, true);
    const definition = builderDefinition() as any;
    definition.properties.definition.actions.ForgedFieldWrite = semanticConnector(
      "field-write:protected-items:Bypass",
      "POST",
      "/_api/web/lists/getbytitle('PROTECTED_ITEMS')/fields",
      {},
      undefined,
      { body: { __metadata: { type: "SP.FieldText" }, FieldTypeKind: 2, InternalName: "Bypass" } },
    );
    try {
      await writeContract(root, value);
      await writeBuilder(root, definition);
      const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

      assert.equal(adapterEvidence.wp06Derivations?.length, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("required-only index reads without removals and full readbacks fail closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-index-complete-state-"));
    const value = contract(BUILDER_RULES, true);
    const definition = builderDefinition() as any;
    definition.properties.definition.actions.IndexRead.inputs.uri =
      "/_api/web/lists/getbytitle('PROTECTED_ITEMS')/fields?$select=InternalName,Indexed&$filter=InternalName eq 'Title'&$orderby=InternalName";
    removeDefinitionActionsByRole(definition, "index-remove");
    try {
      await writeContract(root, value);
      await writeBuilder(root, definition);
      const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

      assert.equal(
        adapterEvidence.wp06Derivations?.some(({ section }) => section === "indexPlans"),
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a compatible complete index read emits a zero-write NO_OP plan", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-index-noop-"));
    const value = contract(["SP-INDEX-001", "SP-INDEX-002"], true);
    try {
      await writeContract(root, value);
      await writeBuilder(root, builderDefinition("NO_OP"));
      const context = await validationContext(root, value);
      const plan = context.adapterEvidence.wp06Derivations
        ?.find(({ section }) => section === "indexPlans")?.facts[0] as any;

      assert.equal(plan?.result, "NO_OP");
      assert.deepEqual(plan?.currentFields, ["Title"]);
      assert.equal(plan?.writeCount, 0);
      assert.deepEqual(plan?.operations, []);
      assert.deepEqual(await diagnostics(context, ["SP-INDEX-001", "SP-INDEX-002"]), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("index writes require an approved digest assertion and an output-bound result", async () => {
    for (const scenario of ["missing-assertion", "unbound-result"] as const) {
      const root = await mkdtemp(join(tmpdir(), `spflow-raw-builder-index-${scenario}-`));
      const value = contract(["SP-INDEX-001", "SP-INDEX-002"], true);
      const definition = builderDefinition() as any;
      const actions = definition.properties.definition.actions.IndexCurrentAssert.actions;
      if (scenario === "missing-assertion") {
        delete actions.IndexPlanAssert;
        actions.IndexRequestDigest.runAfter = { IndexPlanDigest: ["Succeeded"] };
      } else {
        actions.IndexResult.inputs = "APPLY";
      }
      try {
        await writeContract(root, value);
        await writeBuilder(root, definition);
        const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

        assert.equal(
          adapterEvidence.wp06Derivations?.some(({ section }) => section === "indexPlans"),
          false,
          scenario,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("authorization cannot claim owner or amount absent from the target read", async () => {
    for (const scenario of ["missing-fields", "unused-fields"] as const) {
      const root = await mkdtemp(join(tmpdir(), `spflow-raw-builder-authority-${scenario}-`));
      const value = contract(BUILDER_RULES, true);
      const definition = builderDefinition() as any;
      const actions = definition.properties.definition.actions;
      if (scenario === "missing-fields") {
        actions.TargetRead.inputs.uri =
          "/_api/web/lists/getbytitle('PROTECTED_ITEMS')/items(@{triggerBody()['TargetItemId']})?$select=Title,Status";
      } else {
        actions.AuthorizationGuard.expression =
          "@and(equals(length(body('CapabilityRead')['value']),1),equals(body('CapabilityRead')['value'][0]['Title'],body('TargetRead')['Title']),equals(triggerBody()['CommandType'],'apply-change'),equals(body('TargetRead')['Status'],'Pending'))";
      }
      try {
        await writeContract(root, value);
        await writeBuilder(root, definition);
        const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

        assert.equal(
          adapterEvidence.wp06Derivations?.some(({ section }) => section === "authorityChecks"),
          false,
          scenario,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("permission claims without executable grant assignments fail closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-no-grants-"));
    const value = contract(BUILDER_RULES, true);
    const definition = builderDefinition();
    removeDefinitionActionsByRole(definition, "permission-grant");
    try {
      await writeContract(root, value);
      await writeBuilder(root, definition);
      const context = await validationContext(root, value);

      assert.equal(
        context.adapterEvidence.wp06Derivations?.some(({ section }) =>
          section === "permissionModels" || section === "permissionProbes"
        ),
        false,
      );
      assert.deepEqual(
        (await diagnostics(context, ["SP-ACL-001", "SP-ACL-002"])).map(({ code }) => code),
        ["SP-ACL-001", "SP-ACL-002"],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("permission inheritance is derived from executable settings, not the contract claim", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-permission-inheritance-"));
    const value = contract(["SP-ACL-001", "SP-ACL-002"], true);
    value.sharePoint.lists[0]!.permissions.inheritance = "inherit";
    const definition = builderDefinition();
    try {
      await writeContract(root, value);
      await writeBuilder(root, definition);
      const context = await validationContext(root, value);

      assert.equal(
        context.adapterEvidence.wp06Derivations?.some(({ section }) =>
          section === "permissionModels" || section === "permissionProbes"
        ),
        false,
      );
      assert.deepEqual(
        (await diagnostics(context, ["SP-ACL-001", "SP-ACL-002"])).map(({ code }) => code),
        ["SP-ACL-001", "SP-ACL-002"],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("tautological HTTP classification does not prove response semantics", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-http-tautology-"));
    const value = contract(BUILDER_RULES, true);
    const definition = builderDefinition();
    visitDefinitionActions(definition, (action) => {
      if ((action.metadata as any)?.spflowRole === "http-classifier") {
        action.expression = "@and(equals(400,400),equals('-2147024809','-2147024809'),equals(404,404),equals('preflight','preflight'),equals('initial-get','initial-get'))";
      }
    });
    try {
      await writeContract(root, value);
      await writeBuilder(root, definition);
      const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

      assert.equal(
        adapterEvidence.wp06Derivations?.some(({ section }) => section === "httpClassifications"),
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("index parameters without executable guards and readback assertions fail closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-builder-index-parameters-"));
    const value = contract(BUILDER_RULES, true);
    const definition = builderDefinition();
    for (const role of ["index-plan-guard", "index-plan-digest", "index-step-assert", "index-final-assert"]) {
      removeDefinitionActionsByRole(definition, role);
    }
    try {
      await writeContract(root, value);
      await writeBuilder(root, definition);
      const { adapterEvidence } = await inspectTrustedProjectArtifacts(root, value);

      assert.equal(
        adapterEvidence.wp06Derivations?.some(({ section }) => section === "indexPlans"),
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fabricated or rebound adapter evidence cannot mint trusted graph nodes", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-fabricated-evidence-"));
    const value = contract(["APP-SAVE-001"], false);
    try {
      await writeContract(root, value);
      const fabricated = {
        packages: [],
        flows: [],
        wp06Derivations: [{
          adapterId: "spflow.frontend-source-v2",
          adapterVersion: 2,
          contractRevision: 2,
          sourceKind: "frontend",
          section: "saveTransactions",
          sourceArtifactPath: "unrelated.js",
          sourceArtifactSha256: "0".repeat(64),
          sourceArtifactBytes: 1,
          facts: [{ listId: "protected-items" }],
        }],
      };
      const inspect = inspectTrustedProjectArtifacts as unknown as (
        ...args: readonly unknown[]
      ) => Promise<Awaited<ReturnType<typeof inspectTrustedProjectArtifacts>>>;
      const { graph, adapterEvidence } = await inspect(root, value, fabricated);
      const context: ValidationContext = {
        root,
        offline: true,
        contract: value,
        graph: graph.toJSON(),
        adapterEvidence,
      };

      assert.equal(adapterEvidence.wp06Derivations?.length, 0);
      assert.equal(graph.toJSON().nodes.some(({ sourceProfile }) =>
        sourceProfile.startsWith("wp06-trusted")
      ), false);
      assert.deepEqual(
        (await diagnostics(context, ["APP-SAVE-001"])).map(({ code }) => code),
        ["APP-SAVE-001"],
      );
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
          definition.properties.definition.actions.AuthorizationGuard.actions.Mutation.inputs.method = "GET";
        }
        if (scenario === "definition-lineage-mutation") {
          delete definition.properties.definition.actions.AuthorizationGuard.runAfter;
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
