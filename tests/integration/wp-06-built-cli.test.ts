import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";

import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";
import type { FieldContract, ListContract } from "../../packages/core/src/types/sharepoint.ts";
import type {
  NormalizedWp06Evidence,
  Wp06EvidenceSection,
  Wp06SourceArtifactKind,
} from "../../packages/core/src/types/wp06-evidence.ts";
import { buildFrontendArtifact } from "../../packages/core/dist/graph-builders/frontend.js";
import {
  WP06_FRONTEND_BUNDLE_PROFILE,
  buildWp06ProjectionArtifact,
} from "../../packages/core/dist/wp06-source-adapters.js";
import { validateRules as validateBuiltRules } from "../../packages/rules/dist/registry.js";
import type {
  ArtifactGraphInput,
  ValidationContext,
} from "../../packages/rules/src/registry.ts";
import {
  hydrateWp06FixtureGraph,
  wp06SourceIrFromFacts,
} from "../helpers/wp06-fixture-graph.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const CLI = resolve(ROOT, "packages/cli/dist/bin/spflow.js");
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
const FRONTEND_RULE_IDS = ["APP-PAGINATION-001", "APP-SAVE-001", "SP-ODATA-001"] as const;

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly report: {
    readonly result: string;
    readonly diagnostics: readonly Array<{ readonly code: string }>;
    readonly summary: { readonly notRun: number };
  };
}

function field(
  logicalName: string,
  internalName: string,
  type: FieldContract["type"],
  options: Partial<FieldContract> = {},
): FieldContract {
  return {
    logicalName,
    internalName,
    type,
    required: true,
    indexed: false,
    unique: false,
    clientEditable: false,
    serverAuthoritative: true,
    immutableAfterCreate: false,
    sensitive: false,
    ...options,
  };
}

