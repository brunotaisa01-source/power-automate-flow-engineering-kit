import ts from "typescript";

import type { ProjectContract } from "@spflow/core/types/project-contract";
import type {
  DefinitionRuleEvidence,
  FrontendFileRuleEvidence,
  NormalizedAction,
  Wp06AdapterDerivation,
} from "@spflow/core/types/rule-input";
import type { FieldContract, ListContract } from "@spflow/core/types/sharepoint";

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
  if (list.role === "protected-domain") {
    return list.writeModel === "direct-patch" ? ["read", "update"] : ["read"];
  }
  if (list.role === "reference" || list.role === "outbox") return ["read"];
  return [];
}

function fieldCompatibility(field: FieldContract): Record<string, unknown> {
  return {
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
}

function authorityFacts(contract: ProjectContract): readonly unknown[] | undefined {
  const facts = [];
  for (const command of contract.commands) {
    const capability = contract.capabilities.find(({ id }) => id === command.requiredCapability);
    const transition = contract.stateMachines
      .flatMap(({ transitions }) => transitions)
      .find(({ id }) => id === command.transitionId);
    if (capability === undefined || transition === undefined) return undefined;
    facts.push({
      commandType: command.type,
      targetListId: command.targetListId,
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
        id: capability.id,
        accessListId: capability.accessListId,
        activeField: capability.activeField,
        principalField: capability.principalField,
        capabilityField: capability.capabilityField,
        source: "active-access-row",
        activeOnly: true,
        matchCardinality: "one",
        commandDeclared: capability.allowedCommands.includes(command.type),
        stateTransitionDeclared: transition.commandType === command.type
          && transition.requiredCapability === capability.id,
      },
      scope: {
        mode: capability.scope.mode,
        ...(capability.scope.targetField === undefined ? {} : { targetField: capability.scope.targetField }),
        ...(capability.scope.accessField === undefined ? {} : { accessField: capability.scope.accessField }),
        ...(capability.scope.lookupListId === undefined ? {} : { lookupListId: capability.scope.lookupListId }),
        targetValueSource: "current-target-read",
        capabilityValueSource: "active-access-row",
        evaluation: capability.scope.mode === "global"
          ? "global"
          : capability.scope.mode === "lookup-membership"
          ? "lookup-membership"
          : "exact-match",
        checkedBeforeMutation: true,
      },
      effectiveOperation: { operation: "update", allowed: true },
    });
  }
  return facts.length === 0 ? undefined : facts;
}

function permissionModelFacts(contract: ProjectContract): readonly unknown[] {
  return contract.sharePoint.lists.map((list) => ({
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
  }));
}

function fieldOperationFacts(contract: ProjectContract): readonly unknown[] {
  return contract.sharePoint.lists.flatMap((list) => list.fields.map((field) => {
    const [metadataType, fieldTypeKind] = FIELD_PAYLOADS[field.type];
    return {
      listId: list.id,
      logicalName: field.logicalName,
      identity: {
        source: "field-readback",
        internalName: field.internalName,
        entityPropertyName: field.internalName,
      },
      uses: [{ operation: "readback", fieldName: field.internalName, source: "entity-property-name" }],
      createPayload: {
        serialization: "structured-json",
        metadataType,
        fieldTypeKind,
      },
      ...(field.indexed
        ? { indexPayload: { serialization: "structured-json", metadataType: "SP.Field" } }
        : {}),
      compatibility: {
        response: "GET_FAILED",
        comparedProperties: Object.keys(fieldCompatibility(field)),
        outcome: "GET_FAILED",
        writeAction: "none",
      },
    };
  }));
}

function httpClassificationFacts(): readonly unknown[] {
  return [
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
  ];
}

interface SourceFeatures {
  readonly identifiers: ReadonlySet<string>;
  readonly strings: ReadonlySet<string>;
  readonly kinds: ReadonlySet<ts.SyntaxKind>;
}

