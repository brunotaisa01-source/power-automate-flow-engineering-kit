import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function selfImprovementModule(): Promise<typeof import("./self-improvement.js")> {
  const modulePath = import.meta.url.endsWith(".ts") ? "./self-improvement.ts" : "./self-improvement.js";
  return import(modulePath);
}

async function connectorProfileModule(): Promise<typeof import("./connector-profile.js")> {
  const modulePath = import.meta.url.endsWith(".ts") ? "./connector-profile.ts" : "./connector-profile.js";
  return import(modulePath);
}

export const READONLY_PLUGIN_OPERATIONS = [
  "getManifest", "getRegistryMetadata", "listApprovedLessons", "getApprovedLesson",
  "listCandidateStatus", "discover", "preflight",
] as const;

export const FORBIDDEN_PLUGIN_OPERATIONS = [
  "create", "update", "delete", "approve", "promote", "import",
  "rebind", "enable", "disable", "trigger", "permission-write",
  "mutate", "rollback", "network",
] as const;

export const READONLY_PLUGIN_MANIFEST = {
  schemaVersion: "1.0",
  pluginId: "spflow-readonly",
  mode: "read-only",
  networkMode: "offline",
  claimClass: "RUNTIME_SYNTHETIC",
  tenantMutation: false,
  operations: READONLY_PLUGIN_OPERATIONS,
  forbiddenOperations: FORBIDDEN_PLUGIN_OPERATIONS,
  connectors: ["sharepoint", "excel", "power-apps", "dataverse", "outlook", "graph", "http", "sql", "approvals", "future"],
} as const;

export interface ReadonlyPluginRequest {
  readonly operation: string;
  readonly connector?: string;
  readonly lessonId?: string;
  readonly version?: number;
}

function rootPath(root: string, relativePath: string): string {
  return resolve(root, relativePath);
}

function rejectForbidden(operation: string): void {
  if ((FORBIDDEN_PLUGIN_OPERATIONS as readonly string[]).includes(operation)) throw new Error("READONLY_PLUGIN_FORBIDDEN_OPERATION: " + operation);
  if (!(READONLY_PLUGIN_OPERATIONS as readonly string[]).includes(operation)) throw new Error("READONLY_PLUGIN_UNKNOWN_OPERATION: " + operation);
}

async function registryMetadata(root: string): Promise<Record<string, unknown>> {
  const registryPath = rootPath(root, "knowledge/self-improvement/registry.json");
  const { auditLearningRegistry } = await selfImprovementModule();
  const audit = await auditLearningRegistry(root, registryPath, { executeBindings: false });
  return { claimClass: "RUNTIME_SYNTHETIC", tenantRuntime: false, registryId: audit.registryId, revision: audit.revision, digest: audit.digest, diagnostics: audit.diagnostics };
}

async function approvedLessons(root: string): Promise<readonly Record<string, unknown>[]> {
  const registryPath = rootPath(root, "knowledge/self-improvement/registry.json");
  const { auditLearningRegistry } = await selfImprovementModule();
  const audit = await auditLearningRegistry(root, registryPath, { executeBindings: false });
  if (audit.diagnostics.length > 0) throw new Error("READONLY_PLUGIN_REGISTRY_NOT_CONSUMABLE");
  return audit.approvedLessons ?? [];
}

async function candidateStatus(root: string): Promise<readonly Record<string, unknown>[]> {
  const directory = rootPath(root, "knowledge/self-improvement/candidates");
  let names: string[];
  try { names = await readdir(directory); } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const results: Record<string, unknown>[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    try {
      const value = JSON.parse(await readFile(resolve(directory, name), "utf8")) as Record<string, unknown>;
      results.push({ id: value.id, version: value.version, status: value.status, claimBoundary: value.claimBoundary, path: "knowledge/self-improvement/candidates/" + name });
    } catch {
      results.push({ path: "knowledge/self-improvement/candidates/" + name, status: "INVALID" });
    }
  }
  return results;
}

async function discover(root: string, connector?: string): Promise<Record<string, unknown>> {
  const path = rootPath(root, "examples/minimal-public-app/connectors/flow-fixtures.json");
  const fixture = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const flows = Array.isArray(fixture.flows) ? fixture.flows : [];
  return { claimClass: "RUNTIME_SYNTHETIC", tenantRuntime: false, flows: connector === undefined ? flows : flows.filter((flow) => (flow as Record<string, unknown>).connector === connector) };
}

async function preflight(root: string, connector?: string): Promise<Record<string, unknown>> {
  const discovered = await discover(root, connector);
  const flows = Array.isArray(discovered.flows) ? discovered.flows as Record<string, unknown>[] : [];
  const profiles = [];
  for (const flow of flows) {
    const name = String(flow.connector);
    const { validateConnectorProfileFile } = await connectorProfileModule();
    const result = await validateConnectorProfileFile(rootPath(root, "examples/minimal-public-app/connectors/" + name + ".profile.json"));
    profiles.push({ connector: name, valid: result.valid, diagnostics: result.diagnostics });
  }
  return { claimClass: "RUNTIME_SYNTHETIC", tenantRuntime: false, networkMode: "offline", flowCount: flows.length, profiles };
}

export async function runReadonlyPlugin(root: string, request: ReadonlyPluginRequest): Promise<unknown> {
  rejectForbidden(request.operation);
  if (request.operation === "getManifest") return READONLY_PLUGIN_MANIFEST;
  if (request.operation === "getRegistryMetadata") return registryMetadata(root);
  if (request.operation === "listApprovedLessons") return approvedLessons(root);
  if (request.operation === "getApprovedLesson") {
    const lessons = await approvedLessons(root);
    return lessons.find((lesson) => lesson.id === request.lessonId && lesson.version === request.version) ?? null;
  }
  if (request.operation === "listCandidateStatus") return candidateStatus(root);
  if (request.operation === "discover") return discover(root, request.connector);
  return preflight(root, request.connector);
}
