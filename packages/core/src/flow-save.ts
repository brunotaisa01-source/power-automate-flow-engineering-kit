type JsonRecord = Record<string, unknown>;

export type FlowDefinitionPreparationCode =
  | "INVALID_DEFINITION"
  | "INVALID_CONNECTION_REFERENCES"
  | "MISSING_CONNECTION_REFERENCE"
  | "MISSING_CONNECTION_REFERENCE_LOGICAL_NAME";

export class FlowDefinitionPreparationError extends Error {
  readonly code: FlowDefinitionPreparationCode;
  readonly path?: string;

  constructor(code: FlowDefinitionPreparationCode, message: string, path?: string) {
    super(message);
    this.name = "FlowDefinitionPreparationError";
    this.code = code;
    if (path !== undefined) {
      this.path = path;
    }
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error("value is not JSON serializable");
    }
    return JSON.parse(serialized) as T;
  } catch (error) {
    throw new FlowDefinitionPreparationError(
      "INVALID_DEFINITION",
      `Power Automate definition must be JSON serializable: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function connectionReferenceEntries(connectionReferences: unknown): Array<[string, JsonRecord]> {
  if (!isRecord(connectionReferences)) {
    throw new FlowDefinitionPreparationError(
      "INVALID_CONNECTION_REFERENCES",
      "Power Automate connection references must be an object keyed by connector alias.",
    );
  }
  return Object.entries(connectionReferences).map(([alias, value]) => {
    if (!isRecord(value)) {
      throw new FlowDefinitionPreparationError(
        "INVALID_CONNECTION_REFERENCES",
        `Connection reference '${alias}' must be an object.`,
      );
    }
    return [alias, value];
  });
}

function resolveConnectionReference(
  host: JsonRecord,
  references: readonly [string, JsonRecord][],
  actionPath: string,
): { alias: string; logicalName: string } {
  const connectionName = nonEmptyString(host.connectionName);
  const existingLogicalName = nonEmptyString(host.connectionReferenceName);
  const matches = references.filter(([alias, reference]) =>
    (connectionName !== undefined && (
      alias === connectionName
      || reference.connectionName === connectionName
      || reference.connectionReferenceLogicalName === connectionName
    ))
    || (connectionName === undefined
      && existingLogicalName !== undefined
      && reference.connectionReferenceLogicalName === existingLogicalName),
  );

  if (matches.length !== 1) {
    throw new FlowDefinitionPreparationError(
      "MISSING_CONNECTION_REFERENCE",
      `OpenApiConnection action '${actionPath}' has no unique declared connection reference.`,
      `${actionPath}/inputs/host`,
    );
  }

  const [alias, reference] = matches[0] as [string, JsonRecord];
  const logicalName = nonEmptyString(reference.connectionReferenceLogicalName);
  if (logicalName === undefined) {
    throw new FlowDefinitionPreparationError(
      "MISSING_CONNECTION_REFERENCE_LOGICAL_NAME",
      `Connection reference '${alias}' is missing connectionReferenceLogicalName.`,
      `${actionPath}/inputs/host/connectionReferenceName`,
    );
  }
  return { alias, logicalName };
}

function visitActions(
  actions: unknown,
  references: readonly [string, JsonRecord][],
  containerPath: string,
): void {
  if (actions === undefined) {
    return;
  }
  if (!isRecord(actions)) {
    throw new FlowDefinitionPreparationError(
      "INVALID_DEFINITION",
      "Power Automate action containers must be objects.",
      containerPath,
    );
  }

  for (const [actionName, actionValue] of Object.entries(actions)) {
    const actionPath = `${containerPath}/${actionName}`;
    if (!isRecord(actionValue)) {
      throw new FlowDefinitionPreparationError(
        "INVALID_DEFINITION",
        `Power Automate action '${actionName}' must be an object.`,
        actionPath,
      );
    }

    if (actionValue.type === "OpenApiConnection") {
      if (!isRecord(actionValue.inputs) || !isRecord(actionValue.inputs.host)) {
        throw new FlowDefinitionPreparationError(
          "INVALID_DEFINITION",
          `OpenApiConnection action '${actionName}' is missing inputs.host.`,
          `${actionPath}/inputs/host`,
        );
      }

      const { alias, logicalName } = resolveConnectionReference(
        actionValue.inputs.host,
        references,
        actionPath,
      );
      actionValue.inputs.host.connectionName = alias;
      actionValue.inputs.host.connectionReferenceName = logicalName;
      delete actionValue.inputs.authentication;
    }

    visitActions(actionValue.actions, references, `${actionPath}/actions`);
    if (hasOwn(actionValue, "else")) {
      visitRequiredBranch(actionValue.else, references, `${actionPath}/else`);
    }
    if (hasOwn(actionValue, "default")) {
      visitRequiredBranch(actionValue.default, references, `${actionPath}/default`);
    }
    if (hasOwn(actionValue, "cases")) {
      if (!isRecord(actionValue.cases)) {
        throw new FlowDefinitionPreparationError(
          "INVALID_DEFINITION",
          `Power Automate case container '${actionPath}/cases' must be an object.`,
          `${actionPath}/cases`,
        );
      }
      for (const [caseName, caseValue] of Object.entries(actionValue.cases)) {
        if (!isRecord(caseValue)) {
          throw new FlowDefinitionPreparationError(
            "INVALID_DEFINITION",
            `Power Automate case '${actionPath}/cases/${caseName}' must be an object.`,
            `${actionPath}/cases/${caseName}`,
          );
        }
        visitRequiredBranch(caseValue, references, `${actionPath}/cases/${caseName}`);
      }
    }
  }
}

function visitRequiredBranch(
  branch: unknown,
  references: readonly [string, JsonRecord][],
  branchPath: string,
): void {
  if (!isRecord(branch)) {
    throw new FlowDefinitionPreparationError(
      "INVALID_DEFINITION",
      `Power Automate branch '${branchPath}' must be an object.`,
      branchPath,
    );
  }
  if (!hasOwn(branch, "actions")) {
    throw new FlowDefinitionPreparationError(
      "INVALID_DEFINITION",
      `Power Automate branch '${branchPath}' is missing actions.`,
      `${branchPath}/actions`,
    );
  }
  visitActions(branch.actions, references, `${branchPath}/actions`);
}

/**
 * Prepare a raw Power Automate definition for an XRM/Flow API save.
 *
 * This is a local transformation only. It never authenticates, calls a tenant,
 * or mutates the caller's object. The declared connection-reference map is the
 * sole authority for the logical name written to each OpenApiConnection host.
 */
export function preparePowerAutomateDefinition(
  definition: unknown,
  connectionReferences: unknown,
): unknown {
  const prepared = cloneJson(definition);
  if (!isRecord(prepared)) {
    throw new FlowDefinitionPreparationError(
      "INVALID_DEFINITION",
      "Power Automate definition must be an object.",
    );
  }
  const references = connectionReferenceEntries(connectionReferences);
  const actions = isRecord(prepared.actions)
    ? prepared.actions
    : isRecord(prepared.properties) && isRecord(prepared.properties.definition)
      && isRecord(prepared.properties.definition.actions)
      ? prepared.properties.definition.actions
      : undefined;
  if (actions === undefined) {
    throw new FlowDefinitionPreparationError(
      "INVALID_DEFINITION",
      "Power Automate definition is missing actions.",
      "/actions",
    );
  }
  visitActions(actions, references, "/actions");
  return prepared;
}