function projectContract(requiredRuleIds: readonly string[] = RULE_IDS): ProjectContract {
  const includeBuilderArtifacts = requiredRuleIds.some((ruleId) =>
    !(FRONTEND_RULE_IDS as readonly string[]).includes(ruleId)
  );
  const bindings = [
    ["SITE_URL", "site-url"],
    ["PROTECTED_LIST", "list-title"],
    ["COMMAND_LIST", "list-title"],
    ["AUDIT_LIST", "list-title"],
    ["ACCESS_LIST", "list-title"],
    ["BROWSERS", "connection-reference"],
    ["READERS", "connection-reference"],
    ["PROCESSOR", "connection-reference"],
    ["REVIEWERS", "connection-reference"],
  ] as const;
  return {
    schemaVersion: "1.0",
    project: {
      id: "synthetic-wp06-cli",
      displayName: "Synthetic WP-06 CLI",
      description: "Public synthetic built-CLI validation project.",
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
    environmentBindings: bindings.map(([key, kind]) => ({
      key,
      kind,
      requiredFor: ["generate", "tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: kind === "connection-reference",
      example: `{${key}}`,
    })),
    sharePoint: {
      siteUrlBinding: "SITE_URL",
      lists: [
        {
          id: "protected-items",
          titleBinding: "PROTECTED_LIST",
          role: "protected-domain",
          writeModel: "direct-patch",
          readAllowlist: ["ID", "Title", "Amount", "ScopeKey", "Status"],
          createAllowlist: [],
          patchAllowlist: ["Title"],
          fields: [
            field("title", "Title", "Text", {
              indexed: true,
              clientEditable: true,
              serverAuthoritative: false,
              maxLength: 255,
            }),
            field("amount", "Amount", "Currency"),
            field("scope-key", "ScopeKey", "Text", {
              indexed: true,
              immutableAfterCreate: true,
              maxLength: 64,
            }),
            field("status", "Status", "Choice", { choices: ["Pending", "Applied"] }),
          ],
          indexes: [
            { field: "Title", order: 1, required: true },
            { field: "ScopeKey", order: 2, required: true },
          ],
          permissions: {
            inheritance: "break-clear",
            minimumRoles: [
              { principalBinding: "READERS", role: "read", allowedOperations: ["read"] },
              { principalBinding: "PROCESSOR", role: "processor", allowedOperations: ["read", "update"] },
            ],
            directUserGrants: "forbidden",
            effectivePermissionReadback: "required",
          },
          views: [],
        },
        {
          id: "command-queue",
          titleBinding: "COMMAND_LIST",
          role: "command-queue",
          writeModel: "append-command",
          readAllowlist: ["ID", "Status"],
          createAllowlist: ["CommandType", "TargetItemId", "TargetEtag"],
          patchAllowlist: [],
          fields: [
            field("command-type", "CommandType", "Text", { maxLength: 100 }),
            field("target-item-id", "TargetItemId", "Number"),
            field("target-etag", "TargetEtag", "Text", { maxLength: 100 }),
            field("status", "Status", "Choice", {
              choices: ["Pending", "Processing", "Succeeded", "Failed"],
            }),
          ],
          indexes: [{ field: "TargetItemId", order: 1, required: true }],
          permissions: {
            inheritance: "break-clear",
            minimumRoles: [
              { principalBinding: "BROWSERS", role: "contribute-limited", allowedOperations: ["read", "create"] },
              { principalBinding: "PROCESSOR", role: "processor", allowedOperations: ["read", "update"] },
            ],
            directUserGrants: "forbidden",
            effectivePermissionReadback: "required",
          },
          views: [],
        },
        {
          id: "audit-log",
          titleBinding: "AUDIT_LIST",
          role: "audit",
          writeModel: "append-only",
          readAllowlist: ["ID"],
          createAllowlist: [],
          patchAllowlist: [],
          fields: [field("event-key", "EventKey", "Guid")],
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
          titleBinding: "ACCESS_LIST",
          role: "access-control",
          writeModel: "server-only",
          readAllowlist: [],
          createAllowlist: [],
          patchAllowlist: [],
          fields: [
            field("active", "Active", "Boolean", { indexed: true }),
            field("principal-key", "PrincipalKey", "Text", { indexed: true, maxLength: 255 }),
            field("capability", "Capability", "Text", { indexed: true, maxLength: 100 }),
            field("scope-key", "ScopeKey", "Text", { maxLength: 64 }),
          ],
          indexes: [
            { field: "Active", order: 1, required: true },
            { field: "PrincipalKey", order: 2, required: true },
            { field: "Capability", order: 3, required: true },
          ],
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
        serverGuards: ["current-state", "exact-etag"],
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
    flows: includeBuilderArtifacts ? [{
      id: "synthetic-processor",
      definitionPath: "flows/synthetic/definition.json",
      trigger: "manual",
      processorForCommandTypes: ["apply-change"],
      connectionReferences: ["PROCESSOR"],
      actionBudget: 50,
      concurrency: { enabled: true, degree: 1 },
      packageId: "synthetic-package",
    }] : [],
    packages: includeBuilderArtifacts ? [{
      id: "synthetic-package",
      path: "artifacts/packages/synthetic-package.zip",
      profile: "power-platform-solution-v1",
      manifestPath: "artifacts/packages/synthetic-package.manifest.json",
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
      permittedClaimClasses: ["LOCAL_STATIC"],
      localPromotionToTenant: "forbidden",
      exactArtifactBinding: true,
      synchronizedFolderIsPublication: false,
      successfulRunIsSemanticEffect: false,
    },
  };
}

const FIELD_PAYLOADS: Readonly<Record<FieldContract["type"], readonly [string, number]>> = {
  Boolean: ["SP.FieldBoolean", 8],
  Choice: ["SP.FieldChoice", 6],
  Currency: ["SP.FieldCurrency", 10],
  DateTime: ["SP.FieldDateTime", 4],
  Guid: ["SP.FieldGuid", 14],
  Lookup: ["SP.FieldLookup", 7],
  Note: ["SP.FieldMultiLineText", 3],
  Number: ["SP.FieldNumber", 9],
  Text: ["SP.FieldText", 2],
  User: ["SP.FieldUser", 20],
};

function expectedBrowserOperations(list: ListContract): readonly string[] {
  if (list.role === "command-queue") return ["read", "create"];
  if (list.role === "protected-domain" && list.writeModel === "direct-patch") {
    return ["read", "update"];
  }
  return [];
}

function compatibility(fieldContract: FieldContract): Record<string, unknown> {
  return {
    logicalName: fieldContract.logicalName,
    internalName: fieldContract.internalName,
    type: fieldContract.type,
    required: fieldContract.required,
    indexed: fieldContract.indexed,
    unique: fieldContract.unique,
    clientEditable: fieldContract.clientEditable,
    serverAuthoritative: fieldContract.serverAuthoritative,
    immutableAfterCreate: fieldContract.immutableAfterCreate,
    sensitive: fieldContract.sensitive,
    ...(fieldContract.maxLength === undefined ? {} : { maxLength: fieldContract.maxLength }),
    ...(fieldContract.dateTimeMode === undefined
      ? {}
      : { dateTimeMode: fieldContract.dateTimeMode }),
    ...(fieldContract.choices === undefined ? {} : { choices: fieldContract.choices }),
    ...(fieldContract.lookupListId === undefined
      ? {}
      : { lookupListId: fieldContract.lookupListId }),
    ...(fieldContract.lookupField === undefined ? {} : { lookupField: fieldContract.lookupField }),
  };
}

function wp06Evidence(contract: ProjectContract): Omit<NormalizedWp06Evidence, "binding"> {
  const lists = contract.sharePoint.lists;
  return {
    evidenceProfile: "wp06-offline-v1",
    contractRevision: contract.project.contractRevision,
    authorityChecks: [{
      commandType: "apply-change",
      targetListId: "protected-items",
      sequence: { identityRead: 1, capabilityRead: 2, targetRead: 3, mutation: 4 },
      authoritySources: {
        actor: "server-system-identity",
        role: "active-access-row",
        scope: "active-access-row",
        protectedState: "current-target-read",
        owner: "current-target-read",
        amount: "current-target-read",
        approval: "server-contract",
      },
      capability: {
        id: "approve-items",
        accessListId: "access-control",
        activeField: "Active",
        principalField: "PrincipalKey",
        capabilityField: "Capability",
        source: "active-access-row",
        activeOnly: true,
        matchCardinality: "one",
        commandDeclared: true,
        stateTransitionDeclared: true,
      },
      scope: {
        mode: "field-match",
        targetField: "ScopeKey",
        accessField: "ScopeKey",
        targetValueSource: "current-target-read",
        capabilityValueSource: "active-access-row",
        evaluation: "exact-match",
        checkedBeforeMutation: true,
      },
      effectiveOperation: { operation: "update", allowed: true },
    }],
    permissionModels: lists.map((list) => ({
      listId: list.id,
      inheritance: list.permissions.inheritance,
      directUserGrants: "forbidden",
      browserOperations: expectedBrowserOperations(list),
      grants: list.permissions.minimumRoles.map((role) => ({
        principalKind: "binding",
        principalBinding: role.principalBinding,
        role: role.role,
        allowedOperations: role.allowedOperations,
      })),
    })),
    permissionProbes: lists.flatMap((list) =>
      list.permissions.minimumRoles.map((role) => ({
        listId: list.id,
        principalBinding: role.principalBinding,
        operations: Object.fromEntries(
          ["read", "create", "update", "delete"].map((operation) => [
            operation,
            role.allowedOperations.includes(operation),
          ]),
        ),
      }))
    ),
    saveTransactions: [{
      listId: "protected-items",
      trigger: "explicit-save",
      patchedFields: ["Title"],
      request: {
        method: "POST",
        methodOverride: "MERGE",
        serialization: "structured-json",
        digest: "fresh-transaction",
        ifMatch: "exact-etag",
      },
      conflict: { status: 412, action: "surface-conflict" },
      ambiguousFailure: { action: "get-reconcile", writeRetry: false },
      readback: { method: "GET", semantic: true, beforeSuccess: true },
    }],
    paginationTraversals: [{
      completeness: "required",
      mode: "exhaust-continuation",
      continuation: {
        urlParsing: "url-api",
        sameOrigin: true,
        sitePath: true,
        visitedLinks: true,
        pageLimit: 50,
        onLoop: "fail",
        onCrossOrigin: "fail",
        onSitePathEscape: "fail",
        onPageLimit: "fail",
      },
      accumulation: "append-server-order",
      termination: "next-link-absent",
    }],
    odataRequests: [{
      listId: "protected-items",
      fieldNames: ["ID", "Title"],
      fieldSource: "contract-allowlist",
      queryConstruction: "url-api",
      pathConstruction: "url-api",
      stringLiteralEscaping: "double-single-quote-before-encoding",
      rawFragmentsAccepted: false,
      parameterEncoding: "url-search-params",
    }],
    fieldOperations: lists.flatMap((list) => list.fields.map((item) => {
      const [metadataType, fieldTypeKind] = FIELD_PAYLOADS[item.type];
      const actual = compatibility(item);
      return {
        listId: list.id,
        logicalName: item.logicalName,
        identity: {
          source: "field-readback",
          internalName: item.internalName,
          entityPropertyName: item.internalName,
        },
        uses: [{
          operation: "readback",
          fieldName: item.internalName,
          source: "entity-property-name",
        }],
        createPayload: {
          serialization: "structured-json",
          metadataType,
          fieldTypeKind,
        },
        ...(item.indexed
          ? { indexPayload: { serialization: "structured-json", metadataType: "SP.Field" } }
          : {}),
        compatibility: {
          response: "FOUND",
          comparedProperties: Object.keys(actual),
          actual,
          outcome: "MATCH",
          writeAction: "none",
        },
      };
    })),
    httpClassifications: [
      {
        status: 400,
        phase: "preflight",
        requestKind: "initial-get",
        allowCreateMissing404: false,
        error: { platformCode: "-2147024809" },
        classification: "MISSING_OBJECT",
      },
      {
        status: 400,
        phase: "preflight",
        requestKind: "initial-get",
        allowCreateMissing404: false,
        error: { platformCode: "INVALID_QUERY", messageCategory: "unrelated" },
        classification: "GET_FAILED",
      },
      {
        status: 404,
        phase: "preflight",
        requestKind: "initial-get",
        allowCreateMissing404: true,
        error: { platformCode: "NOT_FOUND" },
        classification: "CREATE_MISSING",
      },
      {
        status: 404,
        phase: "apply",
        requestKind: "initial-get",
        allowCreateMissing404: true,
        error: { platformCode: "NOT_FOUND" },
        classification: "GET_FAILED",
      },
    ],
    indexPlans: lists.filter(({ indexes }) => indexes.length > 0).map((list) => {
      const requiredFields = [...list.indexes]
        .filter(({ required }) => required)
        .sort((left, right) => left.order - right.order)
        .map(({ field: fieldName }) => fieldName);
      return {
        listId: list.id,
        currentFields: [...requiredFields].reverse(),
        requiredFields,
        execution: "serial",
        digest: { fresh: true, bindsCurrent: true, bindsRequired: true },
        result: "NO_OP",
        maximumWrites: 0,
        writeCount: 0,
        operations: [],
        finalReadback: requiredFields,
      };
    }),
  };
}

async function writeJson(path: string, value: unknown): Promise<Uint8Array> {
  await mkdir(dirname(path), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeFile(path, bytes);
  return bytes;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const SECTION_KINDS: Readonly<Record<Wp06EvidenceSection, Wp06SourceArtifactKind>> = {
  authorityChecks: "builder",
  permissionModels: "builder",
  permissionProbes: "builder",
  saveTransactions: "frontend",
  paginationTraversals: "frontend",
  odataRequests: "frontend",
  fieldOperations: "builder",
  httpClassifications: "builder",
  indexPlans: "builder",
};

interface BoundSource {
  readonly path: string;
  readonly bytes: Uint8Array;
}

interface BoundProjection {
  readonly path: string;
  readonly digest: string;
  readonly bytes: number;
}

function evidencePayload(
  evidence: Omit<NormalizedWp06Evidence, "binding">,
  section: Wp06EvidenceSection,
  contractDigest: string,
  contractBytes: number,
  source: BoundSource,
  projection: BoundProjection,
): NormalizedWp06Evidence {
  const values = evidence[section];
  assert.ok(Array.isArray(values) && values.length > 0, section);
  const kind = SECTION_KINDS[section];
  return {
    evidenceProfile: evidence.evidenceProfile,
    contractRevision: evidence.contractRevision,
    binding: {
      section,
      contractArtifactPath: "project.contract.json",
      contractArtifactSha256: contractDigest,
      contractArtifactBytes: contractBytes,
      sourceArtifactPath: source.path,
      sourceArtifactSha256: sha256(source.bytes),
      sourceArtifactBytes: source.bytes.byteLength,
      sourceArtifactKind: kind,
      projectionArtifactPath: projection.path,
      projectionArtifactSha256: projection.digest,
      projectionArtifactBytes: projection.bytes,
    },
    [section]: values,
  } as NormalizedWp06Evidence;
}

async function runCli(args: readonly string[]): Promise<CliResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: ROOT,
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
          report: JSON.parse(stdout) as CliResult["report"],
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

describe("WP-06 built CLI", () => {
  test("frontend Wave-2 rules use split bound evidence and reject a structural mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "spflow-wp06-"));
    const contract = projectContract(FRONTEND_RULE_IDS);
    try {
      const contractBytes = await writeJson(join(root, "project.contract.json"), contract);
      const evidence = wp06Evidence(contract);
      const evidenceBySection = new Map<Wp06EvidenceSection, NormalizedWp06Evidence>();
      const evidencePathBySection = new Map<Wp06EvidenceSection, string>();
      const sourcePathBySection = new Map<Wp06EvidenceSection, string>();
      const sourceBindings = new Map<Wp06EvidenceSection, {
        path: string;
        sha256: string;
        bytes: number;
      }>();
      for (const section of [
        "paginationTraversals",
        "saveTransactions",
        "odataRequests",
      ] as const) {
        const sourcePath = `frontend/source-${section}.json`;
        const facts = evidence[section];
        assert.ok(Array.isArray(facts) && facts.length > 0);
        const sourceData = wp06SourceIrFromFacts("frontend", section, facts);
        const sourceBytes = await writeJson(
          join(root, sourcePath),
          sourceData,
        );
        const sourceNode = buildFrontendArtifact({ relativePath: sourcePath, data: sourceData, bytes: sourceBytes });
        const projectionNode = buildWp06ProjectionArtifact(sourceNode);
        assert.notEqual(projectionNode, undefined);
        const normalizedFacts = (projectionNode!.data as { facts: readonly unknown[] }).facts;
        const relativePath = `frontend/evidence-${section}.json`;
        const payload = evidencePayload(
          { ...evidence, [section]: normalizedFacts },
          section,
          sha256(contractBytes),
          contractBytes.byteLength,
          { path: sourcePath, bytes: sourceBytes },
          {
            path: projectionNode!.relativePath,
            digest: projectionNode!.digest,
            bytes: projectionNode!.byteLength!,
          },
        );
        await writeJson(join(root, relativePath), payload);
        evidenceBySection.set(section, payload);
        evidencePathBySection.set(section, relativePath);
        sourcePathBySection.set(section, sourcePath);
        sourceBindings.set(section, {
          path: sourcePath,
          sha256: sha256(sourceBytes),
          bytes: sourceBytes.byteLength,
        });
      }
      const writeBundle = async (): Promise<void> => {
        await writeJson(join(root, "frontend/bundle.json"), {
          artifactProfile: WP06_FRONTEND_BUNDLE_PROFILE,
          artifactRevision: 1,
          contractRevision: contract.project.contractRevision,
          entrypoint: "index.js",
          files: ["index.js"],
          sources: [...sourceBindings.values()],
        });
      };
      await writeBundle();

      const green = await runCli(["validate", "rules", "--root", root, "--format", "json"]);
      assert.equal(green.exitCode, 0, green.stdout);
      assert.equal(green.report.result, "PASS", green.stdout);
      assert.equal(green.report.summary.notRun, 0, green.stdout);
      assert.deepEqual(green.report.diagnostics, []);

      const mutated = structuredClone(evidenceBySection.get("saveTransactions")!);
      mutated.saveTransactions![0]!.trigger = "implicit-save";
      const mutatedSourceData = wp06SourceIrFromFacts(
        "frontend",
        "saveTransactions",
        mutated.saveTransactions as readonly Record<string, any>[],
      );
      const mutatedSourceBytes = await writeJson(
        join(root, sourcePathBySection.get("saveTransactions")!),
        mutatedSourceData,
      );
      const sourcePath = sourcePathBySection.get("saveTransactions")!;
      const mutatedSourceNode = buildFrontendArtifact({
        relativePath: sourcePath,
        data: mutatedSourceData,
        bytes: mutatedSourceBytes,
      });
      const mutatedProjection = buildWp06ProjectionArtifact(mutatedSourceNode)!;
      const mutatedPayload = evidencePayload(
        { ...evidence, saveTransactions: mutated.saveTransactions },
        "saveTransactions",
        sha256(contractBytes),
        contractBytes.byteLength,
        { path: sourcePath, bytes: mutatedSourceBytes },
        {
          path: mutatedProjection.relativePath,
          digest: mutatedProjection.digest,
          bytes: mutatedProjection.byteLength!,
        },
      );
      await writeJson(join(root, evidencePathBySection.get("saveTransactions")!), mutatedPayload);
      sourceBindings.set("saveTransactions", {
        path: sourcePath,
        sha256: sha256(mutatedSourceBytes),
        bytes: mutatedSourceBytes.byteLength,
      });
      await writeBundle();
      const red = await runCli(["validate", "rules", "--root", root, "--format", "json"]);

      assert.equal(red.exitCode, 1, red.stdout);
      assert.deepEqual(red.report.diagnostics.map(({ code }) => code), ["APP-SAVE-001"]);
      assert.equal(red.stdout.includes("implicit-save"), false);
      assert.equal(`${green.stderr}${red.stderr}`, "");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("compiled Wave-2 registry validates all bound sections and catches authority mutation", async () => {
    const contract = projectContract();
    const contractDigest = "c".repeat(64);
    const evidence = wp06Evidence(contract);
    const contractNode = {
      id: "contract:project.contract.json:project-contract-v1",
      kind: "contract",
      relativePath: "project.contract.json",
      digest: contractDigest,
      byteLength: 2048,
      sourceProfile: "project-contract-v1",
      data: contract,
      projections: {},
    };
    const nodeMap = new Map<string, ArtifactGraphInput["nodes"][number]>();
    const edgeMap = new Map<string, ArtifactGraphInput["edges"][number]>();
    for (const section of Object.keys(SECTION_KINDS) as Wp06EvidenceSection[]) {
      const kind = SECTION_KINDS[section];
      const evidencePath = `artifacts/${kind}-evidence-${section}.json`;
      const values = evidence[section];
      assert.ok(Array.isArray(values) && values.length > 0);
      const payload = {
        evidenceProfile: "wp06-offline-v1",
        contractRevision: contract.project.contractRevision,
        binding: {
          section,
          contractArtifactPath: "project.contract.json",
          contractArtifactSha256: contractDigest,
          contractArtifactBytes: 2048,
          sourceArtifactPath: "synthetic/pending-source.json",
          sourceArtifactSha256: "d".repeat(64),
          sourceArtifactBytes: 512,
          sourceArtifactKind: kind,
          projectionArtifactPath: "synthetic/pending-projection.json",
          projectionArtifactSha256: "e".repeat(64),
          projectionArtifactBytes: 768,
        },
        [section]: values,
      };
      const evidenceBytes = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
      const evidenceNode = {
        id: `${kind}:${evidencePath}:wp06-evidence-v1`,
        kind,
        relativePath: evidencePath,
        digest: sha256(evidenceBytes),
        byteLength: evidenceBytes.byteLength,
        sourceProfile: "wp06-evidence-v1",
        data: payload,
        projections: {},
      };
      const hydrated = hydrateWp06FixtureGraph(
        { nodes: [evidenceNode, contractNode], edges: [] },
        contract,
      );
      hydrated.nodes.forEach((node) => nodeMap.set(node.id, node));
      hydrated.edges.forEach((edge) => edgeMap.set(`${edge.from}\0${edge.to}\0${edge.relation}`, edge));
    }
    const graph: ArtifactGraphInput = {
      nodes: [...nodeMap.values()],
      edges: [...edgeMap.values()],
    };
    const context: ValidationContext = {
      root: ".",
      offline: true,
      contract,
      graph,
      adapterEvidence: { packages: [], flows: [] },
    };

    assert.deepEqual(await validateBuiltRules(context, RULE_IDS), []);

    const mutated = structuredClone(graph) as ArtifactGraphInput & {
      nodes: Array<{ sourceProfile: string; data: Record<string, unknown> }>;
    };
    const authority = mutated.nodes.find(({ data }) => data.binding !== undefined
      && (data.binding as { section?: unknown }).section === "authorityChecks")!;
    const check = (authority.data.authorityChecks as Array<{
      authoritySources: { actor: string };
    }>)[0]!;
    check.authoritySources.actor = "client-claim";
    const mutatedContext: ValidationContext = { ...context, graph: mutated };
    const diagnostics = await validateBuiltRules(mutatedContext, RULE_IDS);
    assert.deepEqual(diagnostics.map(({ code }) => code), ["SP-AUTHZ-001", "SP-AUTHZ-002"]);
  });
});
