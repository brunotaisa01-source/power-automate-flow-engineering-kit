import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeRepositoryPath } = require(
  import.meta.url.endsWith(".ts") ? "./path-policy.ts" : "./path-policy.js"
) as typeof import("./path-policy.js");

export type WorkspaceProjectResultStatus = "PASS" | "FAIL" | "NOT_RUN" | "BLOCKED";

export interface WorkspaceProject {
  readonly id: string;
  readonly root: string;
  readonly check: "npm run check";
  readonly required: boolean;
}

export interface WorkspaceManifest {
  readonly schemaVersion: "1.0";
  readonly workspaceId: string;
  readonly registryPath: string;
  readonly projects: readonly WorkspaceProject[];
}

export interface WorkspaceProjectResult {
  readonly id: string;
  readonly required: boolean;
  readonly result: WorkspaceProjectResultStatus;
  readonly exitCode: number;
  readonly evidenceClass: "LOCAL_SYNTHETIC";
}

export interface WorkspaceRegistryAudit {
  readonly revision: number;
  readonly digest: string;
  readonly audit: "PASS" | "FAIL";
}

export interface WorkspaceDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface WorkspaceAggregateData {
  readonly workspaceId: string;
  readonly registry: WorkspaceRegistryAudit;
  readonly projects: readonly WorkspaceProjectResult[];
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly notRun: number;
    readonly blocked: number;
  };
  readonly result: "PASS" | "FAIL";
}

type JsonRecord = Record<string, unknown>;

const MANIFEST_KEYS = new Set(["schemaVersion", "workspaceId", "registryPath", "projects"]);
const PROJECT_KEYS = new Set(["id", "root", "check", "required"]);

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function addDiagnostic(
  diagnostics: WorkspaceDiagnostic[],
  code: string,
  path: string,
  message: string,
): void {
  diagnostics.push({ code, path, message });
}

function reportUnknownKeys(
  value: JsonRecord,
  allowed: ReadonlySet<string>,
  path: string,
  diagnostics: WorkspaceDiagnostic[],
): void {
  for (const key of Object.keys(value).sort(compareText)) {
    if (!allowed.has(key)) {
      addDiagnostic(
        diagnostics,
        "WORKSPACE_PROPERTY_UNKNOWN",
        `${path}/${key}`,
        `Unknown workspace manifest property '${key}'.`,
      );
    }
  }
}

function validateRepositoryPath(
  value: unknown,
  path: string,
  diagnostics: WorkspaceDiagnostic[],
): string | undefined {
  if (!isSafeText(value)) {
    addDiagnostic(diagnostics, "WORKSPACE_PATH_INVALID", path, "Repository paths must be non-empty strings without control characters.");
    return undefined;
  }

  try {
    return normalizeRepositoryPath(value);
  } catch (error) {
    addDiagnostic(
      diagnostics,
      "WORKSPACE_PATH_INVALID",
      path,
      error instanceof Error ? error.message : "Repository path is not safe.",
    );
    return undefined;
  }
}

function compareDiagnostics(left: WorkspaceDiagnostic, right: WorkspaceDiagnostic): number {
  return compareText(left.path, right.path)
    || compareText(left.code, right.code)
    || compareText(left.message, right.message);
}

