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

function constantBoolean(expression: ts.Expression): boolean | undefined {
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isParenthesizedExpression(expression)) return constantBoolean(expression.expression);
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
    const value = constantBoolean(expression.operand);
    return value === undefined ? undefined : !value;
  }
  return undefined;
}

function statementTerminates(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.some(statementTerminates);
  if (!ts.isIfStatement(statement)) return false;
  const condition = constantBoolean(statement.expression);
  if (condition === true) return statementTerminates(statement.thenStatement);
  if (condition === false) {
    return statement.elseStatement !== undefined && statementTerminates(statement.elseStatement);
  }
  return statement.elseStatement !== undefined
    && statementTerminates(statement.thenStatement)
    && statementTerminates(statement.elseStatement);
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
  if (
    helper?.body === undefined
    || helper.body.statements.length !== 3
    || hasUnreachableTopLevel(helper.body)
  ) return false;
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
  if (
    helper?.body === undefined
    || helper.body.statements.length !== 3
    || hasUnreachableTopLevel(helper.body)
  ) return false;
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
  if (
    save?.body === undefined
    || save.body.statements.length !== 6
    || hasUnreachableTopLevel(save.body)
  ) return false;
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
  if (
    pagination?.body === undefined
    || pagination.body.statements.length !== 6
    || hasUnreachableTopLevel(pagination.body)
  ) return undefined;
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
  if (
    odata?.body === undefined
    || odata.body.statements.length !== 8
    || hasUnreachableTopLevel(odata.body)
  ) return false;
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

function runsAfterStatuses(
  action: NormalizedAction,
  predecessor: NormalizedAction,
  expectedStatuses: readonly string[],
): boolean {
  const match = action.runAfter.filter(({ actionId }) => actionId === predecessor.id);
  const expected = [...expectedStatuses].sort();
  return action.containerId === predecessor.containerId
    && match.length === 1
    && match[0]?.statuses.length === expected.length
    && match[0]?.statuses.every((status, index) => status === expected[index]);
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

interface CanonicalConnectorUri {
  readonly path: string;
  readonly query: ReadonlyMap<string, string>;
}

function canonicalConnectorUri(action: NormalizedAction | undefined): CanonicalConnectorUri | undefined {
  const uri = action === undefined ? undefined : actionUri(action);
  if (
    action?.connector?.operationId !== "HttpRequest"
    || action.connector.uriClass !== "relative"
    || uri === undefined
    || !uri.startsWith("/_api/")
    || uri.includes("#")
    || uri.includes("\\")
    || /[\u0000-\u001f\u007f]/.test(uri)
    || /%(?:2f|3f|23|5c)/i.test(uri)
  ) return undefined;
  const separator = uri.indexOf("?");
  const path = separator === -1 ? uri : uri.slice(0, separator);
  const queryText = separator === -1 ? "" : uri.slice(separator + 1);
  if (queryText.includes("?")) return undefined;
  const parsed = new URLSearchParams(queryText);
  const query = new Map<string, string>();
  for (const [key, value] of parsed) {
    if (key.length === 0 || query.has(key)) return undefined;
    query.set(key, value);
  }
  return { path, query };
}

function queryMatches(
  actual: ReadonlyMap<string, string>,
  expected: Readonly<Record<string, string>>,
): boolean {
  const entries = Object.entries(expected);
  return actual.size === entries.length
    && entries.every(([key, value]) => actual.get(key) === value);
}

function connectorMatches(
  action: NormalizedAction | undefined,
  method: string,
  path: string,
  query: Readonly<Record<string, string>> = {},
): action is NormalizedAction {
  const uri = canonicalConnectorUri(action);
  return action !== undefined
    && actionMethod(action) === method
    && uri?.path === path
    && queryMatches(uri.query, query);
}

function stringArrayValue(value: unknown): readonly string[] | undefined {
  return Array.isArray(value)
      && value.every((item): item is string => typeof item === "string")
      && new Set(value).size === value.length
    ? value
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

function conditionExpression(action: NormalizedAction | undefined): string | undefined {
  if (action === undefined || !["Condition", "If"].includes(action.type)) return undefined;
  const direct = actionInputs(action)?.expression;
  if (typeof direct === "string") return direct;
  return action.expressions.length === 1 ? action.expressions[0]?.source : undefined;
}

function listEndpoint(titleBinding: string): string {
  return `/_api/web/lists/getbytitle('${titleBinding}')`;
}

function conditionMatches(action: NormalizedAction | undefined, expected: string): action is NormalizedAction {
  return action !== undefined
    && action.expressions.length === 1
    && action.expressions[0]?.valid === true
    && conditionExpression(action) === expected;
}

function childRole(
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
  parent: NormalizedAction,
  branch: NormalizedAction["controlBranch"],
  role: string,
): NormalizedAction | undefined {
  const matches = [...flow.actions.values()].filter((action) =>
    action.parentId === parent.id
    && action.controlBranch === branch
    && action.declaredRole === role
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function conditionFailsClosed(
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
  condition: NormalizedAction,
): boolean {
  const falseActions = [...flow.actions.values()].filter((action) =>
    action.parentId === condition.id && action.controlBranch === "condition-false"
  );
  return falseActions.length === 1
    && falseActions[0]?.type === "Terminate"
    && falseActions[0]?.terminationStatus === "Failed";
}

function bodyRecord(action: NormalizedAction | undefined): UnknownRecord | undefined {
  const body = action === undefined ? undefined : actionInputs(action)?.body;
  return isRecord(body) ? body : undefined;
}

function exactRecord(value: UnknownRecord | undefined, expected: UnknownRecord): boolean {
  if (value === undefined) return false;
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && expectedKeys.every((key) => JSON.stringify(value[key]) === JSON.stringify(expected[key]));
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
  const readback = oneRole(flow, "mutation-readback");
  const readbackAssert = oneRole(flow, "mutation-readback-assert");
  const accessPath = listEndpoint(accessList.titleBinding);
  const targetPath = listEndpoint(targetList.titleBinding);
  const scopeField = capabilityContract.scope.targetField;
  const accessField = capabilityContract.scope.accessField;
  const stateMachine = contract.stateMachines.find(({ transitions }) =>
    transitions.some(({ id }) => id === transition.id)
  );
  if (scopeField === undefined || accessField === undefined || stateMachine === undefined) {
    return undefined;
  }
  const selectedCapabilityFields = [
    capabilityContract.activeField,
    capabilityContract.principalField,
    capabilityContract.capabilityField,
    ...(accessField === undefined ? [] : [accessField]),
  ].filter((field, index, fields) => fields.indexOf(field) === index);
  const selectedTargetFields = [
    ...command.serverReadFields,
    ...(stateMachine === undefined ? [] : [stateMachine.field]),
  ].filter((field, index, fields) => fields.indexOf(field) === index);
  const targetItemPath = `${targetPath}/items(@{triggerBody()['${command.targetIdField}']})`;
  const capabilityFilter = `${capabilityContract.activeField} eq 1 and `
    + `${capabilityContract.principalField} eq '@{body('${identity?.id ?? ""}')['LoginName']}' and `
    + `${capabilityContract.capabilityField} eq '${capabilityContract.id}'`;
  const expectedGuard = `@and(equals(length(body('${capability?.id ?? ""}')['value']),1),`
    + `equals(body('${capability?.id ?? ""}')['value'][0]['${accessField}'],body('${target?.id ?? ""}')['${scopeField}']),`
    + `equals(triggerBody()['CommandType'],'${command.type}'),`
    + `equals(body('${target?.id ?? ""}')['${stateMachine.field}'],'${transition.from[0] ?? ""}'))`;
  const expectedReadback = `@equals(body('${readback?.id ?? ""}')['${stateMachine.field}'],'${transition.to}')`;
  if (
    !connectorMatches(identity, "GET", "/_api/web/currentuser", { $select: "Id,LoginName" })
    || !connectorMatches(capability, "GET", `${accessPath}/items`, {
      $select: selectedCapabilityFields.join(","),
      $filter: capabilityFilter,
    })
    || !connectorMatches(target, "GET", targetItemPath, { $select: selectedTargetFields.join(",") })
    || guard === undefined
    || mutation === undefined
    || readback === undefined
    || readbackAssert === undefined
    || !connectorMatches(mutation, "POST", targetItemPath)
    || !connectorMatches(readback, "GET", targetItemPath, { $select: stateMachine.field })
    || !succeedsAfter(capability, identity)
    || !succeedsAfter(target, capability)
    || !succeedsAfter(guard, target)
    || mutation.parentId !== guard.id
    || mutation.controlBranch !== "condition-true"
    || readback.parentId !== guard.id
    || readback.controlBranch !== "condition-true"
    || readbackAssert.parentId !== guard.id
    || readbackAssert.controlBranch !== "condition-true"
    || !succeedsAfter(readback, mutation)
    || !succeedsAfter(readbackAssert, readback)
    || !conditionFailsClosed(flow, guard)
    || !conditionFailsClosed(flow, readbackAssert)
    || mutation.connector?.overrideMethod !== "MERGE"
    || mutation.connector.ifMatch !== `@{body('${target.id}')['@odata.etag']}`
    || !exactRecord(bodyRecord(mutation), { [stateMachine.field]: transition.to })
    || !conditionMatches(guard, expectedGuard)
    || !conditionMatches(readbackAssert, expectedReadback)
  ) return undefined;
  return [{
    commandType: command.type,
    targetListId: targetList.id,
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
      id: capabilityContract.id,
      accessListId: accessList.id,
      activeField: capabilityContract.activeField,
      principalField: capabilityContract.principalField,
      capabilityField: capabilityContract.capabilityField,
      source: "active-access-row",
      activeOnly: true,
      matchCardinality: "one",
      commandDeclared: true,
      stateTransitionDeclared: true,
    },
    scope: {
      mode: capabilityContract.scope.mode,
      targetField: scopeField,
      accessField,
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
  let expectedGrantCount = 0;
  const operationUniverse = ["create", "delete", "read", "update"] as const;
  for (const list of contract.sharePoint.lists) {
    const model = oneRole(flow, `permission-model:${list.id}`);
    if (
      !connectorMatches(
        model,
        "POST",
        `${listEndpoint(list.titleBinding)}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`,
      )
    ) return undefined;
    const grants: unknown[] = [];
    let predecessor = model;
    let finalReadback: NormalizedAction | undefined;
    models.push({
      listId: list.id,
      inheritance: list.permissions.inheritance,
      directUserGrants: "forbidden",
      browserOperations: list.role === "protected-domain"
        ? list.writeModel === "direct-patch" ? ["read", "update"] : ["read"]
        : list.role === "command-queue" ? ["read", "create"]
        : ["reference", "outbox"].includes(list.role) ? ["read"] : [],
      grants,
    });
    for (const role of list.permissions.minimumRoles) {
      expectedGrantCount += 1;
      const principal = oneRole(flow, `permission-principal:${list.id}:${role.principalBinding}`);
      const roleRead = oneRole(flow, `permission-role:${list.id}:${role.principalBinding}`);
      const grant = oneRole(flow, `permission-grant:${list.id}:${role.principalBinding}`);
      const readback = oneRole(flow, `permission-readback:${list.id}:${role.principalBinding}`);
      const grantAssert = oneRole(flow, `permission-grant-assert:${list.id}:${role.principalBinding}`);
      const principalLiteral = role.principalBinding.replaceAll("'", "''");
      const roleLiteral = role.role.replaceAll("'", "''");
      const grantPath = `${listEndpoint(list.titleBinding)}/roleassignments/addroleassignment(`
        + `principalid=@{body('${principal?.id ?? ""}')['Id']},`
        + `roledefid=@{body('${roleRead?.id ?? ""}')['Id']})`;
      const grantAssertion = `@and(`
        + `contains(string(body('${readback?.id ?? ""}')),'${principalLiteral}'),`
        + `contains(string(body('${readback?.id ?? ""}')),'${roleLiteral}'))`;
      if (
        !connectorMatches(
          principal,
          "GET",
          "/_api/web/siteusers/getbyloginname(@p)",
          { "@p": `'${principalLiteral}'` },
        )
        || !connectorMatches(
          roleRead,
          "GET",
          `/_api/web/roledefinitions/getbyname('${roleLiteral}')`,
          { $select: "Id,Name" },
        )
        || !connectorMatches(grant, "POST", grantPath)
        || !connectorMatches(
          readback,
          "GET",
          `${listEndpoint(list.titleBinding)}/roleassignments`,
          { $expand: "Member,RoleDefinitionBindings" },
        )
        || !succeedsAfter(principal, predecessor)
        || !succeedsAfter(roleRead, principal)
        || !succeedsAfter(grant, roleRead)
        || !succeedsAfter(readback, grant)
        || grantAssert === undefined
        || !succeedsAfter(grantAssert, readback)
        || !conditionMatches(grantAssert, grantAssertion)
        || !conditionFailsClosed(flow, grantAssert)
      ) return undefined;
      grants.push({
        principalKind: "binding",
        principalBinding: role.principalBinding,
        role: role.role,
        allowedOperations: [...role.allowedOperations],
      });
      const probeRole = `permission-probe:${list.id}:${role.principalBinding}`;
      const assertRole = `permission-assert:${list.id}:${role.principalBinding}`;
      const probe = oneRole(flow, probeRole);
      const assertion = oneRole(flow, assertRole);
      const operations = Object.fromEntries(operationUniverse.map((operation) => [
        operation,
        role.allowedOperations.includes(operation),
      ]));
      const expectedAssertion = `@and(${operationUniverse.map((operation) =>
        `equals(body('${probe?.id ?? ""}')['operations/${operation}'],${operations[operation]})`
      ).join(",")})`;
      if (
        !connectorMatches(
          probe,
          "GET",
          `${listEndpoint(list.titleBinding)}/getusereffectivepermissions(@p)`,
          { "@p": `'${principalLiteral}'` },
        )
        || assertion === undefined
        || !succeedsAfter(probe, grantAssert)
        || !succeedsAfter(assertion, probe)
        || !conditionMatches(assertion, expectedAssertion)
        || !conditionFailsClosed(flow, assertion)
      ) return undefined;
      probes.push({
        listId: list.id,
        principalBinding: role.principalBinding,
        operations,
      });
      predecessor = assertion;
      finalReadback = readback;
    }
    if (list.permissions.minimumRoles.length === 0 || finalReadback === undefined) return undefined;
  }
  if (rolesByPrefix(flow, "permission-grant").length !== expectedGrantCount) return undefined;
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
        !connectorMatches(
          read,
          "GET",
          `${listEndpoint(list.titleBinding)}/fields/getbyinternalnameortitle('${field.internalName}')`,
        )
        || !connectorMatches(write, "POST", `${listEndpoint(list.titleBinding)}/fields`)
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
        || body.InternalName !== field.internalName
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
  contract: ProjectContract,
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
): readonly unknown[] | undefined {
  if (contract.commands.length !== 1) return undefined;
  const command = contract.commands[0]!;
  const target = contract.sharePoint.lists.find(({ id }) => id === command.targetListId);
  if (target === undefined) return undefined;
  const observation = oneRole(flow, "http-observation");
  const classifier = oneRole(flow, "http-classifier");
  if (observation === undefined || classifier === undefined) return undefined;
  const other400 = childRole(flow, classifier, "condition-false", "http-classifier:other-400");
  if (other400 === undefined) return undefined;
  const preflight404 = childRole(flow, other400, "condition-false", "http-classifier:preflight-404");
  if (preflight404 === undefined) return undefined;
  const strict404 = childRole(flow, preflight404, "condition-false", "http-classifier:strict-404");
  if (strict404 === undefined) return undefined;
  const targetPath = `${listEndpoint(target.titleBinding)}/items(@{triggerBody()['${command.targetIdField}']})`;
  const missingExpression = `@and(equals(outputs('${observation.id}')['statusCode'],400),`
    + `or(equals(body('${observation.id}')['error/code'],'-2147024809'),`
    + `equals(body('${observation.id}')['messageCategory'],'column-does-not-exist')))`;
  const other400Expression = `@equals(outputs('${observation.id}')['statusCode'],400)`;
  const preflight404Expression = `@and(equals(outputs('${observation.id}')['statusCode'],404),`
    + `equals(triggerBody()['Phase'],'preflight'),`
    + `equals(triggerBody()['RequestKind'],'initial-get'),`
    + `equals(triggerBody()['AllowCreateMissing404'],true))`;
  const strict404Expression = `@equals(outputs('${observation.id}')['statusCode'],404)`;
  const resultMatches = (
    parent: NormalizedAction,
    branch: NormalizedAction["controlBranch"],
    role: string,
    expected: string,
  ): boolean => {
    const action = childRole(flow, parent, branch, role);
    return action?.type === "Compose" && action.inputs === expected;
  };
  if (
    !connectorMatches(observation, "GET", targetPath, { $select: target.readAllowlist.join(",") })
    || !runsAfterStatuses(classifier, observation, ["Failed", "Succeeded"])
    || !conditionMatches(classifier, missingExpression)
    || !conditionMatches(other400, other400Expression)
    || !conditionMatches(preflight404, preflight404Expression)
    || !conditionMatches(strict404, strict404Expression)
    || !resultMatches(classifier, "condition-true", "http-result:missing-column", "MISSING_OBJECT")
    || !resultMatches(other400, "condition-true", "http-result:other-400", "GET_FAILED")
    || !resultMatches(preflight404, "condition-true", "http-result:preflight-404", "CREATE_MISSING")
    || !resultMatches(strict404, "condition-true", "http-result:strict-404", "GET_FAILED")
    || !resultMatches(strict404, "condition-false", "http-result:default", "GET_FAILED")
  ) return undefined;
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

function indexPlansFromDefinition(
  contract: ProjectContract,
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
): readonly unknown[] | undefined {
  const plans: unknown[] = [];
  const indexedLists = contract.sharePoint.lists.filter(({ indexes }) => indexes.length > 0);
  for (const list of indexedLists) {
    const requiredFields = [...list.indexes]
      .filter(({ required }) => required)
      .sort((left, right) => left.order - right.order || left.field.localeCompare(right.field, "en"))
      .map(({ field }) => field);
    if (requiredFields.length === 0) return undefined;
    const read = oneRole(flow, `index-read:${list.id}`);
    const guard = oneRole(flow, `index-plan-guard:${list.id}`);
    const planDigest = oneRole(flow, `index-plan-digest:${list.id}`);
    const requestDigest = oneRole(flow, `index-request-digest:${list.id}`);
    const finalReadback = oneRole(flow, `index-final-readback:${list.id}`);
    const finalAssert = oneRole(flow, `index-final-assert:${list.id}`);
    const listPath = listEndpoint(list.titleBinding);
    const filter = requiredFields.map((field) =>
      `InternalName eq '${field.replaceAll("'", "''")}'`
    ).join(" or ");
    const fieldQuery = {
      $select: "InternalName,Indexed",
      $filter: filter,
      $orderby: "InternalName",
    };
    const guardExpression = `@and(${requiredFields.flatMap((field, index) => [
      `equals(body('${read?.id ?? ""}')['value'][${index}]['InternalName'],'${field.replaceAll("'", "''")}')`,
      `equals(body('${read?.id ?? ""}')['value'][${index}]['Indexed'],false)`,
    ]).join(",")})`;
    const digestExpression = `@sha256(concat(string(body('${read?.id ?? ""}')['value']),'|','${requiredFields.join(",")}'))`;
    const finalExpression = `@and(${requiredFields.flatMap((field, index) => [
      `equals(body('${finalReadback?.id ?? ""}')['value'][${index}]['InternalName'],'${field.replaceAll("'", "''")}')`,
      `equals(body('${finalReadback?.id ?? ""}')['value'][${index}]['Indexed'],true)`,
    ]).join(",")})`;
    if (
      read === undefined
      || guard === undefined
      || planDigest === undefined
      || requestDigest === undefined
      || finalReadback === undefined
      || finalAssert === undefined
      || !connectorMatches(read, "GET", `${listPath}/fields`, fieldQuery)
      || !succeedsAfter(guard, read)
      || !conditionMatches(guard, guardExpression)
      || planDigest.parentId !== guard.id
      || planDigest.controlBranch !== "condition-true"
      || planDigest.type !== "Compose"
      || planDigest.inputs !== digestExpression
      || !connectorMatches(requestDigest, "POST", "/_api/contextinfo")
      || requestDigest.parentId !== guard.id
      || requestDigest.controlBranch !== "condition-true"
      || !succeedsAfter(requestDigest, planDigest)
      || !connectorMatches(finalReadback, "GET", `${listPath}/fields`, fieldQuery)
      || !succeedsAfter(finalReadback, guard)
      || !succeedsAfter(finalAssert, finalReadback)
      || !conditionMatches(finalAssert, finalExpression)
      || !conditionFailsClosed(flow, finalAssert)
    ) return undefined;
    const operations: unknown[] = [];
    let predecessor = requestDigest;
    for (const [index, field] of requiredFields.entries()) {
      const write = oneRole(flow, `index-write:${list.id}:${field}`);
      const body = write === undefined ? undefined : actionInputs(write)?.body;
      const headers = write === undefined ? undefined : actionInputs(write)?.headers;
      const readback = oneRole(flow, `index-step-readback:${list.id}:${field}`);
      const assertion = oneRole(flow, `index-step-assert:${list.id}:${field}`);
      const readbackExpression = `@and(`
        + `equals(body('${readback?.id ?? ""}')['InternalName'],'${field.replaceAll("'", "''")}'),`
        + `equals(body('${readback?.id ?? ""}')['Indexed'],true))`;
      if (
        write === undefined
        || readback === undefined
        || assertion === undefined
        || write.parentId !== guard.id
        || write.controlBranch !== "condition-true"
        || readback.parentId !== guard.id
        || readback.controlBranch !== "condition-true"
        || assertion.parentId !== guard.id
        || assertion.controlBranch !== "condition-true"
        || !connectorMatches(write, "POST", `${listPath}/fields/getbyinternalnameortitle('${field}')`)
        || !succeedsAfter(write, predecessor)
        || !isRecord(headers)
        || headers["X-RequestDigest"] !== `@{body('${requestDigest.id}')['FormDigestValue']}`
        || !isRecord(body)
        || !isRecord(body.__metadata)
        || body.__metadata.type !== "SP.Field"
        || body.Indexed !== true
        || !connectorMatches(
          readback,
          "GET",
          `${listPath}/fields/getbyinternalnameortitle('${field}')`,
          { $select: "InternalName,Indexed" },
        )
        || !succeedsAfter(readback, write)
        || !succeedsAfter(assertion, readback)
        || !conditionMatches(assertion, readbackExpression)
        || !conditionFailsClosed(flow, assertion)
      ) return undefined;
      operations.push({
        sequence: index + 1,
        kind: "add",
        field,
        payloadMetadataType: "SP.Field",
        readback: { performed: true, observedFields: [field] },
      });
      predecessor = assertion;
    }
    if (rolesByPrefix(flow, `index-write:${list.id}`).length !== requiredFields.length) return undefined;
    plans.push({
      listId: list.id,
      currentFields: [],
      requiredFields,
      execution: "serial",
      digest: { fresh: true, bindsCurrent: true, bindsRequired: true },
      result: "APPLY",
      maximumWrites: requiredFields.length,
      writeCount: requiredFields.length,
      operations,
      finalReadback: requiredFields,
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
  const http = httpFromDefinition(contract, flow);
  const indexes = indexPlansFromDefinition(contract, flow);
  const sections = new Map<Wp06AdapterDerivation["section"], readonly unknown[]>();
  if (authority !== undefined) sections.set("authorityChecks", authority);
  if (permissions !== undefined) {
    sections.set("permissionModels", permissions.models);
    sections.set("permissionProbes", permissions.probes);
  }
  if (fields !== undefined) sections.set("fieldOperations", fields);
  if (http !== undefined) sections.set("httpClassifications", http);
  if (indexes !== undefined && indexes.length > 0) sections.set("indexPlans", indexes);
  return sections.size === 0 ? undefined : sections;
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
