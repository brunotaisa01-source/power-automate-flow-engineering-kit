import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";

import type { Diagnostic, ValidationResult } from "./types/diagnostics.js";
import type { ProjectContract } from "./types/project-contract.js";
import type { ListContract } from "./types/sharepoint.js";

const SCHEMA_FILES = {
  evidence: "evidence.schema.json",
  "flow-contract": "flow-contract.schema.json",
  "package-profile": "package-profile.schema.json",
  "project-contract": "project-contract.schema.json",
  rule: "rule.schema.json",
  "sharepoint-schema": "sharepoint-schema.schema.json",
} as const;

export type SchemaName = keyof typeof SCHEMA_FILES;

const PROJECT_SCHEMA_ID = "https://spflow.dev/schemas/project-contract.schema.json";
const SCHEMA_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../contracts",
);
const SYSTEM_FIELDS = new Set(["ID", "Created", "Author", "Modified", "Editor"]);

let projectValidator: ValidateFunction<ProjectContract> | undefined;

function schemaPath(name: SchemaName): string {
  return resolve(SCHEMA_DIRECTORY, SCHEMA_FILES[name]);
}

function isSchemaName(name: string): name is SchemaName {
  return Object.hasOwn(SCHEMA_FILES, name);
}

function parseSchema(name: SchemaName): object {
  return JSON.parse(readFileSync(schemaPath(name), "utf8")) as object;
}

export async function loadSchema(name: string): Promise<unknown> {
  if (!isSchemaName(name)) {
    throw new Error(`Unknown schema name: ${name}`);
  }

  const content = await readFile(schemaPath(name), "utf8");
  return JSON.parse(content) as unknown;
}

function getProjectValidator(): ValidateFunction<ProjectContract> {
  if (projectValidator !== undefined) {
    return projectValidator;
  }

  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: false,
  });

  for (const name of Object.keys(SCHEMA_FILES).sort() as SchemaName[]) {
    ajv.addSchema(parseSchema(name));
  }

  const compiled = ajv.getSchema<ProjectContract>(PROJECT_SCHEMA_ID);
  if (compiled === undefined) {
    throw new Error("Project contract schema did not compile.");
  }

  projectValidator = compiled;
  return compiled;
}

function stableParameterText(params: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(params).sort(([left], [right]) => left.localeCompare(right))),
  );
}

function structuralDiagnostic(error: ErrorObject): Diagnostic {
  const bindingExample =
    /^\/environmentBindings\/[0-9]+\/example$/.test(error.instancePath) &&
    error.keyword === "pattern";

  return {
    code: bindingExample
      ? "CONTRACT_BINDING_EXAMPLE_FORBIDDEN"
      : "CONTRACT_SCHEMA_INVALID",
    path: error.instancePath,
    message: bindingExample
      ? "Environment binding examples must use an uppercase placeholder or a reserved example.test value."
      : `Project contract schema ${error.message ?? "validation failed"} (${stableParameterText(error.params)}).`,
  };
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return (
    left.code.localeCompare(right.code) ||
    left.path.localeCompare(right.path) ||
    left.message.localeCompare(right.message)
  );
}