export function validateWorkspaceManifest(value: unknown): WorkspaceDiagnostic[] {
  const diagnostics: WorkspaceDiagnostic[] = [];
  if (!isRecord(value)) {
    return [{
      code: "WORKSPACE_MANIFEST_INVALID",
      path: "/",
      message: "Workspace manifest must be an object.",
    }];
  }

  reportUnknownKeys(value, MANIFEST_KEYS, "", diagnostics);

  if (value.schemaVersion !== "1.0") {
    addDiagnostic(diagnostics, "WORKSPACE_SCHEMA_VERSION", "/schemaVersion", "Workspace manifest schemaVersion must be '1.0'.");
  }
  if (!isSafeText(value.workspaceId)) {
    addDiagnostic(diagnostics, "WORKSPACE_FIELD_INVALID", "/workspaceId", "Workspace workspaceId must be a non-empty string without control characters.");
  }
  validateRepositoryPath(value.registryPath, "/registryPath", diagnostics);

  if (!Array.isArray(value.projects)) {
    addDiagnostic(diagnostics, "WORKSPACE_PROJECTS_INVALID", "/projects", "Workspace projects must be an array.");
    return diagnostics.sort(compareDiagnostics);
  }
  if (value.projects.length === 0) {
    addDiagnostic(diagnostics, "WORKSPACE_PROJECTS_EMPTY", "/projects", "Workspace projects must contain at least one project.");
  }

  const ids = new Map<string, number>();
  const roots = new Map<string, number>();
  for (const [index, projectValue] of value.projects.entries()) {
    const path = `/projects/${index}`;
    if (!isRecord(projectValue)) {
      addDiagnostic(diagnostics, "WORKSPACE_PROJECT_INVALID", path, "Workspace project must be an object.");
      continue;
    }

    reportUnknownKeys(projectValue, PROJECT_KEYS, path, diagnostics);

    if (!isSafeText(projectValue.id)) {
      addDiagnostic(diagnostics, "WORKSPACE_FIELD_INVALID", `${path}/id`, "Project id must be a non-empty string without control characters.");
    } else {
      const previous = ids.get(projectValue.id);
      if (previous !== undefined) {
        addDiagnostic(diagnostics, "WORKSPACE_PROJECT_ID_DUPLICATE", `${path}/id`, `Project id duplicates /projects/${previous}/id.`);
      } else {
        ids.set(projectValue.id, index);
      }
    }

    const root = validateRepositoryPath(projectValue.root, `${path}/root`, diagnostics);
    if (root !== undefined) {
      const previous = roots.get(root);
      if (previous !== undefined) {
        addDiagnostic(diagnostics, "WORKSPACE_PROJECT_ROOT_DUPLICATE", `${path}/root`, `Project root duplicates /projects/${previous}/root.`);
      } else {
        roots.set(root, index);
      }
    }

    if (projectValue.check !== "npm run check") {
      addDiagnostic(diagnostics, "WORKSPACE_CHECK_UNSUPPORTED", `${path}/check`, "Project check must be exactly 'npm run check'.");
    }
    if (typeof projectValue.required !== "boolean") {
      addDiagnostic(diagnostics, "WORKSPACE_FIELD_INVALID", `${path}/required`, "Project required must be a boolean.");
    }
  }

  return diagnostics.sort(compareDiagnostics);
}

function cloneProjectResult(project: WorkspaceProjectResult): WorkspaceProjectResult {
  return Object.freeze({ ...project });
}

export function aggregateWorkspaceResults(
  manifest: WorkspaceManifest,
  registryAudit: WorkspaceRegistryAudit,
  projects: readonly WorkspaceProjectResult[],
): WorkspaceAggregateData {
  const resultsById = new Map(projects.map((project) => [project.id, project]));
  const orderedProjects = manifest.projects
    .map((project) => {
      const result = resultsById.get(project.id);
      return cloneProjectResult(result === undefined
        ? {
          id: project.id,
          required: project.required,
          result: "NOT_RUN",
          exitCode: 8,
          evidenceClass: "LOCAL_SYNTHETIC",
        }
        : { ...result, required: project.required });
    })
    .sort((left, right) => compareText(left.id, right.id));
  const frozenProjects = Object.freeze(orderedProjects);

  const summary = Object.freeze({
    total: frozenProjects.length,
    passed: frozenProjects.filter(({ result, exitCode }) => result === "PASS" && exitCode === 0).length,
    failed: frozenProjects.filter(({ result, exitCode }) => result === "FAIL" || (result === "PASS" && exitCode !== 0)).length,
    notRun: frozenProjects.filter(({ result }) => result === "NOT_RUN").length,
    blocked: frozenProjects.filter(({ result }) => result === "BLOCKED").length,
  });
  const result = registryAudit.audit === "PASS"
    && frozenProjects.every(({ required, result: projectResult, exitCode }) =>
      !required || projectResult === "PASS" && exitCode === 0
    )
    ? "PASS"
    : "FAIL";

  return Object.freeze({
    workspaceId: manifest.workspaceId,
    registry: Object.freeze({ ...registryAudit }),
    projects: frozenProjects,
    summary,
    result,
  });
}
