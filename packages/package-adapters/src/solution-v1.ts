import type { Diagnostic } from "@spflow/core/types/diagnostics";
import type { PackageInspection } from "@spflow/core/types/rule-input";

import {
  openSafeArchive,
  type SafeArchive,
} from "./archive-reader.ts";
import type { ArchiveLimits } from "./archive-limits.ts";
import {
  normalizeFlow,
  type NormalizedFlow,
} from "./flow-normalizer.ts";
import { createProjectRuleEvidenceInspector } from "./rule-evidence.ts";
import { findXmlElements, parseSafeXml, type SafeXmlNode } from "./xml-safe-parser.ts";

export type { PackageInspection } from "@spflow/core/types/rule-input";

export interface PackageAdapter {
  readonly profile: string;
  inspect(path: string, limits: ArchiveLimits): Promise<PackageInspection>;
}

interface DeclaredWorkflow {
  readonly id: string;
  readonly path: string;
}

const REQUIRED_ROOT_ENTRIES = Object.freeze([
  "[Content_Types].xml",
  "customizations.xml",
  "solution.xml",
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function diagnostic(message: string): Diagnostic {
  return Object.freeze({
    code: "PKG-NATIVE-001",
    path: "synthetic-solution.zip#/inventory",
    message,
  });
}

function attribute(node: SafeXmlNode, ...names: readonly string[]): string | undefined {
  for (const name of names) {
    const exact = node.attributes[name];
    if (exact !== undefined) {
      return exact;
    }
    const folded = Object.entries(node.attributes).find(
      ([actual]) => actual.toLowerCase() === name.toLowerCase(),
    );
    if (folded !== undefined) {
      return folded[1];
    }
  }
  return undefined;
}

function deriveWorkflows(customizations: SafeXmlNode): DeclaredWorkflow[] {
  const workflows = findXmlElements(customizations, "Workflow").map((node) => {
    const path = attribute(node, "path", "file", "fileName");
    const name = attribute(node, "name", "schemaName", "id");
    if (
      path === undefined
      || !path.startsWith("Workflows/")
      || !path.endsWith(".json")
      || path.includes("..")
      || path.includes("\\")
    ) {
      throw new TypeError("Solution workflow metadata is malformed.");
    }
    const inferredId = path.slice("Workflows/".length, -".json".length);
    return Object.freeze({ id: name ?? inferredId, path });
  });
  const foldedPaths = new Set<string>();
  for (const workflow of workflows) {
    const folded = workflow.path.toLowerCase();
    if (foldedPaths.has(folded)) {
      throw new TypeError("Solution workflow metadata is ambiguous.");
    }
    foldedPaths.add(folded);
  }
  return workflows.sort((left, right) => compareText(left.path, right.path));
}

function declaredSolutionComponents(solution: SafeXmlNode): Set<string> {
  return new Set(
    findXmlElements(solution, "RootComponent")
      .filter((node) => attribute(node, "type") === "29")
      .map((node) => attribute(node, "schemaName", "name"))
      .filter((name): name is string => name !== undefined)
      .sort(compareText),
  );
}

async function parseXmlEntry(archive: SafeArchive, path: string): Promise<SafeXmlNode> {
  return parseSafeXml(await archive.read(path));
}

function inventoryDiagnostics(
  actual: readonly string[],
  expected: readonly string[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const misplaced = new Set<string>();

  for (const required of REQUIRED_ROOT_ENTRIES) {
    if (actualSet.has(required)) {
      continue;
    }
    const candidate = actual.find((path) =>
      path.includes("/")
      && path.slice(path.lastIndexOf("/") + 1).toLowerCase() === required.toLowerCase()
    );
    if (candidate !== undefined) {
      misplaced.add(candidate);
      diagnostics.push(diagnostic(`Required root entry '${required}' is misplaced.`));
    } else {
      diagnostics.push(diagnostic(`Solution inventory is missing required root entry '${required}'.`));
    }
  }

  const missingWorkflowCount = expected.filter((path) =>
    !REQUIRED_ROOT_ENTRIES.includes(path) && !actualSet.has(path)
  ).length;
  if (missingWorkflowCount > 0) {
    diagnostics.push(diagnostic(
      `Solution inventory is missing ${missingWorkflowCount} declared workflow ${missingWorkflowCount === 1 ? "entry" : "entries"}.`,
    ));
  }
  const extraCount = actual.filter((path) =>
    !expectedSet.has(path) && !misplaced.has(path)
  ).length;
  if (extraCount > 0) {
    diagnostics.push(diagnostic(
      `Solution inventory contains ${extraCount} unexpected ${extraCount === 1 ? "entry" : "entries"}.`,
    ));
  }
  return diagnostics;
}

async function inspectArchive(archive: SafeArchive): Promise<PackageInspection> {
  const diagnostics: Diagnostic[] = [];
  let workflows: DeclaredWorkflow[] = [];
  let solutionComponents: Set<string> | undefined;

  try {
    if (archive.inventory.includes("[Content_Types].xml")) {
      await parseXmlEntry(archive, "[Content_Types].xml");
    }
    if (archive.inventory.includes("customizations.xml")) {
      workflows = deriveWorkflows(await parseXmlEntry(archive, "customizations.xml"));
    }
    if (archive.inventory.includes("solution.xml")) {
      solutionComponents = declaredSolutionComponents(
        await parseXmlEntry(archive, "solution.xml"),
      );
    }
  } catch (error) {
    if (error instanceof TypeError) {
      diagnostics.push(diagnostic("Solution metadata cannot be normalized safely."));
    } else {
      throw error;
    }
  }

  const expectedInventory = Object.freeze(
    [...REQUIRED_ROOT_ENTRIES, ...workflows.map(({ path }) => path)].sort(compareText),
  );
  diagnostics.push(...inventoryDiagnostics(archive.inventory, expectedInventory));
  if (
    diagnostics.length === 0
    && (workflows.length === 0 || solutionComponents === undefined)
  ) {
    diagnostics.push(diagnostic("Solution metadata does not declare a workflow entry."));
  }
  if (
    diagnostics.length === 0
    && workflows.some(({ id }) => !solutionComponents?.has(id))
  ) {
    diagnostics.push(diagnostic("Solution workflow metadata disagrees across envelope entries."));
  }

  const normalizedFlows: NormalizedFlow[] = [];
  if (diagnostics.length === 0) {
    for (const workflow of workflows) {
      try {
        const raw = JSON.parse((await archive.read(workflow.path)).toString("utf8")) as unknown;
        normalizedFlows.push(normalizeFlow(raw, { id: workflow.id }));
      } catch {
        diagnostics.push(diagnostic("A declared workflow definition cannot be normalized safely."));
        break;
      }
    }
  }

  diagnostics.sort((left, right) =>
    compareText(left.code, right.code)
    || compareText(left.path, right.path)
    || compareText(left.message, right.message)
  );
  return Object.freeze({
    profile: "power-platform-solution-v1",
    valid: diagnostics.length === 0,
    inventory: archive.inventory,
    expectedInventory,
    flows: Object.freeze(normalizedFlows),
    diagnostics: Object.freeze(diagnostics),
  });
}

export async function inspectSolutionBytes(
  bytes: Uint8Array,
  limits: Partial<ArchiveLimits> = {},
): Promise<PackageInspection> {
  const archive = await openSafeArchive(bytes, limits);
  try {
    return await inspectArchive(archive);
  } finally {
    archive.close();
  }
}

export const inspectProjectRuleEvidence = createProjectRuleEvidenceInspector(
  inspectSolutionBytes,
);

export const solutionV1Adapter: PackageAdapter = Object.freeze({
  profile: "power-platform-solution-v1",
  async inspect(path: string, limits: ArchiveLimits): Promise<PackageInspection> {
    const archive = await openSafeArchive(path, limits);
    try {
      return await inspectArchive(archive);
    } finally {
      archive.close();
    }
  },
});