function semanticDiagnostics(contract: ProjectContract): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const bindings = new Set(contract.environmentBindings.map(({ key }) => key));
  const lists = new Map(contract.sharePoint.lists.map((list) => [list.id, list]));
  const capabilities = new Set(contract.capabilities.map(({ id }) => id));
  const commands = new Set(contract.commands.map(({ type }) => type));
  const flows = new Set(contract.flows.map(({ id }) => id));
  const packages = new Set(contract.packages.map(({ id }) => id));
  const transitions = new Set(
    contract.stateMachines.flatMap(({ transitions: items }) => items.map(({ id }) => id)),
  );

  const add = (code: string, path: string, message: string): void => {
    diagnostics.push({ code, path, message });
  };

  const requireBinding = (binding: string, path: string): void => {
    if (!bindings.has(binding)) {
      add(
        "CONTRACT_REF_BINDING_MISSING",
        path,
        `Binding '${binding}' is not declared in environmentBindings.`,
      );
    }
  };

  const requireList = (listId: string, path: string): ListContract | undefined => {
    const list = lists.get(listId);
    if (list === undefined) {
      add("CONTRACT_REF_LIST_MISSING", path, `List '${listId}' is not declared.`);
    }
    return list;
  };

  const requireField = (list: ListContract, field: string, path: string): void => {
    if (
      !SYSTEM_FIELDS.has(field) &&
      !list.fields.some(({ internalName }) => internalName === field)
    ) {
      add(
        "CONTRACT_REF_FIELD_MISSING",
        path,
        `Field '${field}' is not declared on list '${list.id}'.`,
      );
    }
  };

  requireBinding(contract.sharePoint.siteUrlBinding, "/sharePoint/siteUrlBinding");

  contract.sharePoint.lists.forEach((list, listIndex) => {
    const listPath = `/sharePoint/lists/${listIndex}`;
    requireBinding(list.titleBinding, `${listPath}/titleBinding`);

    list.permissions.minimumRoles.forEach((role, roleIndex) => {
      requireBinding(
        role.principalBinding,
        `${listPath}/permissions/minimumRoles/${roleIndex}/principalBinding`,
      );
    });

    list.fields.forEach((field, fieldIndex) => {
      if (field.lookupListId !== undefined) {
        const lookupList = requireList(
          field.lookupListId,
          `${listPath}/fields/${fieldIndex}/lookupListId`,
        );
        if (lookupList !== undefined && field.lookupField !== undefined) {
          requireField(
            lookupList,
            field.lookupField,
            `${listPath}/fields/${fieldIndex}/lookupField`,
          );
        }
      }
    });

    for (const [property, fields] of [
      ["readAllowlist", list.readAllowlist],
      ["createAllowlist", list.createAllowlist],
      ["patchAllowlist", list.patchAllowlist],
    ] as const) {
      fields.forEach((field, fieldIndex) => {
        requireField(list, field, `${listPath}/${property}/${fieldIndex}`);
      });
    }

    list.indexes.forEach((index, indexIndex) => {
      requireField(list, index.field, `${listPath}/indexes/${indexIndex}/field`);
    });

    list.views.forEach((view, viewIndex) => {
      view.fields.forEach((field, fieldIndex) => {
        requireField(list, field, `${listPath}/views/${viewIndex}/fields/${fieldIndex}`);
      });
    });
  });

  contract.stateMachines.forEach((machine, machineIndex) => {
    const machinePath = `/stateMachines/${machineIndex}`;
    const list = requireList(machine.listId, `${machinePath}/listId`);
    if (list !== undefined) {
      requireField(list, machine.field, `${machinePath}/field`);
    }

    const states = new Set(machine.states);
    const requireState = (state: string, path: string): void => {
      if (!states.has(state)) {
        add(
          "CONTRACT_REF_STATE_MISSING",
          path,
          `State '${state}' is not declared by state machine '${machine.id}'.`,
        );
      }
    };

    requireState(machine.initial, `${machinePath}/initial`);
    machine.terminal.forEach((state, stateIndex) => {
      requireState(state, `${machinePath}/terminal/${stateIndex}`);
    });
    machine.transitions.forEach((transition, transitionIndex) => {
      const transitionPath = `${machinePath}/transitions/${transitionIndex}`;
      transition.from.forEach((state, stateIndex) => {
        requireState(state, `${transitionPath}/from/${stateIndex}`);
      });
      requireState(transition.to, `${transitionPath}/to`);
      if (!commands.has(transition.commandType)) {
        add(
          "CONTRACT_REF_COMMAND_MISSING",
          `${transitionPath}/commandType`,
          `Command '${transition.commandType}' is not declared.`,
        );
      }
      if (!capabilities.has(transition.requiredCapability)) {
        add(
          "CONTRACT_REF_CAPABILITY_MISSING",
          `${transitionPath}/requiredCapability`,
          `Capability '${transition.requiredCapability}' is not declared.`,
        );
      }
    });
  });

  contract.capabilities.forEach((capability, capabilityIndex) => {
    const capabilityPath = `/capabilities/${capabilityIndex}`;
    const accessList = requireList(capability.accessListId, `${capabilityPath}/accessListId`);
    if (accessList !== undefined) {
      requireField(accessList, capability.activeField, `${capabilityPath}/activeField`);
      requireField(accessList, capability.principalField, `${capabilityPath}/principalField`);
      requireField(accessList, capability.capabilityField, `${capabilityPath}/capabilityField`);
      if (capability.scope.accessField !== undefined) {
        requireField(accessList, capability.scope.accessField, `${capabilityPath}/scope/accessField`);
      }
    }
    if (capability.scope.lookupListId !== undefined) {
      requireList(capability.scope.lookupListId, `${capabilityPath}/scope/lookupListId`);
    }
    capability.allowedCommands.forEach((command, commandIndex) => {
      if (!commands.has(command)) {
        add(
          "CONTRACT_REF_COMMAND_MISSING",
          `${capabilityPath}/allowedCommands/${commandIndex}`,
          `Command '${command}' is not declared.`,
        );
      }
    });
  });

  contract.commands.forEach((command, commandIndex) => {
    const commandPath = `/commands/${commandIndex}`;
    const queueList = requireList(command.queueListId, `${commandPath}/queueListId`);
    const targetList = requireList(command.targetListId, `${commandPath}/targetListId`);
    if (queueList !== undefined) {
      requireField(queueList, command.targetIdField, `${commandPath}/targetIdField`);
      command.requestedFields.forEach((field, fieldIndex) => {
        requireField(queueList, field.name, `${commandPath}/requestedFields/${fieldIndex}/name`);
      });
      command.idempotency.keyFields.forEach((field, fieldIndex) => {
        requireField(queueList, field, `${commandPath}/idempotency/keyFields/${fieldIndex}`);
      });
    }
    if (targetList !== undefined) {
      command.serverReadFields.forEach((field, fieldIndex) => {
        requireField(targetList, field, `${commandPath}/serverReadFields/${fieldIndex}`);
      });
      command.readback.fields.forEach((field, fieldIndex) => {
        requireField(targetList, field, `${commandPath}/readback/fields/${fieldIndex}`);
      });
      command.readback.assertions.forEach((assertion, assertionIndex) => {
        requireField(targetList, assertion.field, `${commandPath}/readback/assertions/${assertionIndex}/field`);
      });
    }
    if (!capabilities.has(command.requiredCapability)) {
      add(
        "CONTRACT_REF_CAPABILITY_MISSING",
        `${commandPath}/requiredCapability`,
        `Capability '${command.requiredCapability}' is not declared.`,
      );
    }
    if (!transitions.has(command.transitionId)) {
      add(
        "CONTRACT_REF_TRANSITION_MISSING",
        `${commandPath}/transitionId`,
        `Transition '${command.transitionId}' is not declared.`,
      );
    }
  });

  contract.flows.forEach((flow, flowIndex) => {
    const flowPath = `/flows/${flowIndex}`;
    flow.processorForCommandTypes.forEach((command, commandIndex) => {
      if (!commands.has(command)) {
        add(
          "CONTRACT_REF_COMMAND_MISSING",
          `${flowPath}/processorForCommandTypes/${commandIndex}`,
          `Command '${command}' is not declared.`,
        );
      }
    });
    flow.connectionReferences.forEach((binding, bindingIndex) => {
      requireBinding(binding, `${flowPath}/connectionReferences/${bindingIndex}`);
    });
    if (!packages.has(flow.packageId)) {
      add(
        "CONTRACT_REF_PACKAGE_MISSING",
        `${flowPath}/packageId`,
        `Package '${flow.packageId}' is not declared.`,
      );
    }
  });

  contract.packages.forEach((packageContract, packageIndex) => {
    packageContract.flowIds.forEach((flowId, flowIndex) => {
      if (!flows.has(flowId)) {
        add(
          "CONTRACT_REF_FLOW_MISSING",
          `/packages/${packageIndex}/flowIds/${flowIndex}`,
          `Flow '${flowId}' is not declared.`,
        );
      }
    });
  });

  contract.frontend.directPatch.listIds.forEach((listId, listIndex) => {
    requireList(listId, `/frontend/directPatch/listIds/${listIndex}`);
  });

  return diagnostics.sort(compareDiagnostics);
}

export function validateProjectContract(value: unknown): ValidationResult {
  const validate = getProjectValidator();
  if (!validate(value)) {
    const diagnostics = (validate.errors ?? [])
      .map(structuralDiagnostic)
      .sort(compareDiagnostics);
    return { valid: false, diagnostics };
  }

  const diagnostics = semanticDiagnostics(value);
  return { valid: diagnostics.length === 0, diagnostics };
}