function functionFeatures(source: ts.SourceFile, name: string): SourceFeatures | undefined {
  let found: ts.FunctionDeclaration | undefined;
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name && statement.body !== undefined) {
      found = statement;
      break;
    }
  }
  if (found === undefined) return undefined;
  const identifiers = new Set<string>();
  const strings = new Set<string>();
  const kinds = new Set<ts.SyntaxKind>();
  const visit = (node: ts.Node): void => {
    kinds.add(node.kind);
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    if (ts.isStringLiteralLike(node)) strings.add(node.text);
    node.forEachChild(visit);
  };
  visit(found.body!);
  return { identifiers, strings, kinds };
}

function hasAll(values: ReadonlySet<string>, expected: readonly string[]): boolean {
  return expected.every((value) => values.has(value));
}

function supportsFrontendSource(text: string, path: string): boolean {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.ES2022,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  const save = functionFeatures(source, "saveSharePointItem");
  const pagination = functionFeatures(source, "loadAllSharePointPages");
  const odata = functionFeatures(source, "buildSharePointODataUrl");
  return save !== undefined
    && hasAll(save.identifiers, ["fetch", "JSON", "stringify", "status"])
    && hasAll(save.strings, ["POST", "GET", "X-HTTP-Method", "MERGE", "IF-MATCH", "X-RequestDigest"])
    && save.kinds.has(ts.SyntaxKind.IfStatement)
    && pagination !== undefined
    && hasAll(pagination.identifiers, ["fetch", "URL", "Set", "origin", "pathname"])
    && hasAll(pagination.strings, ["GET", "@odata.nextLink"])
    && pagination.kinds.has(ts.SyntaxKind.WhileStatement)
    && odata !== undefined
    && hasAll(odata.identifiers, ["URL", "URLSearchParams", "replaceAll", "set"])
    && hasAll(odata.strings, ["$select", "'", "''"]);
}

