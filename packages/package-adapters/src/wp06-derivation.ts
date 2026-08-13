import ts from "typescript";

import type { ProjectContract } from "@spflow/core/types/project-contract";
import type {
  DefinitionRuleEvidence,
  FrontendFileRuleEvidence,
  NormalizedAction,
  Wp06AdapterDerivation,
} from "@spflow/core/types/rule-input";

type StringPolicy = ReadonlyMap<string, readonly string[]>;

interface FrontendSemantics {
  readonly patchAllowlists: StringPolicy;
  readonly readAllowlists: StringPolicy;
  readonly pageLimit: number;
}

function frontendSource(text: string, path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.ES2022,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
}

function topLevelFunction(source: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
  const matches = source.statements.filter((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement)
    && statement.name?.text === name
    && statement.body !== undefined
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function unwrapFreeze(expression: ts.Expression): ts.Expression {
  if (
    ts.isCallExpression(expression)
    && ts.isPropertyAccessExpression(expression.expression)
    && ts.isIdentifier(expression.expression.expression)
    && expression.expression.expression.text === "Object"
    && expression.expression.name.text === "freeze"
    && expression.arguments.length === 1
  ) {
    return expression.arguments[0]!;
  }
  return expression;
}

function stringLiteralArray(expression: ts.Expression): readonly string[] | undefined {
  const value = unwrapFreeze(expression);
  if (!ts.isArrayLiteralExpression(value)) return undefined;
  const strings = value.elements.map((element) =>
    ts.isStringLiteralLike(element) ? element.text : undefined
  );
  return strings.every((item): item is string => item !== undefined)
      && new Set(strings).size === strings.length
    ? Object.freeze(strings)
    : undefined;
}

function stringPolicy(source: ts.SourceFile, name: string): StringPolicy | undefined {
  const matches = source.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement)) return [];
    if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) return [];
    return statement.declarationList.declarations.filter((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer !== undefined
    );
  });
  const declaration = matches[0];
  if (matches.length !== 1 || declaration?.initializer === undefined) return undefined;
  const value = unwrapFreeze(declaration.initializer);
  if (!ts.isObjectLiteralExpression(value)) return undefined;
  const policy = new Map<string, readonly string[]>();
  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property)) return undefined;
    const key = ts.isStringLiteralLike(property.name)
      ? property.name.text
      : ts.isIdentifier(property.name)
      ? property.name.text
      : undefined;
    const fields = stringLiteralArray(property.initializer);
    if (key === undefined || fields === undefined || fields.length === 0 || policy.has(key)) return undefined;
    policy.set(key, fields);
  }
  return policy.size > 0 ? policy : undefined;
}

function statementTerminates(statement: ts.Statement): boolean {
  return ts.isReturnStatement(statement) || ts.isThrowStatement(statement);
}

function hasUnreachableTopLevel(body: ts.Block): boolean {
  return body.statements.some((statement, index) =>
    index < body.statements.length - 1 && statementTerminates(statement)
  );
}

function variableInitializer(
  body: ts.Block,
  name: string,
): ts.Expression | undefined {
  const matches = body.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.filter((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer !== undefined
    );
  });
  return matches.length === 1 ? matches[0]!.initializer : undefined;
}

function unawait(expression: ts.Expression): ts.Expression {
  return ts.isAwaitExpression(expression) ? expression.expression : expression;
}

function callNamed(expression: ts.Expression, name: string): ts.CallExpression | undefined {
  const value = unawait(expression);
  return ts.isCallExpression(value)
      && ts.isIdentifier(value.expression)
      && value.expression.text === name
    ? value
    : undefined;
}

