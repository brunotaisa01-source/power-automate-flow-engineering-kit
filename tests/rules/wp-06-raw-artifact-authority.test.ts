import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";

import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";
import { loadOfflineValidationContext } from "../../packages/cli/dist/commands/offline-validation.js";
import { inspectTrustedProjectArtifacts } from "../../packages/package-adapters/dist/solution-v1.js";
import {
  ruleRegistry,
  type ValidationContext,
} from "../../packages/rules/src/registry.ts";
import { validateRules as validateBuiltRules } from "../../packages/rules/dist/registry.js";
import { syntheticSolution } from "../artifacts/synthetic-solution.ts";

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
const PATCH_ALLOWLISTS = Object.freeze({ "protected-items": Object.freeze(["Title"]) });
const READ_ALLOWLISTS = Object.freeze({ "protected-items": Object.freeze(["ID", "Title"]) });

function allowlistedPatch(listId, patch) {
  const fields = PATCH_ALLOWLISTS[listId];
  if (!fields) throw new Error("unknown-list");
  return Object.fromEntries(fields.map((field) => [field, patch[field]]));
}

async function freshDigest(itemUrl) {
  const response = await fetch(new URL("/_api/contextinfo", itemUrl), { method: "POST" });
  const body = await response.json();
  return body.FormDigestValue;
}

export async function saveSharePointItem(listId, itemUrl, etag, patch) {
  const body = allowlistedPatch(listId, patch);
  const digest = await freshDigest(itemUrl);
  const response = await fetch(itemUrl, {
    method: "POST",
    headers: {
      "X-HTTP-Method": "MERGE",
      "IF-MATCH": etag,
      "X-RequestDigest": digest
    },
    body: JSON.stringify(body)
  });
  if (response.status === 412) throw new Error("conflict");
  if (!response.ok) return fetch(itemUrl, { method: "GET" });
  return fetch(itemUrl, { method: "GET" });
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
    const response = await fetch(pageUrl, { method: "GET" });
    const body = await response.json();
    items.push(...body.value);
    next = body["@odata.nextLink"];
  }
  return items;
}

