import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  loadSchema,
  validateProjectContract,
} from "../../../packages/core/src/schema-loader.ts";

const clone = <T>(value: T): T => structuredClone(value);

const validProjectContract = {
  schemaVersion: "1.0",
  project: {
    id: "synthetic-case-workbench",
    displayName: "Synthetic Case Workbench",
    description: "A synthetic command-queue reference application.",
    contractRevision: 1,
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
  environmentBindings: [
    {
      key: "ACCESS_LIST_TITLE",
      kind: "list-title",
      requiredFor: ["generate", "tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: false,
      example: "{ACCESS_LIST_TITLE}",
    },
    {
      key: "CASE_LIST_TITLE",
      kind: "list-title",
      requiredFor: ["generate", "tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: false,
      example: "{CASE_LIST_TITLE}",
    },
    {
      key: "COMMAND_LIST_TITLE",
      kind: "list-title",
      requiredFor: ["generate", "tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: false,
      example: "{COMMAND_LIST_TITLE}",
    },
    {
      key: "PROCESSOR_PRINCIPAL",
      kind: "connection-reference",
      requiredFor: ["tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: true,
      example: "{PROCESSOR_PRINCIPAL}",
    },
    {
      key: "SHAREPOINT_CONNECTION",
      kind: "connection-reference",
      requiredFor: ["generate", "tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: true,
      example: "{SHAREPOINT_CONNECTION}",
    },
    {
      key: "SITE_URL",
      kind: "site-url",
      requiredFor: ["tenant-preflight", "tenant-apply", "tenant-readback"],
      sensitive: false,
      example: "{SITE_URL}",
    },
  ],
  sharePoint: {
    siteUrlBinding: "SITE_URL",
    lists: [
      {
        id: "access",
        titleBinding: "ACCESS_LIST_TITLE",
        role: "access-control",
        writeModel: "read-only",
        readAllowlist: ["ID", "Active", "PrincipalKey", "CapabilityCode", "ScopeValue"],
        createAllowlist: [],
        patchAllowlist: [],
        fields: [
          {
            logicalName: "active",
            internalName: "Active",
            type: "Boolean",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: false,
            sensitive: false,
          },
          {
            logicalName: "capability-code",
            internalName: "CapabilityCode",
            type: "Text",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: true,
            sensitive: false,
            maxLength: 100,
          },
          {
            logicalName: "principal-key",
            internalName: "PrincipalKey",
            type: "Text",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: true,
            sensitive: true,
            maxLength: 255,
          },
          {
            logicalName: "scope-value",
            internalName: "ScopeValue",
            type: "Text",
            required: false,
            indexed: false,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: false,
            sensitive: false,
            maxLength: 255,
          },
        ],
        indexes: [
          { field: "Active", order: 1, required: true },
          { field: "CapabilityCode", order: 2, required: true },
          { field: "PrincipalKey", order: 3, required: true },
        ],
        permissions: {
          inheritance: "break-clear",
          minimumRoles: [
            {
              principalBinding: "PROCESSOR_PRINCIPAL",
              role: "processor",
              allowedOperations: ["read"],
            },
          ],
          directUserGrants: "forbidden",
          effectivePermissionReadback: "required",
        },
        views: [
          {
            id: "active-access",
            fields: ["Active", "PrincipalKey", "CapabilityCode", "ScopeValue"],
            rowLimit: 100,
            paged: true,
            filterContract: "active-only",
          },
        ],
      },
      {
        id: "cases",
        titleBinding: "CASE_LIST_TITLE",
        role: "protected-domain",
        writeModel: "server-only",
        readAllowlist: ["ID", "Modified", "Editor", "Title", "Status"],
        createAllowlist: [],
        patchAllowlist: [],
        fields: [
          {
            logicalName: "status",
            internalName: "Status",
            type: "Choice",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: false,
            sensitive: false,
            choices: ["Open", "Closed"],
          },
          {
            logicalName: "title",
            internalName: "Title",
            type: "Text",
            required: true,
            indexed: false,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: true,
            sensitive: false,
            maxLength: 255,
          },
        ],
        indexes: [{ field: "Status", order: 1, required: true }],
        permissions: {
          inheritance: "break-clear",
          minimumRoles: [
            {
              principalBinding: "PROCESSOR_PRINCIPAL",
              role: "processor",
              allowedOperations: ["read", "update"],
            },
          ],
          directUserGrants: "forbidden",
          effectivePermissionReadback: "required",
        },
        views: [
          {
            id: "open-cases",
            fields: ["ID", "Title", "Status", "Modified", "Editor"],
            rowLimit: 100,
            paged: true,
            filterContract: "open-only",
          },
        ],
      },
      {
        id: "commands",
        titleBinding: "COMMAND_LIST_TITLE",
        role: "command-queue",
        writeModel: "append-command",
        readAllowlist: ["ID", "CommandType", "TargetId", "ProcessingStatus"],
        createAllowlist: ["CommandType", "TargetId", "RequestedNote"],
        patchAllowlist: [],
        fields: [
          {
            logicalName: "command-type",
            internalName: "CommandType",
            type: "Text",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: false,
            immutableAfterCreate: true,
            sensitive: false,
            maxLength: 100,
          },
          {
            logicalName: "processing-status",
            internalName: "ProcessingStatus",
            type: "Choice",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: true,
            immutableAfterCreate: false,
            sensitive: false,
            choices: ["Pending", "Processing", "Succeeded", "Failed"],
          },
          {
            logicalName: "requested-note",
            internalName: "RequestedNote",
            type: "Note",
            required: false,
            indexed: false,
            unique: false,
            clientEditable: false,
            serverAuthoritative: false,
            immutableAfterCreate: true,
            sensitive: false,
          },
          {
            logicalName: "target-id",
            internalName: "TargetId",
            type: "Number",
            required: true,
            indexed: true,
            unique: false,
            clientEditable: false,
            serverAuthoritative: false,
            immutableAfterCreate: true,
            sensitive: false,
          },
        ],
        indexes: [
          { field: "CommandType", order: 1, required: true },
          { field: "ProcessingStatus", order: 2, required: true },
          { field: "TargetId", order: 3, required: true },
        ],
        permissions: {
          inheritance: "break-clear",
          minimumRoles: [
            {
              principalBinding: "PROCESSOR_PRINCIPAL",
              role: "processor",
              allowedOperations: ["read", "update"],
            },
          ],
          directUserGrants: "forbidden",
          effectivePermissionReadback: "required",
        },
        views: [
          {
            id: "pending-commands",
            fields: ["ID", "CommandType", "TargetId", "ProcessingStatus"],
            rowLimit: 100,
            paged: true,
            filterContract: "pending-only",
          },
        ],
      },
    ],
  },
  stateMachines: [
    {
      id: "case-status",
      listId: "cases",
      field: "Status",
      initial: "Open",
      terminal: ["Closed"],
      states: ["Closed", "Open"],
      transitions: [
        {
          id: "close-case",
          from: ["Open"],
          to: "Closed",
          commandType: "close-case",
          requiredCapability: "case-close",
          serverGuards: ["exact-etag", "current-state"],
        },
      ],
    },
  ],
  capabilities: [
    {
      id: "case-close",
      accessListId: "access",
      activeField: "Active",
      principalField: "PrincipalKey",
      capabilityField: "CapabilityCode",
      scope: { mode: "global" },
      allowedCommands: ["close-case"],
    },
  ],
  commands: [
    {
      type: "close-case",
      queueListId: "commands",
      targetListId: "cases",
      targetIdField: "TargetId",
      requestedFields: [
        {
          name: "RequestedNote",
          type: "string",
          required: false,
          maxLength: 1000,
          authority: "request",
        },
      ],
      serverReadFields: ["Status"],
      requiredCapability: "case-close",
      transitionId: "close-case",
      idempotency: {
        keyFields: ["TargetId", "CommandType"],
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
        assertions: [{ field: "Status", operator: "equals", expected: "Closed" }],
      },
    },
  ],
  flows: [
    {
      id: "process-close-case",
      definitionPath: "flows/process-close-case/definition.json",
      trigger: "sharepoint-created",
      processorForCommandTypes: ["close-case"],
      connectionReferences: ["SHAREPOINT_CONNECTION"],
      actionBudget: 50,
      concurrency: { enabled: true, degree: 1 },
      packageId: "core-package",
    },
  ],
  packages: [
    {
      id: "core-package",
      path: "artifacts/packages/core-package.zip",
      profile: "power-platform-solution-v1",
      manifestPath: "artifacts/manifest.json",
      flowIds: ["process-close-case"],
      importMode: "disabled",
      nestedArchives: "forbidden",
    },
  ],
  frontend: {
    root: "frontend",
    authModel: "existing-m365-session",
    secrets: "forbidden",
    protectedWriteModel: "typed-command-queue",
    directPatch: {
      enabled: false,
      listIds: [],
      explicitSave: true,
      digestPerTransaction: true,
      method: "POST",
      methodOverride: "MERGE",
      exactIfMatch: true,
      conflictStatus: 412,
      ambiguousWrite: "get-reconcile-no-blind-retry",
      semanticReadback: true,
    },
    pagination: {
      mode: "exhaust-continuation",
      sameOriginOnly: true,
    },
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
      itemLimit: 100,
      writeLimit: 100,
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
    requiredRuleIds: ["FLOW-STATUS-001"],
    finalZipInspection: true,
    recursivePublicDataScan: true,
    mutationControls: true,
  },
  evidencePolicy: {
    permittedClaimClasses: [
      "LOCAL_STATIC",
      "LOCAL_RUNTIME",
      "PACKAGE_ARTIFACT",
      "IMPORTED",
      "REBOUND",
      "ENABLED",
      "LIVE_SMOKE",
      "TENANT_VERIFIED",
      "PUBLISHED",
    ],
    localPromotionToTenant: "forbidden",
    exactArtifactBinding: true,
    synchronizedFolderIsPublication: false,
    successfulRunIsSemanticEffect: false,
  },
} as const;

const validRule = {
  schemaVersion: "1.0",
  id: "FLOW-STATUS-001",
  title: "Require semantic readback before completion",
  domain: "power-automate",
  severity: "error",
  description: "A successful run must be supported by semantic effect readback.",
  rationale: "Connector success alone does not prove the intended state change.",
  appliesTo: [{ kind: "definition", profile: "power-platform-solution-v1" }],
  detector: {
    implementation: "packages/rules/src/flow/status.ts",
    exportName: "detectCompletionWithoutReadback",
    input: "artifact-graph",
    deterministic: true,
    network: "forbidden",
    parameters: {},
  },
  red: {
    root: "fixtures/rules/FLOW-STATUS-001/red",
    expectedResult: "FAIL",
    expectedDiagnosticCodes: ["FLOW-STATUS-001"],
  },
  green: {
    root: "fixtures/rules/FLOW-STATUS-001/green",
    expectedResult: "PASS",
    expectedDiagnosticCodes: [],
  },
  finalArtifact: {
    required: true,
    artifactKinds: ["generated-definition", "zip"],
  },
  remediation: ["Add semantic readback before setting the command to Succeeded."],
  residualGate: {
    required: true,
    claimClass: "LIVE_SMOKE",
    description: "Run a controlled mutation and verify its semantic effect.",
  },
  supportedEvidence: ["LOCAL_STATIC", "PACKAGE_ARTIFACT"],
  tags: ["readback", "status"],
} as const;

const validEvidence = {
  schemaVersion: "1.0",
  evidenceId: "local-static-contracts",
  claimClass: "LOCAL_STATIC",
  subject: {
    type: "toolkit-release",
    id: "sharepoint-flow-engineering-kit",
  },
  contract: {
    projectId: "synthetic-case-workbench",
    revision: 1,
    digest: "0".repeat(64),
  },
  artifacts: [],
  execution: {
    command: "npm test -- --test-name-pattern=contract-schema",
    toolVersion: "0.0.0",
    startedAt: "2026-08-12T18:00:00Z",
    endedAt: "2026-08-12T18:00:01Z",
    exitCode: 0,
    normalizedOutputPath: "artifacts/evidence/local-static.json",
    networkMode: "offline",
  },
  assertions: [
    {
      id: "schemas-valid",
      description: "All WP-01 schemas compile in strict mode.",
      expected: true,
      actual: true,
      result: "PASS",
    },
  ],
  dependencies: [],
  residualGates: [],
  review: {
    gate: "R2",
    reviewerRole: "contract-reviewer",
    decision: "PENDING",
  },
  result: "PASS",
} as const;

const crossReferenceCases = [
  {
    label: "list",
    code: "CONTRACT_REF_LIST_MISSING",
    mutate(value: any) {
      value.stateMachines[0].listId = "missing-list";
    },
  },
  {
    label: "field",
    code: "CONTRACT_REF_FIELD_MISSING",
    mutate(value: any) {
      value.stateMachines[0].field = "MissingField";
    },
  },
  {
    label: "state",
    code: "CONTRACT_REF_STATE_MISSING",
    mutate(value: any) {
      value.stateMachines[0].transitions[0].to = "Missing";
    },
  },
  {
    label: "capability",
    code: "CONTRACT_REF_CAPABILITY_MISSING",
    mutate(value: any) {
      value.commands[0].requiredCapability = "missing-capability";
    },
  },
  {
    label: "flow",
    code: "CONTRACT_REF_FLOW_MISSING",
    mutate(value: any) {
      value.packages[0].flowIds[0] = "missing-flow";
    },
  },
  {
    label: "package",
    code: "CONTRACT_REF_PACKAGE_MISSING",
    mutate(value: any) {
      value.flows[0].packageId = "missing-package";
    },
  },
  {
    label: "binding",
    code: "CONTRACT_REF_BINDING_MISSING",
    mutate(value: any) {
      value.sharePoint.siteUrlBinding = "MISSING_BINDING";
    },
  },
] as const;

describe("contract schema", () => {
  test("loads every WP-01 schema by deterministic name", async () => {
    const names = [
      "evidence",
      "self-improvement",
      "flow-contract",
      "package-profile",
      "project-contract",
      "rule",
      "sharepoint-schema",
    ];

    for (const name of names) {
      const schema = (await loadSchema(name)) as Record<string, unknown>;
      assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
      assert.equal(typeof schema.$defs, "object");
      assert.equal(schema.additionalProperties, false);
    }
  });

  test("strictly rejects unknown properties in every standalone contract schema", async () => {
    const names = [
      "evidence",
      "self-improvement",
      "flow-contract",
      "package-profile",
      "project-contract",
      "rule",
      "sharepoint-schema",
    ] as const;
    const schemas = await Promise.all(names.map((name) => loadSchema(name)));
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    for (const schema of schemas) {
      ajv.addSchema(schema);
    }

    const cases = [
      {
        name: "evidence",
        value: validEvidence,
        mutateNested(value: any) {
          value.subject.unknownNested = true;
        },
      },
      {
        name: "flow-contract",
        value: validProjectContract.flows[0],
        mutateNested(value: any) {
          value.concurrency.unknownNested = true;
        },
      },
      {
        name: "package-profile",
        value: validProjectContract.packages[0],
      },
      {
        name: "project-contract",
        value: validProjectContract,
        mutateNested(value: any) {
          value.project.unknownNested = true;
        },
      },
      {
        name: "rule",
        value: validRule,
        mutateNested(value: any) {
          value.detector.unknownNested = true;
        },
      },
      {
        name: "self-improvement",
        value: {
          schemaVersion: "1.0",
          registryId: "sharepoint-flow-engineering-kit-global",
          revision: 1,
          lessons: [{
            id: "synthetic-lesson",
            version: 1,
            status: "APPROVED",
            scope: ["power-automate", "excel", "connectors"],
            trigger: { kind: "red-test", summary: "Synthetic counterexample." },
            invariant: "A status check precedes body trust.",
            red: { path: "tests/red.test.ts", testName: "red", runner: "node-test", expectedExitCode: 0 },
            green: { path: "tests/green.test.ts", testName: "green", runner: "node-test", expectedExitCode: 0 },
            positiveControl: { path: "tests/positive.test.ts", testName: "positive", runner: "node-test", expectedExitCode: 0 },
            claimBoundary: "LOCAL_RUNTIME",
            provenance: { workPackage: "WP-17", recordPath: "docs/source.md" },
            review: { decision: "APPROVED", recordPath: "docs/review.md", reviewerRole: "synthetic-reviewer" },
            privacy: "synthetic-public",
            lifecycle: { current: "APPROVED", history: [{ status: "CANDIDATE", recordPath: "docs/source.md" }, { status: "APPROVED", recordPath: "docs/review.md" }] },
          }],
        },
        mutateNested(value: any) {
          value.lessons[0].trigger.unknownNested = true;
        },
      },
      {
        name: "sharepoint-schema",
        value: validProjectContract.sharePoint,
        mutateNested(value: any) {
          value.lists[0].permissions.unknownNested = true;
        },
      },
    ] as const;

    for (const fixture of cases) {
      const schema = schemas[names.indexOf(fixture.name)] as Record<string, unknown>;
      const validate = ajv.getSchema(schema.$id as string);
      assert.ok(validate, fixture.name);
      assert.equal(validate(clone(fixture.value)), true, fixture.name);

      const unknownRoot: any = clone(fixture.value);
      unknownRoot.unknownRoot = true;
      assert.equal(validate(unknownRoot), false, `${fixture.name} root`);
      assert.ok(
        validate.errors?.some(
          ({ instancePath, keyword }) => instancePath === "" && keyword === "additionalProperties",
        ),
        `${fixture.name} root diagnostic`,
      );

      if ("mutateNested" in fixture) {
        const unknownNested: any = clone(fixture.value);
        fixture.mutateNested(unknownNested);
        assert.equal(validate(unknownNested), false, `${fixture.name} nested`);
        assert.ok(
          validate.errors?.some(({ instancePath, keyword }) =>
            instancePath !== "" && keyword === "additionalProperties"
          ),
          `${fixture.name} nested diagnostic`,
        );
      }
    }
  });

  test("accepts the complete synthetic project contract", () => {
    assert.deepEqual(validateProjectContract(clone(validProjectContract)), {
      valid: true,
      diagnostics: [],
    });
  });

  test("rejects unknown root properties", () => {
    const value: any = clone(validProjectContract);
    value.unknownRoot = true;

    const result = validateProjectContract(value);
    assert.equal(result.valid, false);
    assert.deepEqual(result.diagnostics.map(({ code }) => code), ["CONTRACT_SCHEMA_INVALID"]);
    assert.equal(result.diagnostics[0]?.path, "");
  });

  test("rejects unknown nested properties", () => {
    const value: any = clone(validProjectContract);
    value.sharePoint.lists[0].fields[0].unknownNested = true;

    const result = validateProjectContract(value);
    assert.equal(result.valid, false);
    assert.deepEqual(result.diagnostics.map(({ code }) => code), ["CONTRACT_SCHEMA_INVALID"]);
    assert.equal(result.diagnostics[0]?.path, "/sharePoint/lists/0/fields/0");
  });

  for (const fixture of crossReferenceCases) {
    test(`rejects a missing ${fixture.label} cross-reference`, () => {
      const value: any = clone(validProjectContract);
      fixture.mutate(value);

      const result = validateProjectContract(value);
      assert.equal(result.valid, false);
      assert.ok(result.diagnostics.some(({ code }) => code === fixture.code));
    });
  }

  test("rejects non-public environment binding examples", () => {
    const forbiddenExamples = [
      "https://tenant.example.com/sites/private",
      "person@example.com",
      "00000000-0000-4000-8000-000000000001",
      "C:\\Users\\person\\private-bindings.json",
      "/home/person/private-bindings.json",
    ];

    for (const example of forbiddenExamples) {
      const value: any = clone(validProjectContract);
      value.environmentBindings[0].example = example;

      const result = validateProjectContract(value);
      assert.equal(result.valid, false, example);
      assert.deepEqual(result.diagnostics.map(({ code }) => code), [
        "CONTRACT_BINDING_EXAMPLE_FORBIDDEN",
      ]);
    }
  });

  test("accepts reserved synthetic email and placeholder binding examples", () => {
    const value: any = clone(validProjectContract);
    value.environmentBindings[0].example = "user@example.test";

    assert.equal(validateProjectContract(value).valid, true);
  });

  test("sorts diagnostics deterministically", () => {
    const value: any = clone(validProjectContract);
    value.flows[0].packageId = "missing-package";
    value.packages[0].flowIds[0] = "missing-flow";
    value.sharePoint.siteUrlBinding = "MISSING_BINDING";

    const first = validateProjectContract(value);
    const second = validateProjectContract(clone(value));

    assert.deepEqual(first, second);
    assert.deepEqual(
      first.diagnostics.map(({ code }) => code),
      [
        "CONTRACT_REF_BINDING_MISSING",
        "CONTRACT_REF_FLOW_MISSING",
        "CONTRACT_REF_PACKAGE_MISSING",
      ],
    );
  });
});