function propertyValue(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const matches = object.properties.filter((property): property is ts.PropertyAssignment => {
    if (!ts.isPropertyAssignment(property)) return false;
    return (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
      && property.name.text.toLowerCase() === name.toLowerCase();
  });
  return matches.length === 1 ? matches[0]!.initializer : undefined;
}

function stringValue(expression: ts.Expression | undefined): string | undefined {
  return expression !== undefined && ts.isStringLiteralLike(expression) ? expression.text : undefined;
}

function isIdentifierNamed(expression: ts.Expression | undefined, name: string): boolean {
  return expression !== undefined && ts.isIdentifier(expression) && expression.text === name;
}

function fetchRequest(
  expression: ts.Expression | undefined,
): { readonly target: ts.Expression; readonly options: ts.ObjectLiteralExpression } | undefined {
  if (expression === undefined) return undefined;
  const call = callNamed(expression, "fetch");
  const target = call?.arguments[0];
  const options = call?.arguments[1];
  return target !== undefined && options !== undefined && ts.isObjectLiteralExpression(options)
    ? { target, options }
    : undefined;
}

function isGetReturn(statement: ts.Statement, source: ts.SourceFile): boolean {
  if (!ts.isReturnStatement(statement)) return false;
  const request = fetchRequest(statement.expression);
  return request !== undefined
    && request.target.getText(source) === "itemUrl"
    && stringValue(propertyValue(request.options, "method")) === "GET";
}

function supportsPatchHelper(source: ts.SourceFile): boolean {
  const helper = topLevelFunction(source, "allowlistedPatch");
  if (helper?.body === undefined || hasUnreachableTopLevel(helper.body)) return false;
  const fields = variableInitializer(helper.body, "fields");
  const returned = helper.body.statements.find(ts.isReturnStatement)?.expression;
  return fields?.getText(source) === "PATCH_ALLOWLISTS[listId]"
    && returned?.getText(source) === "Object.fromEntries(fields.map((field) => [field, patch[field]]))"
    && helper.body.statements.some((statement) =>
      ts.isIfStatement(statement)
      && statement.expression.getText(source) === "!fields"
      && statement.thenStatement.getText(source).includes("throw")
    );
}

function supportsFreshDigest(source: ts.SourceFile): boolean {
  const helper = topLevelFunction(source, "freshDigest");
  if (helper?.body === undefined || hasUnreachableTopLevel(helper.body)) return false;
  const response = fetchRequest(variableInitializer(helper.body, "response"));
  const body = variableInitializer(helper.body, "body");
  const returned = helper.body.statements.find(ts.isReturnStatement)?.expression;
  return response !== undefined
    && response.target.getText(source) === "new URL(\"/_api/contextinfo\", itemUrl)"
    && stringValue(propertyValue(response.options, "method")) === "POST"
    && body?.getText(source) === "await response.json()"
    && returned?.getText(source) === "body.FormDigestValue";
}

function supportsSave(source: ts.SourceFile): boolean {
  const save = topLevelFunction(source, "saveSharePointItem");
  if (save?.body === undefined || hasUnreachableTopLevel(save.body)) return false;
  const body = variableInitializer(save.body, "body");
  const digest = variableInitializer(save.body, "digest");
  const request = fetchRequest(variableInitializer(save.body, "response"));
  if (
    body?.getText(source) !== "allowlistedPatch(listId, patch)"
    || digest?.getText(source) !== "await freshDigest(itemUrl)"
    || request === undefined
    || request.target.getText(source) !== "itemUrl"
    || stringValue(propertyValue(request.options, "method")) !== "POST"
  ) return false;
  const headers = propertyValue(request.options, "headers");
  const requestBody = propertyValue(request.options, "body");
  if (
    headers === undefined
    || !ts.isObjectLiteralExpression(headers)
    || stringValue(propertyValue(headers, "X-HTTP-Method")) !== "MERGE"
    || !isIdentifierNamed(propertyValue(headers, "IF-MATCH"), "etag")
    || !isIdentifierNamed(propertyValue(headers, "X-RequestDigest"), "digest")
    || requestBody?.getText(source) !== "JSON.stringify(body)"
  ) return false;
  const conflict = save.body.statements.find((statement) =>
    ts.isIfStatement(statement)
    && statement.expression.getText(source) === "response.status === 412"
    && statement.thenStatement.getText(source).includes("throw")
  );
  const reconcile = save.body.statements.find((statement) =>
    ts.isIfStatement(statement)
    && statement.expression.getText(source) === "!response.ok"
    && isGetReturn(statement.thenStatement, source)
  );
  return conflict !== undefined
    && reconcile !== undefined
    && isGetReturn(save.body.statements.at(-1)!, source)
    && supportsPatchHelper(source)
    && supportsFreshDigest(source);
}

function supportsPagination(source: ts.SourceFile): number | undefined {
  const pagination = topLevelFunction(source, "loadAllSharePointPages");
  if (pagination?.body === undefined || hasUnreachableTopLevel(pagination.body)) return undefined;
  const loop = pagination.body.statements.find(ts.isWhileStatement);
  if (loop === undefined || loop.expression.getText(source) !== "next" || !ts.isBlock(loop.statement)) {
    return undefined;
  }
  const text = loop.statement.getText(source);
  const limit = /pages\s*>\s*(\d+)/.exec(text)?.[1];
  if (
    limit === undefined
    || !text.includes("new URL(next)")
    || !text.includes("pageUrl.origin !== expectedOrigin")
    || !text.includes("!pageUrl.pathname.startsWith(expectedPathname)")
    || !text.includes("visited.has(pageUrl.href)")
    || !text.includes("visited.add(pageUrl.href)")
    || !text.includes("fetch(pageUrl, { method: \"GET\" })")
    || !text.includes("items.push(...body.value)")
    || !text.includes("next = body[\"@odata.nextLink\"]")
    || !pagination.body.statements.at(-1)?.getText(source).includes("return items")
  ) return undefined;
  return Number(limit);
}

function supportsOData(source: ts.SourceFile): boolean {
  const odata = topLevelFunction(source, "buildSharePointODataUrl");
  if (odata?.body === undefined || hasUnreachableTopLevel(odata.body)) return false;
  const text = odata.body.getText(source);
  return variableInitializer(odata.body, "fields")?.getText(source) === "READ_ALLOWLISTS[listId]"
    && text.includes("new URL(base)")
    && text.includes("new URLSearchParams()")
    && text.includes("params.set(\"$select\", fields.join(\",\"))")
    && text.includes("params.set(\"$filter\", value.replaceAll(\"'\", \"''\"))")
    && text.includes("url.search = params.toString()")
    && odata.body.statements.at(-1)?.getText(source) === "return url;";
}

function frontendSemantics(text: string, path: string): FrontendSemantics | undefined {
  const source = frontendSource(text, path);
  const patchAllowlists = stringPolicy(source, "PATCH_ALLOWLISTS");
  const readAllowlists = stringPolicy(source, "READ_ALLOWLISTS");
  const pageLimit = supportsPagination(source);
  return patchAllowlists !== undefined
      && readAllowlists !== undefined
      && pageLimit !== undefined
      && supportsSave(source)
      && supportsOData(source)
    ? { patchAllowlists, readAllowlists, pageLimit }
    : undefined;
}

function frontendFacts(semantics: FrontendSemantics): Readonly<Record<string, readonly unknown[]>> {
  return {
    saveTransactions: [...semantics.patchAllowlists].map(([listId, patchedFields]) => ({
      listId,
      trigger: "explicit-save",
      patchedFields,
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
    })),
    paginationTraversals: [{
      completeness: "required",
      mode: "exhaust-continuation",
      continuation: {
        urlParsing: "url-api",
        sameOrigin: true,
        sitePath: true,
        visitedLinks: true,
        pageLimit: semantics.pageLimit,
        onLoop: "fail",
        onCrossOrigin: "fail",
        onSitePathEscape: "fail",
        onPageLimit: "fail",
      },
      accumulation: "append-server-order",
      termination: "next-link-absent",
    }],
    odataRequests: [...semantics.readAllowlists].map(([listId, fieldNames]) => ({
      listId,
      fieldNames,
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

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function actionInputs(action: NormalizedAction): UnknownRecord | undefined {
  return isRecord(action.inputs) ? action.inputs : undefined;
}

function actionParameters(action: NormalizedAction): UnknownRecord | undefined {
  const inputs = actionInputs(action);
  return inputs !== undefined && isRecord(inputs.parameters) ? inputs.parameters : undefined;
}

function actionUri(action: NormalizedAction): string | undefined {
  const inputs = actionInputs(action);
  return inputs === undefined || typeof inputs.uri !== "string" ? undefined : inputs.uri;
}

function stringArrayValue(value: unknown): readonly string[] | undefined {
  return Array.isArray(value)
      && value.every((item): item is string => typeof item === "string")
      && new Set(value).size === value.length
    ? value
    : undefined;
}

function booleanMap(value: unknown): Readonly<Record<string, boolean>> | undefined {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "boolean")
    ? value as Record<string, boolean>
    : undefined;
}

function rolesByPrefix(
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
  prefix: string,
): readonly NormalizedAction[] {
  return [...flow.actions.values()].filter(({ declaredRole }) =>
    declaredRole === prefix || declaredRole?.startsWith(`${prefix}:`) === true
  );
}

function oneRole(
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
  role: string,
): NormalizedAction | undefined {
  const actions = rolesByPrefix(flow, role).filter(({ declaredRole }) => declaredRole === role);
  return actions.length === 1 ? actions[0] : undefined;
}

function connectorMatches(
  action: NormalizedAction | undefined,
  method: string,
  uriParts: readonly string[],
): action is NormalizedAction {
  const uri = action === undefined ? undefined : actionUri(action);
  return action?.connector !== undefined
    && actionMethod(action) === method
    && uri !== undefined
    && uriParts.every((part) => uri.includes(part));
}

function conditionExpression(action: NormalizedAction | undefined): string | undefined {
  if (action === undefined || !["Condition", "If"].includes(action.type)) return undefined;
  const direct = actionInputs(action)?.expression;
  if (typeof direct === "string") return direct;
  return action.expressions.length === 1 ? action.expressions[0]?.source : undefined;
}

function authorityFromDefinition(
  contract: ProjectContract,
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
): readonly unknown[] | undefined {
  if (contract.commands.length !== 1) return undefined;
  const command = contract.commands[0]!;
  const capabilityContract = contract.capabilities.find(({ id }) => id === command.requiredCapability);
  const transition = contract.stateMachines
    .flatMap(({ transitions }) => transitions)
    .find(({ id }) => id === command.transitionId);
  const targetList = contract.sharePoint.lists.find(({ id }) => id === command.targetListId);
  const accessList = contract.sharePoint.lists.find(({ id }) => id === capabilityContract?.accessListId);
  if (capabilityContract === undefined || transition === undefined || targetList === undefined || accessList === undefined) {
    return undefined;
  }
  const identity = oneRole(flow, "identity-read");
  const capability = oneRole(flow, "capability-read");
  const target = oneRole(flow, "target-read");
  const guard = oneRole(flow, "authorization-guard");
  const mutation = oneRole(flow, "mutation");
  const capabilityParams = capability === undefined ? undefined : actionParameters(capability);
  const targetParams = target === undefined ? undefined : actionParameters(target);
  const mutationParams = mutation === undefined ? undefined : actionParameters(mutation);
  const expression = conditionExpression(guard);
  if (
    !connectorMatches(identity, "GET", ["/_api/web/currentuser", "$select=Id,LoginName"])
    || !connectorMatches(capability, "GET", [accessList.titleBinding, "/items", capabilityContract.activeField])
    || !connectorMatches(target, "GET", [targetList.titleBinding, "/items(", "$select="])
    || guard === undefined
    || mutation === undefined
    || !connectorMatches(mutation, "POST", [targetList.titleBinding, "/items("])
    || !succeedsAfter(capability, identity)
    || !succeedsAfter(target, capability)
    || !succeedsAfter(guard, target)
    || mutation.parentId !== guard.id
    || mutation.controlBranch !== "condition-true"
    || mutation.connector?.overrideMethod !== "MERGE"
    || mutation.connector.ifMatch === undefined
    || mutation.connector.ifMatch === "*"
    || expression === undefined
    || !expression.includes(`body('${capability.id}')`)
    || !expression.includes(`body('${target.id}')`)
    || !expression.includes(`'${command.type}'`)
    || !expression.includes(`'${transition.from[0] ?? ""}'`)
    || capabilityParams === undefined
    || targetParams === undefined
    || mutationParams === undefined
  ) return undefined;
  const capabilityId = capabilityParams.capabilityId;
  const accessListId = capabilityParams.listId;
  const activeField = capabilityParams.activeField;
  const principalField = capabilityParams.principalField;
  const capabilityField = capabilityParams.capabilityField;
  const targetListId = targetParams.listId;
  const commandType = mutationParams.commandType;
  const transitionId = mutationParams.transitionId;
  const scopeTargetField = mutationParams.scopeTargetField;
  const scopeAccessField = mutationParams.scopeAccessField;
  if (
    ![capabilityId, accessListId, activeField, principalField, capabilityField, targetListId,
      commandType, transitionId, scopeTargetField, scopeAccessField]
      .every((value) => typeof value === "string")
  ) return undefined;
  return [{
    commandType,
    targetListId,
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
      id: capabilityId,
      accessListId,
      activeField,
      principalField,
      capabilityField,
      source: "active-access-row",
      activeOnly: capabilityParams.matchCardinality === "one",
      matchCardinality: capabilityParams.matchCardinality,
      commandDeclared: commandType === command.type,
      stateTransitionDeclared: transitionId === transition.id,
    },
    scope: {
      mode: capabilityContract.scope.mode,
      targetField: scopeTargetField,
      accessField: scopeAccessField,
      targetValueSource: "current-target-read",
      capabilityValueSource: "active-access-row",
      evaluation: "exact-match",
      checkedBeforeMutation: true,
    },
    effectiveOperation: { operation: "update", allowed: true },
  }];
}

function permissionSections(
  contract: ProjectContract,
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
): { readonly models: readonly unknown[]; readonly probes: readonly unknown[] } | undefined {
  const models: unknown[] = [];
  const probes: unknown[] = [];
  for (const list of contract.sharePoint.lists) {
    const model = oneRole(flow, `permission-model:${list.id}`);
    const readback = oneRole(flow, `permission-readback:${list.id}`);
    const parameters = model === undefined ? undefined : actionParameters(model);
    if (
      !connectorMatches(model, "POST", [list.titleBinding, "breakroleinheritance("])
      || !connectorMatches(readback, "GET", [list.titleBinding, "/roleassignments"])
      || !succeedsAfter(readback, model)
      || parameters === undefined
      || parameters.listId !== list.id
      || typeof parameters.inheritance !== "string"
      || typeof parameters.directUserGrants !== "string"
      || stringArrayValue(parameters.browserOperations) === undefined
      || !Array.isArray(parameters.grants)
      || !parameters.grants.every((grant) =>
        isRecord(grant)
        && typeof grant.principalKind === "string"
        && typeof grant.principalBinding === "string"
        && typeof grant.role === "string"
        && stringArrayValue(grant.allowedOperations) !== undefined
      )
    ) return undefined;
    models.push({
      listId: parameters.listId,
      inheritance: parameters.inheritance,
      directUserGrants: parameters.directUserGrants,
      browserOperations: parameters.browserOperations,
      grants: structuredClone(parameters.grants),
    });
    for (const role of list.permissions.minimumRoles) {
      const probeRole = `permission-probe:${list.id}:${role.principalBinding}`;
      const assertRole = `permission-assert:${list.id}:${role.principalBinding}`;
      const probe = oneRole(flow, probeRole);
      const assertion = oneRole(flow, assertRole);
      const probeParams = probe === undefined ? undefined : actionParameters(probe);
      const expression = conditionExpression(assertion);
      const operations = probeParams === undefined ? undefined : booleanMap(probeParams.operations);
      if (
        !connectorMatches(probe, "GET", [list.titleBinding, "getusereffectivepermissions", role.principalBinding])
        || assertion === undefined
        || !succeedsAfter(assertion, probe)
        || probeParams?.listId !== list.id
        || probeParams.principalBinding !== role.principalBinding
        || operations === undefined
        || expression === undefined
        || !Object.entries(operations).every(([operation, allowed]) =>
          expression.includes(`operations/${operation}`) && expression.includes(`${allowed}`)
        )
      ) return undefined;
      probes.push({
        listId: probeParams.listId,
        principalBinding: probeParams.principalBinding,
        operations: structuredClone(operations),
      });
    }
  }
  return { models, probes };
}

function fieldOperationsFromDefinition(
  contract: ProjectContract,
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
): readonly unknown[] | undefined {
  const operations: unknown[] = [];
  for (const list of contract.sharePoint.lists) {
    for (const field of list.fields) {
      const read = oneRole(flow, `field-read:${list.id}:${field.internalName}`);
      const write = oneRole(flow, `field-write:${list.id}:${field.internalName}`);
      const parameters = write === undefined ? undefined : actionParameters(write);
      const body = write === undefined ? undefined : actionInputs(write)?.body;
      if (
        !connectorMatches(read, "GET", [list.titleBinding, `getbyinternalnameortitle('${field.internalName}')`])
        || !connectorMatches(write, "POST", [list.titleBinding, "/fields"])
        || !succeedsAfter(write, read)
        || parameters === undefined
        || parameters.listId !== list.id
        || parameters.logicalName !== field.logicalName
        || parameters.internalName !== field.internalName
        || typeof parameters.metadataType !== "string"
        || !Number.isSafeInteger(parameters.fieldTypeKind)
        || stringArrayValue(parameters.comparedProperties) === undefined
        || !isRecord(body)
        || !isRecord(body.__metadata)
        || body.__metadata.type !== parameters.metadataType
        || body.FieldTypeKind !== parameters.fieldTypeKind
      ) return undefined;
      operations.push({
        listId: parameters.listId,
        logicalName: parameters.logicalName,
        identity: {
          source: "field-readback",
          internalName: parameters.internalName,
          entityPropertyName: parameters.internalName,
        },
        uses: [{ operation: "readback", fieldName: parameters.internalName, source: "entity-property-name" }],
        createPayload: {
          serialization: "structured-json",
          metadataType: parameters.metadataType,
          fieldTypeKind: parameters.fieldTypeKind,
        },
        ...(typeof parameters.indexMetadataType === "string"
          ? { indexPayload: { serialization: "structured-json", metadataType: parameters.indexMetadataType } }
          : {}),
        compatibility: {
          response: "GET_FAILED",
          comparedProperties: parameters.comparedProperties,
          outcome: "GET_FAILED",
          writeAction: "none",
        },
      });
    }
  }
  return operations.length > 0 ? operations : undefined;
}

function httpFromDefinition(
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
): readonly unknown[] | undefined {
  const classifier = oneRole(flow, "http-classifier");
  const expression = conditionExpression(classifier);
  return expression !== undefined
      && expression.includes("400")
      && expression.includes("-2147024809")
      && expression.includes("404")
      && expression.includes("preflight")
      && expression.includes("initial-get")
    ? [
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
      ]
    : undefined;
}

function indexPlansFromDefinition(
  contract: ProjectContract,
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
): readonly unknown[] | undefined {
  const plans: unknown[] = [];
  const indexedLists = contract.sharePoint.lists.filter(({ indexes }) => indexes.length > 0);
  for (const list of indexedLists) {
    const read = oneRole(flow, `index-read:${list.id}`);
    const digest = oneRole(flow, `index-digest:${list.id}`);
    const finalReadback = oneRole(flow, `index-final-readback:${list.id}`);
    const readParams = read === undefined ? undefined : actionParameters(read);
    const digestParams = digest === undefined ? undefined : actionParameters(digest);
    const finalParams = finalReadback === undefined ? undefined : actionParameters(finalReadback);
    const writes = [...rolesByPrefix(flow, `index-write:${list.id}`)]
      .sort((left, right) => {
        const leftSequence = Number(actionParameters(left)?.sequence ?? Number.MAX_SAFE_INTEGER);
        const rightSequence = Number(actionParameters(right)?.sequence ?? Number.MAX_SAFE_INTEGER);
        return leftSequence - rightSequence;
      });
    if (
      !connectorMatches(read, "GET", [list.titleBinding, "/fields", "$select=InternalName,Indexed"])
      || !connectorMatches(digest, "POST", ["/_api/contextinfo"])
      || !succeedsAfter(digest, read)
      || readParams?.listId !== list.id
      || digestParams?.listId !== list.id
      || digestParams.bindsCurrent !== true
      || digestParams.bindsRequired !== true
      || stringArrayValue(readParams.currentFields) === undefined
      || stringArrayValue(readParams.requiredFields) === undefined
      || finalParams?.listId !== list.id
      || stringArrayValue(finalParams.observedFields) === undefined
    ) return undefined;
    const operations: unknown[] = [];
    let predecessor = digest;
    for (const [index, write] of writes.entries()) {
      const parameters = actionParameters(write);
      const field = parameters?.field;
      const operation = parameters?.operation;
      const sequence = parameters?.sequence;
      const body = actionInputs(write)?.body;
      const headers = actionInputs(write)?.headers;
      const readback = typeof field === "string"
        ? oneRole(flow, `index-step-readback:${list.id}:${field}`)
        : undefined;
      const readbackParams = readback === undefined ? undefined : actionParameters(readback);
      if (
        typeof field !== "string"
        || !["add", "remove"].includes(String(operation))
        || sequence !== index + 1
        || !connectorMatches(write, "POST", [list.titleBinding, `getbyinternalnameortitle('${field}')`])
        || !succeedsAfter(write, predecessor)
        || !isRecord(headers)
        || typeof headers["X-RequestDigest"] !== "string"
        || !String(headers["X-RequestDigest"]).includes(digest.id)
        || !isRecord(body)
        || !isRecord(body.__metadata)
        || body.__metadata.type !== "SP.Field"
        || body.Indexed !== (operation === "add")
        || !connectorMatches(readback, "GET", [list.titleBinding, "/fields", "$select=InternalName,Indexed"])
        || !succeedsAfter(readback, write)
        || stringArrayValue(readbackParams?.observedFields) === undefined
      ) return undefined;
      operations.push({
        sequence,
        kind: operation,
        field,
        ...(operation === "add" ? { payloadMetadataType: "SP.Field" } : {}),
        readback: { performed: true, observedFields: readbackParams!.observedFields },
      });
      predecessor = readback;
    }
    if (
      finalReadback === undefined
      || !connectorMatches(finalReadback, "GET", [list.titleBinding, "/fields", "$select=InternalName,Indexed"])
      || !succeedsAfter(finalReadback, predecessor)
    ) return undefined;
    plans.push({
      listId: readParams.listId,
      currentFields: readParams.currentFields,
      requiredFields: readParams.requiredFields,
      execution: "serial",
      digest: { fresh: true, bindsCurrent: true, bindsRequired: true },
      result: writes.length === 0 ? "NO_OP" : "APPLY",
      maximumWrites: writes.length,
      writeCount: writes.length,
      operations,
      finalReadback: finalParams.observedFields,
    });
  }
  return plans;
}

function builderSections(
  contract: ProjectContract,
  definition: DefinitionRuleEvidence,
): ReadonlyMap<Wp06AdapterDerivation["section"], readonly unknown[]> | undefined {
  const flow = definition.flow;
  if (flow === undefined || definition.failure !== undefined) return undefined;
  const roleNames = [...flow.actions.values()]
    .map(({ declaredRole }) => declaredRole)
    .filter((role): role is string => role !== undefined);
  if (new Set(roleNames).size !== roleNames.length) return undefined;
  const authority = authorityFromDefinition(contract, flow);
  const permissions = permissionSections(contract, flow);
  const fields = fieldOperationsFromDefinition(contract, flow);
  const http = httpFromDefinition(flow);
  const indexes = indexPlansFromDefinition(contract, flow);
  if (
    authority === undefined
    || permissions === undefined
    || fields === undefined
    || http === undefined
    || indexes === undefined
  ) return undefined;
  return new Map([
    ["authorityChecks", authority],
    ["permissionModels", permissions.models],
    ["permissionProbes", permissions.probes],
    ["fieldOperations", fields],
    ["httpClassifications", http],
    ["indexPlans", indexes],
  ]);
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
  const semantics = frontendSemantics(text, source.relativePath);
  if (semantics === undefined) return [];
  const facts = frontendFacts(semantics);
  return (["saveTransactions", "paginationTraversals", "odataRequests"] as const)
    .map((section) => derivation(contract, source, "frontend", section, facts[section] ?? []))
    .filter((item): item is Wp06AdapterDerivation => item !== undefined);
}

export function deriveDefinitionWp06(
  contract: ProjectContract,
  source: DefinitionRuleEvidence,
): readonly Wp06AdapterDerivation[] {
  const sections = builderSections(contract, source);
  if (sections === undefined) return [];
  return [...sections]
    .map(([section, facts]) => derivation(contract, source, "builder", section, facts))
    .filter((item): item is Wp06AdapterDerivation => item !== undefined);
}