function frontendFacts(contract: ProjectContract): Readonly<Record<string, readonly unknown[]>> {
  const saveTransactions = contract.frontend.directPatch.listIds.flatMap((listId) => {
    const list = contract.sharePoint.lists.find(({ id }) => id === listId);
    if (list === undefined || list.patchAllowlist.length === 0) return [];
    return [{
      listId,
      trigger: "explicit-save",
      patchedFields: list.patchAllowlist,
      request: {
        method: contract.frontend.directPatch.method,
        methodOverride: contract.frontend.directPatch.methodOverride,
        serialization: "structured-json",
        digest: "fresh-transaction",
        ifMatch: "exact-etag",
      },
      conflict: { status: contract.frontend.directPatch.conflictStatus, action: "surface-conflict" },
      ambiguousFailure: { action: "get-reconcile", writeRetry: false },
      readback: { method: "GET", semantic: true, beforeSuccess: true },
    }];
  });
  const readable = contract.sharePoint.lists.filter(({ readAllowlist }) => readAllowlist.length > 0);
  return {
    saveTransactions,
    paginationTraversals: [{
      completeness: "required",
      mode: contract.frontend.pagination.mode,
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
    odataRequests: readable.map((list) => ({
      listId: list.id,
      fieldNames: list.readAllowlist,
      fieldSource: "contract-allowlist",
      queryConstruction: "url-api",
      pathConstruction: "url-api",
      stringLiteralEscaping: "double-single-quote-before-encoding",
      rawFragmentsAccepted: false,
      parameterEncoding: "url-search-params",
    })),
  };
}

function actionMethod(action: NormalizedAction): string | undefined {
  if (action.connector?.method !== undefined) return action.connector.method.toUpperCase();
  if (action.inputs !== null && typeof action.inputs === "object" && !Array.isArray(action.inputs)) {
    const method = (action.inputs as Record<string, unknown>).method;
    return typeof method === "string" ? method.toUpperCase() : undefined;
  }
  return undefined;
}

function succeedsAfter(action: NormalizedAction, predecessor: NormalizedAction): boolean {
  return action.containerId === predecessor.containerId
    && action.runAfter.some(({ actionId, statuses }) =>
      actionId === predecessor.id && statuses.includes("Succeeded")
    );
}

function supportsBuilderDefinition(contract: ProjectContract, definition: DefinitionRuleEvidence): boolean {
  const flow = definition.flow;
  if (flow === undefined || definition.failure !== undefined) return false;
  const roles = new Map<string, NormalizedAction>();
  for (const action of flow.actions.values()) {
    if (action.declaredRole !== undefined) {
      if (roles.has(action.declaredRole)) return false;
      roles.set(action.declaredRole, action);
    }
  }
  const methods: Readonly<Record<string, string | undefined>> = {
    "identity-read": "GET",
    "capability-read": "GET",
    "target-read": "GET",
    mutation: "POST",
    "permission-write": "POST",
    "permission-readback": "GET",
    "field-read": "GET",
    "field-write": "POST",
    "http-classifier": undefined,
  };
  for (const [role, method] of Object.entries(methods)) {
    const action = roles.get(role);
    if (action === undefined) return false;
    if (method === undefined) {
      if (!["Condition", "If"].includes(action.type)) return false;
    } else if (action.connector === undefined || actionMethod(action) !== method) {
      return false;
    }
  }
  const sequence = ["identity-read", "capability-read", "target-read", "mutation"]
    .map((role) => roles.get(role)!.containerIndex);
  if (!sequence.every((value, index) => index === 0 || value > sequence[index - 1]!)) return false;
  const executionChain = [
    "identity-read",
    "capability-read",
    "target-read",
    "mutation",
    "permission-write",
    "permission-readback",
    "field-read",
    "field-write",
    "http-classifier",
  ];
  if (!executionChain.slice(1).every((role, index) =>
    succeedsAfter(roles.get(role)!, roles.get(executionChain[index]!)!)
  )) return false;
  const structure = JSON.stringify([...flow.actions.values()].map(({ inputs, declaredRole, runAfter }) => ({
    inputs,
    declaredRole,
    runAfter,
  })));
  const requiredTokens = [
    ...contract.commands.map(({ type }) => type),
    ...contract.capabilities.flatMap((item) => [
      item.id, item.accessListId, item.activeField, item.principalField, item.capabilityField,
    ]),
    ...contract.sharePoint.lists.flatMap((list) => [
      list.id,
      ...list.fields.map(({ internalName }) => internalName),
    ]),
    "-2147024809",
    "404",
  ];
  return requiredTokens.every((token) => structure.includes(token));
}

function derivation(
  contract: ProjectContract,
  source: FrontendFileRuleEvidence | DefinitionRuleEvidence,
  sourceKind: "frontend" | "builder",
  section: Wp06AdapterDerivation["section"],
  facts: readonly unknown[],
): Wp06AdapterDerivation | undefined {
  if (source.bytes === undefined || source.sha256 === undefined || facts.length === 0) return undefined;
  return Object.freeze({
    adapterId: sourceKind === "frontend"
      ? "spflow.frontend-source-v2"
      : "spflow.power-automate-definition-v2",
    adapterVersion: 2,
    contractRevision: contract.project.contractRevision,
    sourceKind,
    section,
    sourceArtifactPath: source.relativePath,
    sourceArtifactSha256: source.sha256,
    sourceArtifactBytes: source.bytes,
    facts: structuredClone(facts),
  });
}

export function deriveFrontendWp06(
  contract: ProjectContract,
  source: FrontendFileRuleEvidence,
  text: string,
): readonly Wp06AdapterDerivation[] {
  if (!supportsFrontendSource(text, source.relativePath)) return [];
  const facts = frontendFacts(contract);
  return (["saveTransactions", "paginationTraversals", "odataRequests"] as const)
    .map((section) => derivation(contract, source, "frontend", section, facts[section] ?? []))
    .filter((item): item is Wp06AdapterDerivation => item !== undefined);
}

export function deriveDefinitionWp06(
  contract: ProjectContract,
  source: DefinitionRuleEvidence,
): readonly Wp06AdapterDerivation[] {
  if (!supportsBuilderDefinition(contract, source)) return [];
  const sections: ReadonlyArray<readonly [Wp06AdapterDerivation["section"], readonly unknown[] | undefined]> = [
    ["authorityChecks", authorityFacts(contract)],
    ["permissionModels", permissionModelFacts(contract)],
    ["fieldOperations", fieldOperationFacts(contract)],
    ["httpClassifications", httpClassificationFacts()],
  ];
  return sections
    .map(([section, facts]) => derivation(contract, source, "builder", section, facts ?? []))
    .filter((item): item is Wp06AdapterDerivation => item !== undefined);
}
