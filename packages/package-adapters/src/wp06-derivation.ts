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

function frontendSource(text: string, path: string): ts.SourceFile | undefined {
  const diagnostics = ts.transpileModule(text, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      allowJs: true,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).diagnostics ?? [];
  if (diagnostics.some(({ category }) => category === ts.DiagnosticCategory.Error)) return undefined;
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

interface AstShape {
  readonly kind: number;
  readonly text?: string;
  readonly children: readonly AstShape[];
}

function astShape(node: ts.Node): AstShape {
  const text = ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)
    ? node.text
    : undefined;
  const children: AstShape[] = [];
  ts.forEachChild(node, (child) => {
    children.push(astShape(child));
  });
  return text === undefined ? { kind: node.kind, children } : { kind: node.kind, text, children };
}

function grammarStatement(text: string): ts.Statement | undefined {
  const source = ts.createSourceFile("<frontend-grammar>.ts", text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  return source.statements.length === 1 ? source.statements[0] : undefined;
}

function statementMatches(actual: ts.Statement, expected: string): boolean {
  const parsed = grammarStatement(expected);
  return parsed !== undefined && JSON.stringify(astShape(actual)) === JSON.stringify(astShape(parsed));
}

function bodyMatches(body: ts.Block, expected: readonly string[]): boolean {
  return body.statements.length === expected.length
    && body.statements.every((statement, index) => statementMatches(statement, expected[index]!));
}

function functionHeaderMatches(
  declaration: ts.FunctionDeclaration | undefined,
  name: string,
  parameters: readonly string[],
  modifiers: readonly ts.SyntaxKind[],
): declaration is ts.FunctionDeclaration & { readonly body: ts.Block } {
  if (
    declaration?.body === undefined
    || declaration.name?.text !== name
    || declaration.asteriskToken !== undefined
    || declaration.type !== undefined
    || declaration.typeParameters !== undefined
  ) return false;
  const actualModifiers = declaration.modifiers?.map(({ kind }) => kind) ?? [];
  return actualModifiers.length === modifiers.length
    && actualModifiers.every((kind, index) => kind === modifiers[index])
    && declaration.parameters.length === parameters.length
    && declaration.parameters.every((parameter, index) =>
      ts.isIdentifier(parameter.name)
      && parameter.name.text === parameters[index]
      && parameter.initializer === undefined
      && parameter.type === undefined
      && parameter.dotDotDotToken === undefined
      && parameter.questionToken === undefined
      && parameter.modifiers === undefined
    );
}

function policyDeclaration(statement: ts.Statement, name: string): boolean {
  return ts.isVariableStatement(statement)
    && (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
    && statement.declarationList.declarations.length === 1
    && ts.isIdentifier(statement.declarationList.declarations[0]!.name)
    && statement.declarationList.declarations[0]!.name.text === name;
}

function supportsFrontendInventory(source: ts.SourceFile): boolean {
  const names = [
    "allowlistedPatch",
    "freshDigest",
    "saveSharePointItem",
    "loadAllSharePointPages",
    "buildSharePointODataUrl",
  ] as const;
  return source.statements.length === 7
    && policyDeclaration(source.statements[0]!, "PATCH_ALLOWLISTS")
    && policyDeclaration(source.statements[1]!, "READ_ALLOWLISTS")
    && source.statements.slice(2).every((statement, index) =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === names[index]
    );
}

function supportsPatchHelper(source: ts.SourceFile): boolean {
  const helper = topLevelFunction(source, "allowlistedPatch");
  return functionHeaderMatches(helper, "allowlistedPatch", ["listId", "patch"], [])
    && bodyMatches(helper.body, [
      "const fields = PATCH_ALLOWLISTS[listId];",
      'if (!fields) throw new Error("unknown-list");',
      "return Object.fromEntries(fields.map((field) => [field, patch[field]]));",
    ]);
}

function supportsFreshDigest(source: ts.SourceFile): boolean {
  const helper = topLevelFunction(source, "freshDigest");
  return functionHeaderMatches(helper, "freshDigest", ["itemUrl"], [ts.SyntaxKind.AsyncKeyword])
    && bodyMatches(helper.body, [
      'const response = await globalThis.fetch(new URL("/_api/contextinfo", itemUrl), { method: "POST" });',
      "const body = await response.json();",
      "return body.FormDigestValue;",
    ]);
}

function supportsSave(source: ts.SourceFile): boolean {
  const save = topLevelFunction(source, "saveSharePointItem");
  return functionHeaderMatches(
    save,
    "saveSharePointItem",
    ["listId", "itemUrl", "etag", "patch"],
    [ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.AsyncKeyword],
  )
    && bodyMatches(save.body, [
      "const body = allowlistedPatch(listId, patch);",
      "const digest = await freshDigest(itemUrl);",
      `const response = await globalThis.fetch(itemUrl, {
        method: "POST",
        headers: {
          "X-HTTP-Method": "MERGE",
          "IF-MATCH": etag,
          "X-RequestDigest": digest
        },
        body: JSON.stringify(body)
      });`,
      'if (response.status === 412) throw new Error("conflict");',
      'if (!response.ok) return globalThis.fetch(itemUrl, { method: "GET" });',
      'return globalThis.fetch(itemUrl, { method: "GET" });',
    ])
    && supportsPatchHelper(source)
    && supportsFreshDigest(source);
}

function paginationLimit(loop: ts.WhileStatement): number | undefined {
  if (!ts.isBlock(loop.statement)) return undefined;
  const guard = loop.statement.statements[1];
  if (
    guard === undefined
    || !ts.isIfStatement(guard)
    || !ts.isBinaryExpression(guard.expression)
    || guard.expression.operatorToken.kind !== ts.SyntaxKind.GreaterThanToken
    || !ts.isIdentifier(guard.expression.left)
    || guard.expression.left.text !== "pages"
    || !ts.isNumericLiteral(guard.expression.right)
  ) return undefined;
  const value = Number(guard.expression.right.text);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function supportsPagination(source: ts.SourceFile): number | undefined {
  const pagination = topLevelFunction(source, "loadAllSharePointPages");
  if (!functionHeaderMatches(
    pagination,
    "loadAllSharePointPages",
    ["initialUrl", "expectedOrigin", "expectedPathname"],
    [ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.AsyncKeyword],
  )) return undefined;
  const loop = pagination.body.statements[4];
  if (loop === undefined || !ts.isWhileStatement(loop)) return undefined;
  const limit = paginationLimit(loop);
  if (limit === undefined) return undefined;
  return bodyMatches(pagination.body, [
    "const visited = new Set();",
    "const items = [];",
    "let next = initialUrl;",
    "let pages = 0;",
    `while (next) {
      pages += 1;
      if (pages > ${limit}) throw new Error("page-limit");
      const pageUrl = new URL(next);
      if (pageUrl.origin !== expectedOrigin || !pageUrl.pathname.startsWith(expectedPathname)) throw new Error("boundary");
      if (visited.has(pageUrl.href)) throw new Error("loop");
      visited.add(pageUrl.href);
      const response = await globalThis.fetch(pageUrl, { method: "GET" });
      const body = await response.json();
      items.push(...body.value);
      next = body["@odata.nextLink"];
    }`,
    "return items;",
  ]) ? limit : undefined;
}

function supportsOData(source: ts.SourceFile): boolean {
  const odata = topLevelFunction(source, "buildSharePointODataUrl");
  return functionHeaderMatches(
    odata,
    "buildSharePointODataUrl",
    ["base", "listId", "value"],
    [ts.SyntaxKind.ExportKeyword],
  ) && bodyMatches(odata.body, [
    "const fields = READ_ALLOWLISTS[listId];",
    'if (!fields) throw new Error("unknown-list");',
    "const url = new URL(base);",
    "const params = new URLSearchParams();",
    'params.set("$select", fields.join(","));',
    'params.set("$filter", value.replaceAll("\'", "\'\'"));',
    "url.search = params.toString();",
    "return url;",
  ]);
}

function frontendSemantics(text: string, path: string): FrontendSemantics | undefined {
  const source = frontendSource(text, path);
  if (source === undefined || !supportsFrontendInventory(source)) return undefined;
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

function branchHasExactly(
  flow: NonNullable<DefinitionRuleEvidence["flow"]>,
  parent: NormalizedAction,
  branch: NormalizedAction["controlBranch"],
  expected: readonly NormalizedAction[],
): boolean {
  const actual = [...flow.actions.values()]
    .filter((action) => action.parentId === parent.id && action.controlBranch === branch)
    .map(({ id }) => id)
    .sort();
  const expectedIds = expected.map(({ id }) => id).sort();
  return actual.length === expectedIds.length
    && actual.every((id, index) => id === expectedIds[index]);
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
  const ownerField = targetList.fields.find(({ logicalName }) => logicalName === "owner")?.internalName;
  const amountField = targetList.fields.find(({ logicalName }) => logicalName === "amount")?.internalName;
  if (
    ownerField === undefined
    || amountField === undefined
    || !command.serverReadFields.includes(ownerField)
    || !command.serverReadFields.includes(amountField)
  ) return undefined;
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
    + `not(empty(body('${target?.id ?? ""}')['${ownerField}'])),`
    + `greaterOrEquals(body('${target?.id ?? ""}')['${amountField}'],0),`
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
    if (list.permissions.inheritance !== "break-clear") return undefined;
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
      inheritance: "break-clear",
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
  const payloads: Readonly<Record<string, readonly [string, number]>> = {
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
  const expressionLiteral = (value: unknown): string | undefined =>
    typeof value === "string" ? `'${value.replaceAll("'", "''")}'`
    : typeof value === "number" || typeof value === "boolean" ? String(value)
    : undefined;
  const expectedProperties = (field: ProjectContract["sharePoint"]["lists"][number]["fields"][number]) => ({
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
  });
  const comparisonExpression = (
    action: NormalizedAction | undefined,
    field: ProjectContract["sharePoint"]["lists"][number]["fields"][number],
  ): string | undefined => {
    const expected = expectedProperties(field);
    const comparisons = Object.entries(expected).map(([property, value]) => {
      const literal = expressionLiteral(value);
      return literal === undefined || action === undefined
        ? undefined
        : `equals(body('${action.id}')['${property}'],${literal})`;
    });
    return comparisons.every((item): item is string => item !== undefined)
      ? `@and(equals(body('${action?.id ?? ""}')['InternalName'],'${field.internalName}'),`
        + `equals(body('${action?.id ?? ""}')['EntityPropertyName'],'${field.internalName}'),`
        + `${comparisons.join(",")})`
      : undefined;
  };
  for (const list of contract.sharePoint.lists) {
    for (const field of list.fields) {
      const read = oneRole(flow, `field-read:${list.id}:${field.internalName}`);
      const found = oneRole(flow, `field-found:${list.id}:${field.internalName}`);
      const foundAssert = oneRole(flow, `field-found-assert:${list.id}:${field.internalName}`);
      const missing = oneRole(flow, `field-missing:${list.id}:${field.internalName}`);
      const write = oneRole(flow, `field-write:${list.id}:${field.internalName}`);
      const readback = oneRole(flow, `field-readback:${list.id}:${field.internalName}`);
      const readbackAssert = oneRole(flow, `field-readback-assert:${list.id}:${field.internalName}`);
      const body = write === undefined ? undefined : actionInputs(write)?.body;
      const payload = payloads[field.type];
      const createBody = payload === undefined ? undefined : {
        __metadata: { type: payload[0] },
        FieldTypeKind: payload[1],
        InternalName: field.internalName,
        Required: field.required,
        Indexed: field.indexed,
        EnforceUniqueValues: field.unique,
        ...(field.maxLength === undefined ? {} : { MaxLength: field.maxLength }),
      };
      const properties = Object.keys(expectedProperties(field));
      const select = ["InternalName", "EntityPropertyName", ...properties].filter((value, index, values) =>
        values.indexOf(value) === index
      ).join(",");
      const foundExpression = `@equals(outputs('${read?.id ?? ""}')['statusCode'],200)`;
      const missingExpression = `@equals(outputs('${read?.id ?? ""}')['statusCode'],404)`;
      const foundComparison = comparisonExpression(read, field);
      const readbackComparison = comparisonExpression(readback, field);
      if (
        read === undefined
        || found === undefined
        || foundAssert === undefined
        || missing === undefined
        || write === undefined
        || readback === undefined
        || readbackAssert === undefined
        || !connectorMatches(
          read,
          "GET",
          `${listEndpoint(list.titleBinding)}/fields/getbyinternalnameortitle('${field.internalName}')`,
          { $select: select },
        )
        || !connectorMatches(write, "POST", `${listEndpoint(list.titleBinding)}/fields`)
        || !connectorMatches(
          readback,
          "GET",
          `${listEndpoint(list.titleBinding)}/fields/getbyinternalnameortitle('${field.internalName}')`,
          { $select: select },
        )
        || payload === undefined
        || !runsAfterStatuses(found, read, ["Failed", "Succeeded"])
        || !conditionMatches(found, foundExpression)
        || !branchHasExactly(flow, found, "condition-true", [foundAssert])
        || !branchHasExactly(flow, found, "condition-false", [missing])
        || foundAssert?.parentId !== found.id
        || foundAssert.controlBranch !== "condition-true"
        || foundComparison === undefined
        || !conditionMatches(foundAssert, foundComparison)
        || !conditionFailsClosed(flow, foundAssert)
        || !branchHasExactly(flow, foundAssert, "condition-true", [])
        || missing?.parentId !== found.id
        || missing.controlBranch !== "condition-false"
        || !conditionMatches(missing, missingExpression)
        || !conditionFailsClosed(flow, missing)
        || !branchHasExactly(flow, missing, "condition-true", [write, readback, readbackAssert])
        || write?.parentId !== missing.id
        || write.controlBranch !== "condition-true"
        || readback?.parentId !== missing.id
        || readback.controlBranch !== "condition-true"
        || readbackAssert?.parentId !== missing.id
        || readbackAssert.controlBranch !== "condition-true"
        || !succeedsAfter(readback, write)
        || !succeedsAfter(readbackAssert, readback)
        || readbackComparison === undefined
        || !conditionMatches(readbackAssert, readbackComparison)
        || !conditionFailsClosed(flow, readbackAssert)
        || !branchHasExactly(flow, readbackAssert, "condition-true", [])
        || !exactRecord(isRecord(body) ? body : undefined, createBody ?? {})
      ) return undefined;
      operations.push({
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
          metadataType: payload[0],
          fieldTypeKind: payload[1],
        },
        ...(field.indexed
          ? { indexPayload: { serialization: "structured-json", metadataType: "SP.Field" } }
          : {}),
        compatibility: {
          response: "MISSING_OBJECT",
          comparedProperties: properties,
          outcome: "CREATE_MISSING",
          writeAction: "create-approved-plan",
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
  const roleField = (action: NormalizedAction, prefix: string): string | undefined => {
    const role = action.declaredRole;
    const field = role?.startsWith(`${prefix}:`) === true ? role.slice(prefix.length + 1) : undefined;
    return field !== undefined && /^[A-Za-z_][A-Za-z0-9_]*$/.test(field) ? field : undefined;
  };
  const setExpression = (action: NormalizedAction | undefined, fields: readonly string[]): string => {
    if (fields.length === 0) return `@equals(length(body('${action?.id ?? ""}')['value']),0)`;
    return `@and(equals(length(body('${action?.id ?? ""}')['value']),${fields.length}),${fields.flatMap(
      (field, index) => [
        `equals(body('${action?.id ?? ""}')['value'][${index}]['InternalName'],'${field}')`,
        `equals(body('${action?.id ?? ""}')['value'][${index}]['Indexed'],true)`,
      ],
    ).join(",")})`;
  };
  for (const list of indexedLists) {
    const requiredFields = [...list.indexes]
      .filter(({ required }) => required)
      .sort((left, right) => left.order - right.order || left.field.localeCompare(right.field, "en"))
      .map(({ field }) => field);
    if (requiredFields.length === 0) return undefined;
    const read = oneRole(flow, `index-read:${list.id}`);
    const currentAssert = oneRole(flow, `index-current-assert:${list.id}`);
    const planDigest = oneRole(flow, `index-plan-digest:${list.id}`);
    const planAssert = oneRole(flow, `index-plan-assert:${list.id}`);
    const requestDigest = oneRole(flow, `index-request-digest:${list.id}`);
    const finalReadback = oneRole(flow, `index-final-readback:${list.id}`);
    const finalAssert = oneRole(flow, `index-final-assert:${list.id}`);
    const resultAction = oneRole(flow, `index-result:${list.id}`);
    const listPath = listEndpoint(list.titleBinding);
    const fieldQuery = {
      $select: "InternalName,Indexed",
      $filter: "Indexed eq true",
      $orderby: "InternalName",
    };
    const removePrefix = `index-remove:${list.id}`;
    const addPrefix = `index-add:${list.id}`;
    const removals = rolesByPrefix(flow, removePrefix);
    const additions = rolesByPrefix(flow, addPrefix);
    const removalFields = removals.map((action) => roleField(action, removePrefix));
    const additionFields = additions.map((action) => roleField(action, addPrefix));
    if (
      removalFields.some((field) => field === undefined)
      || additionFields.some((field) => field === undefined)
    ) return undefined;
    const removed = removalFields as string[];
    const added = additionFields as string[];
    if (
      new Set(removed).size !== removed.length
      || new Set(added).size !== added.length
      || removed.some((field) => requiredFields.includes(field))
      || added.some((field) => !requiredFields.includes(field))
    ) return undefined;
    const sortedRemovals = [...removed].sort((left, right) => left.localeCompare(right, "en"));
    const orderedAdditions = requiredFields.filter((field) => added.includes(field));
    const currentFields = [
      ...sortedRemovals,
      ...requiredFields.filter((field) => !orderedAdditions.includes(field)),
    ].sort((left, right) => left.localeCompare(right, "en"));
    const expectedOperations = [
      ...sortedRemovals.map((field) => ({ kind: "remove" as const, field })),
      ...orderedAdditions.map((field) => ({ kind: "add" as const, field })),
    ];
    if (removed.length + added.length !== expectedOperations.length) return undefined;
    const operationActions = new Map<string, NormalizedAction>();
    for (const action of [...removals, ...additions]) {
      const field = roleField(action, action.declaredRole?.startsWith(`${removePrefix}:`) === true
        ? removePrefix
        : addPrefix);
      const kind = action.declaredRole?.startsWith(`${removePrefix}:`) === true ? "remove" : "add";
      if (field === undefined) return undefined;
      operationActions.set(`${kind}:${field}`, action);
    }
    const digestExpression = `@sha256(concat(string(body('${read?.id ?? ""}')['value']),'|','${requiredFields.join(",")}'))`;
    const planAssertion = `@equals(triggerBody()['ApprovedPlanDigest'],outputs('${planDigest?.id ?? ""}'))`;
    const sortedRequired = [...requiredFields].sort((left, right) => left.localeCompare(right, "en"));
    const result = expectedOperations.length === 0 ? "NO_OP" : "APPLY";
    if (
      read === undefined
      || currentAssert === undefined
      || planDigest === undefined
      || planAssert === undefined
      || finalReadback === undefined
      || finalAssert === undefined
      || resultAction === undefined
      || !connectorMatches(read, "GET", `${listPath}/fields`, fieldQuery)
      || !succeedsAfter(currentAssert, read)
      || !conditionMatches(currentAssert, setExpression(read, currentFields))
      || !conditionFailsClosed(flow, currentAssert)
      || planDigest.parentId !== currentAssert.id
      || planDigest.controlBranch !== "condition-true"
      || planDigest.type !== "Compose"
      || planDigest.inputs !== digestExpression
      || planAssert.parentId !== currentAssert.id
      || planAssert.controlBranch !== "condition-true"
      || !succeedsAfter(planAssert, planDigest)
      || !conditionMatches(planAssert, planAssertion)
      || !conditionFailsClosed(flow, planAssert)
      || !branchHasExactly(flow, planAssert, "condition-true", [])
      || !connectorMatches(finalReadback, "GET", `${listPath}/fields`, fieldQuery)
      || finalReadback.parentId !== currentAssert.id
      || finalReadback.controlBranch !== "condition-true"
      || !succeedsAfter(finalAssert, finalReadback)
      || finalAssert.parentId !== currentAssert.id
      || finalAssert.controlBranch !== "condition-true"
        || !conditionMatches(finalAssert, setExpression(finalReadback, sortedRequired))
        || !conditionFailsClosed(flow, finalAssert)
        || !branchHasExactly(flow, finalAssert, "condition-true", [])
      || resultAction.parentId !== currentAssert.id
      || resultAction.controlBranch !== "condition-true"
      || resultAction.type !== "Compose"
      || !exactRecord(actionInputs(resultAction), {
        result,
        planDigest: `@{outputs('${planDigest.id}')}`,
      })
      || !succeedsAfter(resultAction, finalAssert)
    ) return undefined;
    if (result === "APPLY") {
      if (
        requestDigest === undefined
        || !connectorMatches(requestDigest, "POST", "/_api/contextinfo")
        || requestDigest.parentId !== currentAssert.id
        || requestDigest.controlBranch !== "condition-true"
        || !succeedsAfter(requestDigest, planAssert)
      ) return undefined;
    } else if (requestDigest !== undefined) {
      return undefined;
    }
    const operations: unknown[] = [];
    let predecessor = result === "APPLY" ? requestDigest! : planAssert;
    const observed = new Set(currentFields);
    for (const [index, operation] of expectedOperations.entries()) {
      const write = operationActions.get(`${operation.kind}:${operation.field}`);
      const body = write === undefined ? undefined : actionInputs(write)?.body;
      const headers = write === undefined ? undefined : actionInputs(write)?.headers;
      const readback = oneRole(flow, `index-step-readback:${list.id}:${operation.kind}:${operation.field}`);
      const assertion = oneRole(flow, `index-step-assert:${list.id}:${operation.kind}:${operation.field}`);
      if (operation.kind === "remove") observed.delete(operation.field);
      else observed.add(operation.field);
      const observedFields = [...observed].sort((left, right) => left.localeCompare(right, "en"));
      if (
        write === undefined
        || readback === undefined
        || assertion === undefined
        || write.parentId !== currentAssert.id
        || write.controlBranch !== "condition-true"
        || readback.parentId !== currentAssert.id
        || readback.controlBranch !== "condition-true"
        || assertion.parentId !== currentAssert.id
        || assertion.controlBranch !== "condition-true"
        || !connectorMatches(write, "POST", `${listPath}/fields/getbyinternalnameortitle('${operation.field}')`)
        || !succeedsAfter(write, predecessor)
        || !isRecord(headers)
        || headers["X-RequestDigest"] !== `@{body('${requestDigest!.id}')['FormDigestValue']}`
        || !isRecord(body)
        || !isRecord(body.__metadata)
        || body.__metadata.type !== "SP.Field"
        || body.Indexed !== (operation.kind === "add")
        || !connectorMatches(
          readback,
          "GET",
          `${listPath}/fields`,
          fieldQuery,
        )
        || !succeedsAfter(readback, write)
        || !succeedsAfter(assertion, readback)
        || !conditionMatches(assertion, setExpression(readback, observedFields))
        || !conditionFailsClosed(flow, assertion)
        || !branchHasExactly(flow, assertion, "condition-true", [])
      ) return undefined;
      operations.push({
        sequence: index + 1,
        kind: operation.kind,
        field: operation.field,
        ...(operation.kind === "add" ? { payloadMetadataType: "SP.Field" } : {}),
        readback: { performed: true, observedFields },
      });
      predecessor = assertion;
    }
    const planActions = [
      planDigest,
      planAssert,
      ...(requestDigest === undefined ? [] : [requestDigest]),
      ...expectedOperations.flatMap((operation) => {
        const write = operationActions.get(`${operation.kind}:${operation.field}`);
        const readback = oneRole(flow, `index-step-readback:${list.id}:${operation.kind}:${operation.field}`);
        const assertion = oneRole(flow, `index-step-assert:${list.id}:${operation.kind}:${operation.field}`);
        return write === undefined || readback === undefined || assertion === undefined
          ? []
          : [write, readback, assertion];
      }),
      finalReadback,
      finalAssert,
      resultAction,
    ];
    if (
      !succeedsAfter(finalReadback, predecessor)
      || !branchHasExactly(flow, currentAssert, "condition-true", planActions)
    ) return undefined;
    plans.push({
      listId: list.id,
      currentFields,
      requiredFields,
      execution: "serial",
      digest: { fresh: true, bindsCurrent: true, bindsRequired: true },
      result,
      maximumWrites: expectedOperations.length,
      writeCount: expectedOperations.length,
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
