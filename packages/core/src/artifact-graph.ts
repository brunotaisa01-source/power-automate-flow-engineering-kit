import { readdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";

import { canonicalize, type CanonicalizeOptions } from "./canonical-json.js";
import { consistencyDiagnostic, sortDiagnostics } from "./diagnostics.js";
import {
  createArtifactEdge,
  type ArtifactEdge,
  type ArtifactNode,
  type ProjectionKey,
} from "./artifact-node.js";
import {
  buildBuilderArtifact,
  buildContractArtifacts,
  buildDefinitionArtifact,
  buildDocumentationArtifact,
  buildEvidenceArtifact,
  buildFrontendArtifact,
  buildManifestArtifact,
  buildZipArtifact,
} from "./graph-builders/index.js";
import { assertNoPathCaseCollisions, normalizeRepositoryPath } from "./path-policy.js";
import type { Diagnostic } from "./types/diagnostics.js";
import type { ProjectContract } from "./types/project-contract.js";
import {
  WP06_ARTIFACT_PROFILE,
  WP06_SOURCE_PROJECTION_PROFILE,
  parseNormalizedWp06Evidence,
} from "./types/wp06-evidence.js";

export interface ArtifactGraphJson {
  readonly nodes: readonly ArtifactNode[];
  readonly edges: readonly ArtifactEdge[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNodes(left: ArtifactNode, right: ArtifactNode): number {
  return compareText(left.kind, right.kind)
    || compareText(left.relativePath, right.relativePath)
    || compareText(left.id, right.id);
}

function compareEdges(left: ArtifactEdge, right: ArtifactEdge): number {
  return compareText(left.from, right.from)
    || compareText(left.to, right.to)
    || compareText(left.relation, right.relation);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function looksLikeFlowDefinition(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const properties = isRecord(value.properties) ? value.properties : value;
  const definition = isRecord(properties.definition) ? properties.definition : properties;
  return isRecord(definition.triggers) && isRecord(definition.actions);
}

const SOURCE_DISCOVERY_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "node_modules",
]);

function isGeneratedDirectory(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "dist" || lower.startsWith("dist.");
}

function projectionOptions(key: ProjectionKey): CanonicalizeOptions {
  switch (key) {
    case "fields":
      return { arrayPolicies: { "": "set", "/*/choices": "set" } };
    case "indexes":
    case "states":
    case "connection-references":
    case "inventory":
      return { arrayPolicies: { "": "set" } };
    case "save-mode":
    case "action-budget":
    case "digests":
      return {};
  }
}

function authorityRank(node: ArtifactNode): number {
  if (node.sourceProfile === "project-contract-v1") {
    return 0;
  }
  if (node.sourceProfile.startsWith("project-contract-")) {
    return 1;
  }
  if (node.sourceProfile.startsWith("flow-contract-v1")) {
    return 2;
  }
  return 3;
}

function compareAuthority(left: ArtifactNode, right: ArtifactNode): number {
  return authorityRank(left) - authorityRank(right) || compareNodes(left, right);
}

export class ArtifactGraph {
  readonly nodes: readonly ArtifactNode[];
  readonly edges: readonly ArtifactEdge[];

  constructor(nodes: readonly ArtifactNode[], edges: readonly ArtifactEdge[]) {
    assertNoPathCaseCollisions(nodes.map(({ relativePath }) => relativePath));

    const nodeIds = new Set<string>();
    for (const node of nodes) {
      if (nodeIds.has(node.id)) {
        throw new Error(`Duplicate artifact node id '${node.id}'.`);
      }
      nodeIds.add(node.id);
    }
    for (const edge of edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        throw new Error(
          `Artifact edge '${edge.from}' -> '${edge.to}' references an unknown node.`,
        );
      }
    }

    this.nodes = Object.freeze([...nodes].sort(compareNodes));
    this.edges = Object.freeze([...edges].sort(compareEdges));
    Object.freeze(this);
  }

  compareProjection(key: ProjectionKey): Diagnostic[] {
    const valuesByScope = new Map<string, Array<{ node: ArtifactNode; value: unknown }>>();
    for (const node of this.nodes) {
      const scopes = node.projections[key];
      if (scopes === undefined) {
        continue;
      }
      for (const [scope, value] of Object.entries(scopes)) {
        const values = valuesByScope.get(scope) ?? [];
        values.push({ node, value });
        valuesByScope.set(scope, values);
      }
    }

    const diagnostics: Diagnostic[] = [];
    for (const scope of [...valuesByScope.keys()].sort(compareText)) {
      const values = valuesByScope.get(scope);
      if (values === undefined || values.length < 2) {
        continue;
      }
      values.sort((left, right) => compareAuthority(left.node, right.node));
      const reference = values[0];
      if (reference === undefined) {
        continue;
      }
      const expected = canonicalize(reference.value, projectionOptions(key));
      for (const candidate of values.slice(1)) {
        if (canonicalize(candidate.value, projectionOptions(key)) !== expected) {
          diagnostics.push(consistencyDiagnostic(key, scope, candidate.node, reference.node));
        }
      }
    }
    return sortDiagnostics(diagnostics);
  }

  toJSON(): ArtifactGraphJson {
    return { nodes: this.nodes, edges: this.edges };
  }
}

export function compareProjection(
  graph: ArtifactGraph,
  key: ProjectionKey,
): Diagnostic[] {
  return graph.compareProjection(key);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function pathIsWithinRoot(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot === ""
    || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== ".." && !isAbsolute(fromRoot));
}

async function readRepositoryFile(
  root: string,
  relativePath: string,
): Promise<Uint8Array | undefined> {
  const normalized = normalizeRepositoryPath(relativePath);
  const target = resolve(root, ...normalized.split("/"));
  try {
    const resolvedTarget = await realpath(target);
    if (!pathIsWithinRoot(root, resolvedTarget)) {
      throw new Error(`Repository path resolves outside the root: '${normalized}'.`);
    }
    return await readFile(resolvedTarget);
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

async function enumerateRepositoryFiles(
  root: string,
  relativeDirectory = "",
  sourceDiscovery = false,
): Promise<string[]> {
  const normalizedDirectory = relativeDirectory.length === 0
    ? ""
    : normalizeRepositoryPath(relativeDirectory);
  const target = normalizedDirectory.length === 0
    ? root
    : resolve(root, ...normalizedDirectory.split("/"));
  let entries;
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = normalizedDirectory.length === 0
      ? entry.name
      : `${normalizedDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (
        sourceDiscovery
        && (
          SOURCE_DISCOVERY_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())
          || isGeneratedDirectory(entry.name)
        )
      ) {
        continue;
      }
      files.push(...await enumerateRepositoryFiles(root, path, sourceDiscovery));
    } else if (entry.isFile()) {
      files.push(normalizeRepositoryPath(path));
    }
  }
  return [...assertNoPathCaseCollisions(files)].sort(compareText);
}

function parseArtifactData(relativePath: string, bytes: Uint8Array): unknown {
  const text = Buffer.from(bytes).toString("utf8");
  if (relativePath.endsWith(".json") || relativePath.endsWith(".zip")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      if (relativePath.endsWith(".json")) {
        throw new Error(`Artifact JSON is invalid: '${relativePath}'.`);
      }
    }
  }
  return relativePath.endsWith(".md") || relativePath.endsWith(".txt")
    ? { text }
    : { bytes: bytes.byteLength };
}

export async function buildArtifactGraph(
  root: string,
  contract: ProjectContract,
): Promise<ArtifactGraph> {
  const repositoryRoot = await realpath(resolve(root));
  const nodes = new Map<string, ArtifactNode>();
  const edges = new Map<string, ArtifactEdge>();

  const addNode = (node: ArtifactNode): ArtifactNode => {
    const existing = nodes.get(node.id);
    if (
      existing !== undefined
      && (
        existing.digest !== node.digest
        || existing.byteLength !== node.byteLength
        || existing.kind !== node.kind
        || existing.relativePath !== node.relativePath
        || existing.sourceProfile !== node.sourceProfile
        || canonicalize(existing.data) !== canonicalize(node.data)
        || canonicalize(existing.projections) !== canonicalize(node.projections)
      )
    ) {
      throw new Error(`Conflicting artifact node '${node.id}'.`);
    }
    nodes.set(node.id, node);
    return node;
  };
  const addEdge = (from: ArtifactNode, to: ArtifactNode, relation: ArtifactEdge["relation"]): void => {
    const edge = createArtifactEdge({ from: from.id, to: to.id, relation });
    edges.set(`${edge.from}\0${edge.to}\0${edge.relation}`, edge);
  };
  const addFileNode = async (
    relativePath: string,
    build: (source: { relativePath: string; data: unknown; bytes: Uint8Array }) => ArtifactNode,
  ): Promise<ArtifactNode | undefined> => {
    const bytes = await readRepositoryFile(repositoryRoot, relativePath);
    if (bytes === undefined) {
      return undefined;
    }
    return addNode(build({
      relativePath: normalizeRepositoryPath(relativePath),
      data: parseArtifactData(relativePath, bytes),
      bytes,
    }));
  };

  const contractPath = "project.contract.json";
  const contractBytes = await readRepositoryFile(repositoryRoot, contractPath);
  const contracted = buildContractArtifacts(contractPath, contract, contractBytes);
  addNode(contracted.contract);
  addNode(contracted.schema);
  addNode(contracted.frontend);
  contracted.flows.forEach(addNode);
  addEdge(contracted.contract, contracted.schema, "declares");
  addEdge(contracted.contract, contracted.frontend, "declares");
  contracted.flows.forEach((flow) => addEdge(contracted.contract, flow, "declares"));

  for (const frontendPath of await enumerateRepositoryFiles(repositoryRoot, contract.frontend.root)) {
    const frontend = await addFileNode(frontendPath, buildFrontendArtifact);
    if (frontend !== undefined) {
      addEdge(contracted.frontend, frontend, "declares");
    }
  }

  const declaredDefinitionPaths = new Set(
    contract.flows.map(({ definitionPath }) => normalizeRepositoryPath(definitionPath)),
  );
  const definitionBasenames = new Set(
    [...declaredDefinitionPaths].map((path) => posix.basename(path).toLowerCase()),
  );
  const definitionPaths = new Set(declaredDefinitionPaths);
  for (const candidate of await enumerateRepositoryFiles(repositoryRoot, "", true)) {
    if (!candidate.toLowerCase().endsWith(".json") || definitionPaths.has(candidate)) {
      continue;
    }
    const bytes = await readRepositoryFile(repositoryRoot, candidate);
    if (bytes === undefined) {
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
    } catch {
      continue;
    }
    if (
      definitionBasenames.has(posix.basename(candidate).toLowerCase())
      || looksLikeFlowDefinition(data)
    ) {
      definitionPaths.add(candidate);
    }
  }

  const sourceDefinitions = new Map<string, ArtifactNode>();
  for (const definitionPath of [...definitionPaths].sort(compareText)) {
    const definition = await addFileNode(definitionPath, buildDefinitionArtifact);
    if (definition !== undefined) {
      sourceDefinitions.set(definitionPath, definition);
    }
  }

  const definitions = new Map<string, ArtifactNode>();
  for (const flow of contract.flows) {
    const flowNode = contracted.flows.find(({ sourceProfile }) =>
      sourceProfile === `flow-contract-v1:${flow.id}`
    );
    if (flowNode === undefined) {
      throw new Error(`Flow contract node was not built for '${flow.id}'.`);
    }
    const definition = sourceDefinitions.get(normalizeRepositoryPath(flow.definitionPath));
    const builderPaths = (await enumerateRepositoryFiles(
      repositoryRoot,
      posix.dirname(flow.definitionPath),
    )).filter((path) => /^builder(?:[.-]|$)/.test(posix.basename(path)));
    const builders: ArtifactNode[] = [];
    for (const builderPath of builderPaths) {
      const builder = await addFileNode(builderPath, buildBuilderArtifact);
      if (builder !== undefined) {
        builders.push(builder);
        addEdge(flowNode, builder, "declares");
      }
    }
    if (definition !== undefined) {
      definitions.set(flow.id, definition);
      if (builders.length === 0) {
        addEdge(flowNode, definition, "generates");
      } else {
        builders.forEach((builder) => addEdge(builder, definition, "generates"));
      }
    }
  }

  const manifests: ArtifactNode[] = [];
  for (const packageContract of contract.packages) {
    const zip = await addFileNode(packageContract.path, buildZipArtifact);
    const manifest = await addFileNode(packageContract.manifestPath, buildManifestArtifact);
    if (manifest !== undefined) {
      manifests.push(manifest);
    }
    if (zip !== undefined) {
      for (const flowId of packageContract.flowIds) {
        const definition = definitions.get(flowId);
        if (definition !== undefined) {
          addEdge(definition, zip, "packages");
        }
      }
      if (manifest !== undefined) {
        addEdge(manifest, zip, "hashes");
      }
    }
  }

  for (const documentationPath of await enumerateRepositoryFiles(repositoryRoot, "docs")) {
    const documentation = await addFileNode(documentationPath, buildDocumentationArtifact);
    if (documentation !== undefined) {
      addEdge(documentation, contracted.contract, "documents");
    }
  }
  for (const evidencePath of await enumerateRepositoryFiles(repositoryRoot, "evidence")) {
    const evidence = await addFileNode(evidencePath, buildEvidenceArtifact);
    if (evidence !== undefined) {
      for (const manifest of manifests) {
        addEdge(evidence, manifest, "supports");
      }
    }
  }

  for (const evidenceNode of nodes.values()) {
    if (evidenceNode.sourceProfile !== WP06_ARTIFACT_PROFILE) continue;
    const evidence = parseNormalizedWp06Evidence(evidenceNode.data);
    if (evidence === undefined) continue;
    const contractMatches = [...nodes.values()].filter((node) =>
      node.kind === "contract"
      && node.sourceProfile === "project-contract-v1"
      && node.relativePath === evidence.binding.contractArtifactPath
    );
    const sourceMatches = [...nodes.values()].filter((node) =>
      node.kind === evidence.binding.sourceArtifactKind
      && node.sourceProfile === WP06_SOURCE_PROJECTION_PROFILE
      && node.relativePath === evidence.binding.sourceArtifactPath
    );
    if (contractMatches.length === 1) {
      addEdge(evidenceNode, contractMatches[0]!, "verifies-contract");
    }
    if (sourceMatches.length === 1) {
      addEdge(evidenceNode, sourceMatches[0]!, "derives-from");
    }
  }

  return new ArtifactGraph([...nodes.values()], [...edges.values()]);
}