export function buildSharePointODataUrl(base, listId, value) {
  const fields = READ_ALLOWLISTS[listId];
  if (!fields) throw new Error("unknown-list");
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

function builderDefinition(): Record<string, unknown> {
  const protectedUri = "/_api/web/lists/getbytitle('PROTECTED_ITEMS')";
  const accessUri = "/_api/web/lists/getbytitle('ACCESS_CONTROL')";
  const commonProperties = [
    "logicalName", "internalName", "type", "required", "indexed", "unique",
    "clientEditable", "serverAuthoritative", "immutableAfterCreate", "sensitive",
  ];
  const fieldActions: Record<string, unknown> = {};
  let fieldPredecessor = "PermissionAssertAccess";
  for (const field of [
    {
      listId: "protected-items", listUri: protectedUri, logicalName: "title",
      internalName: "Title", metadataType: "SP.FieldText", fieldTypeKind: 2,
      indexMetadataType: "SP.Field", comparedProperties: [...commonProperties, "maxLength"],
    },
    {
      listId: "protected-items", listUri: protectedUri, logicalName: "status",
      internalName: "Status", metadataType: "SP.FieldText", fieldTypeKind: 2,
      comparedProperties: [...commonProperties, "maxLength"],
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "active",
      internalName: "Active", metadataType: "SP.FieldBoolean", fieldTypeKind: 8,
      comparedProperties: commonProperties,
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "principal-key",
      internalName: "PrincipalKey", metadataType: "SP.FieldText", fieldTypeKind: 2,
      comparedProperties: [...commonProperties, "maxLength"],
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "capability",
      internalName: "Capability", metadataType: "SP.FieldText", fieldTypeKind: 2,
      comparedProperties: [...commonProperties, "maxLength"],
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "scope-title",
      internalName: "Title", metadataType: "SP.FieldText", fieldTypeKind: 2,
      comparedProperties: [...commonProperties, "maxLength"],
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "target-item-id",
      internalName: "TargetItemId", metadataType: "SP.FieldNumber", fieldTypeKind: 9,
      comparedProperties: commonProperties,
    },
    {
      listId: "access-control", listUri: accessUri, logicalName: "command-type",
      internalName: "CommandType", metadataType: "SP.FieldText", fieldTypeKind: 2,
      comparedProperties: [...commonProperties, "maxLength"],
    },
  ]) {
    const suffix = `${field.listId.replaceAll("-", "_")}_${field.internalName}`;
    const readId = `FieldRead_${suffix}`;
    const writeId = `FieldWrite_${suffix}`;
    fieldActions[readId] = semanticConnector(
      `field-read:${field.listId}:${field.internalName}`,
      "GET",
      `${field.listUri}/fields/getbyinternalnameortitle('${field.internalName}')`,
      { listId: field.listId, internalName: field.internalName },
      fieldPredecessor,
    );
    fieldActions[writeId] = semanticConnector(
      `field-write:${field.listId}:${field.internalName}`,
      "POST",
      `${field.listUri}/fields`,
      {
        listId: field.listId,
        logicalName: field.logicalName,
        internalName: field.internalName,
        metadataType: field.metadataType,
        fieldTypeKind: field.fieldTypeKind,
        ...(field.indexMetadataType === undefined ? {} : { indexMetadataType: field.indexMetadataType }),
        comparedProperties: field.comparedProperties,
      },
      readId,
      {
        body: {
          __metadata: { type: field.metadataType },
          FieldTypeKind: field.fieldTypeKind,
          InternalName: field.internalName,
        },
      },
    );
    fieldPredecessor = writeId;
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
            `${accessUri}/items?$select=Active,PrincipalKey,Capability,Title&$filter=Active eq 1`,
            {
              listId: "access-control",
              capabilityId: "approve-items",
              activeField: "Active",
              principalField: "PrincipalKey",
              capabilityField: "Capability",
              principalSource: "IdentityRead.LoginName",
              matchCardinality: "one",
            },
            "IdentityRead",
          ),
          TargetRead: semanticConnector(
            "target-read",
            "GET",
            `${protectedUri}/items(@{triggerBody()?['TargetItemId']})?$select=Title,Status`,
            {
              listId: "protected-items",
              itemIdSource: "trigger.TargetItemId",
              fields: ["Title", "Status"],
            },
            "CapabilityRead",
          ),
          AuthorizationGuard: {
            type: "If",
            metadata: { spflowRole: "authorization-guard" },
            runAfter: { TargetRead: ["Succeeded"] },
            expression: "@and(equals(length(body('CapabilityRead')?['value']),1),equals(first(body('CapabilityRead')?['value'])?['Title'],body('TargetRead')?['Title']),equals(triggerBody()?['CommandType'],'apply-change'),equals(body('TargetRead')?['Status'],'Pending'))",
            actions: {
              Mutation: semanticConnector(
                "mutation",
                "POST",
                `${protectedUri}/items(@{triggerBody()?['TargetItemId']})`,
                {
                  listId: "protected-items",
                  commandType: "apply-change",
                  transitionId: "apply-transition",
                  stateFrom: "Pending",
                  stateTo: "Applied",
                  scopeTargetField: "Title",
                  scopeAccessField: "Title",
                },
                undefined,
                {
                  headers: {
                    "X-HTTP-Method": "MERGE",
                    "IF-MATCH": "@{body('TargetRead')?['@odata.etag']}",
                  },
                  body: { Status: "Applied" },
                },
              ),
            },
            else: { actions: {} },
          },
          PermissionModelProtected: semanticConnector(
            "permission-model:protected-items",
            "POST",
            `${protectedUri}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`,
            {
              listId: "protected-items",
              inheritance: "break-clear",
              directUserGrants: "forbidden",
              browserOperations: ["read", "update"],
              grants: [{
                principalKind: "binding",
                principalBinding: "PROCESSOR",
                role: "processor",
                allowedOperations: ["read", "update"],
              }],
            },
            "AuthorizationGuard",
          ),
          PermissionReadbackProtected: semanticConnector(
            "permission-readback:protected-items",
            "GET",
            `${protectedUri}/roleassignments?$expand=Member,RoleDefinitionBindings`,
            { listId: "protected-items" },
            "PermissionModelProtected",
          ),
          PermissionProbeProtected: semanticConnector(
            "permission-probe:protected-items:PROCESSOR",
            "GET",
            `${protectedUri}/getusereffectivepermissions(@p)?@p='PROCESSOR'`,
            {
              listId: "protected-items",
              principalBinding: "PROCESSOR",
              operations: { create: false, delete: false, read: true, update: true },
            },
            "PermissionReadbackProtected",
          ),
          PermissionAssertProtected: {
            type: "If",
            metadata: { spflowRole: "permission-assert:protected-items:PROCESSOR" },
            runAfter: { PermissionProbeProtected: ["Succeeded"] },
            expression: "@and(equals(body('PermissionProbeProtected')?['operations/read'],true),equals(body('PermissionProbeProtected')?['operations/update'],true),equals(body('PermissionProbeProtected')?['operations/create'],false),equals(body('PermissionProbeProtected')?['operations/delete'],false))",
            actions: {},
            else: { actions: {} },
          },
          PermissionModelAccess: semanticConnector(
            "permission-model:access-control",
            "POST",
            `${accessUri}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`,
            {
              listId: "access-control",
              inheritance: "break-clear",
              directUserGrants: "forbidden",
              browserOperations: [],
              grants: [{
                principalKind: "binding",
                principalBinding: "PROCESSOR",
                role: "processor",
                allowedOperations: ["read"],
              }],
            },
            "PermissionAssertProtected",
          ),
          PermissionReadbackAccess: semanticConnector(
            "permission-readback:access-control",
            "GET",
            `${accessUri}/roleassignments?$expand=Member,RoleDefinitionBindings`,
            { listId: "access-control" },
            "PermissionModelAccess",
          ),
          PermissionProbeAccess: semanticConnector(
            "permission-probe:access-control:PROCESSOR",
            "GET",
            `${accessUri}/getusereffectivepermissions(@p)?@p='PROCESSOR'`,
            {
              listId: "access-control",
              principalBinding: "PROCESSOR",
              operations: { create: false, delete: false, read: true, update: false },
            },
            "PermissionReadbackAccess",
          ),
          PermissionAssertAccess: {
            type: "If",
            metadata: { spflowRole: "permission-assert:access-control:PROCESSOR" },
            runAfter: { PermissionProbeAccess: ["Succeeded"] },
            expression: "@and(equals(body('PermissionProbeAccess')?['operations/read'],true),equals(body('PermissionProbeAccess')?['operations/update'],false),equals(body('PermissionProbeAccess')?['operations/create'],false),equals(body('PermissionProbeAccess')?['operations/delete'],false))",
            actions: {},
            else: { actions: {} },
          },
          ...fieldActions,
          HttpClassifier: {
            type: "If",
            metadata: { spflowRole: "http-classifier" },
            runAfter: { [fieldPredecessor]: ["Succeeded"] },
            expression: "@and(equals(400,400),equals('-2147024809','-2147024809'),equals(404,404),equals('preflight','preflight'),equals('initial-get','initial-get'))",
            actions: {},
            else: { actions: {} },
          },
          IndexRead: semanticConnector(
            "index-read:protected-items",
            "GET",
            `${protectedUri}/fields?$select=InternalName,Indexed`,
            { listId: "protected-items", currentFields: [], requiredFields: ["Title"] },
            "HttpClassifier",
          ),
          DigestRead: semanticConnector(
            "index-digest:protected-items",
            "POST",
            "/_api/contextinfo",
            { listId: "protected-items", bindsCurrent: true, bindsRequired: true },
            "IndexRead",
          ),
          IndexWrite: semanticConnector(
            "index-write:protected-items:Title",
            "POST",
            `${protectedUri}/fields/getbyinternalnameortitle('Title')`,
            { listId: "protected-items", field: "Title", operation: "add", sequence: 1 },
            "DigestRead",
            {
              headers: { "X-RequestDigest": "@{body('DigestRead')?['FormDigestValue']}" },
              body: { __metadata: { type: "SP.Field" }, Indexed: true },
            },
          ),
          IndexStepReadback: semanticConnector(
            "index-step-readback:protected-items:Title",
            "GET",
            `${protectedUri}/fields?$select=InternalName,Indexed`,
            { listId: "protected-items", observedFields: ["Title"] },
            "IndexWrite",
          ),
          IndexFinalReadback: semanticConnector(
            "index-final-readback:protected-items",
            "GET",
            `${protectedUri}/fields?$select=InternalName,Indexed`,
            { listId: "protected-items", observedFields: ["Title"] },
            "IndexStepReadback",
          ),
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

  test("built CLI context validates all fourteen WP06 rules from raw artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-built-cli-"));
    const ruleIds = [...FRONTEND_RULES, ...BUILDER_RULES].sort();
    const value = contract(ruleIds, true);
    try {
      await writeContract(root, value);
      await writeFrontend(root);
      await writeBuilder(root, builderDefinition());

      const loaded = await loadOfflineValidationContext(
        root,
        join(root, "project.contract.json"),
        "WP07 built CLI raw-artifact integration",
      );
      assert.equal(loaded.kind, "context", JSON.stringify(loaded));
      if (loaded.kind !== "context") return;

      assert.deepEqual(await validateBuiltRules(loaded.context, ruleIds), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a contract without indexes preserves unrelated builder derivations", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-raw-no-index-"));
    const value = contract(BUILDER_RULES.filter((ruleId) => !ruleId.startsWith("SP-INDEX-")), true);
    value.sharePoint.lists[0]!.indexes = [];
    value.sharePoint.lists[0]!.fields[0]!.indexed = false;
    const definition = builderDefinition() as any;
    const actions = definition.properties.definition.actions;
    delete actions.IndexRead;
    delete actions.DigestRead;
    delete actions.IndexWrite;
    delete actions.IndexStepReadback;
    delete actions.IndexFinalReadback;
    delete actions.FieldWrite_protected_items_Title.inputs.parameters.indexMetadataType;
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
