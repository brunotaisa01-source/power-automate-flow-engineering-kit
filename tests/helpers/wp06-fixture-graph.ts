import { canonicalize } from "../../packages/core/dist/canonical-json.js";
import { createArtifactNode } from "../../packages/core/dist/artifact-node.js";
import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";
import type {
  NormalizedFlow,
  RuleAdapterEvidence,
  Wp06AdapterDerivation,
} from "../../packages/core/src/types/rule-input.ts";
import {
  WP06_FRONTEND_SOURCE_IR_PROFILE,
  WP06_POWER_AUTOMATE_SOURCE_IR_PROFILE,
} from "../../packages/core/dist/wp06-source-adapters.js";
import {
  WP06_EVIDENCE_PROFILE,
  WP06_SOURCE_PROJECTION_PROFILE,
  WP06_TRUSTED_ARTIFACT_PROFILE,
  WP06_TRUSTED_PROJECTION_PROFILE,
} from "../../packages/core/dist/types/wp06-evidence.js";
import type { ArtifactGraphInput } from "../../packages/rules/src/registry.ts";

type EvidenceSection =
  | "authorityChecks"
  | "permissionModels"
  | "permissionProbes"
  | "saveTransactions"
  | "paginationTraversals"
  | "odataRequests"
  | "fieldOperations"
  | "httpClassifications"
  | "indexPlans";

type RecordValue = Record<string, any>;

function sourceModel(section: EvidenceSection, facts: readonly RecordValue[]): RecordValue {
  switch (section) {
    case "saveTransactions":
      return { interactions: facts.map((item) => ({
        target: { list: item.listId },
        activation: item.trigger,
        fieldPolicy: { patch: item.patchedFields },
        transport: {
          verb: item.request.method,
          override: item.request.methodOverride,
          codec: item.request.serialization,
          digestLifecycle: item.request.digest,
          concurrencyToken: item.request.ifMatch,
        },
        outcomes: {
          conflict: item.conflict,
          uncertain: { action: item.ambiguousFailure.action, retryWrite: item.ambiguousFailure.writeRetry },
          verification: { verb: item.readback.method, semantic: item.readback.semantic, beforeSuccess: item.readback.beforeSuccess },
        },
      })) };
    case "paginationTraversals":
      return { loaders: facts.map((item) => ({
        requirement: item.completeness,
        strategy: item.mode,
        nextLink: {
          parser: item.continuation.urlParsing,
          sameOrigin: item.continuation.sameOrigin,
          siteBoundary: item.continuation.sitePath,
          trackVisited: item.continuation.visitedLinks,
          maximumPages: item.continuation.pageLimit,
          loopAction: item.continuation.onLoop,
          crossOriginAction: item.continuation.onCrossOrigin,
          siteEscapeAction: item.continuation.onSitePathEscape,
          limitAction: item.continuation.onPageLimit,
        },
        collection: item.accumulation,
        finish: item.termination,
      })) };
    case "odataRequests":
      return { queries: facts.map((item) => ({
        targetList: item.listId,
        select: item.fieldNames,
        selectionSource: item.fieldSource,
        builders: { query: item.queryConstruction, path: item.pathConstruction, literal: item.stringLiteralEscaping },
        rawFragments: item.rawFragmentsAccepted,
        encoding: item.parameterEncoding,
      })) };
    case "authorityChecks":
      return { handlers: facts.map((item) => ({
        command: item.commandType,
        targetList: item.targetListId,
        orderedSteps: Object.entries(item.sequence)
          .sort(([, left], [, right]) => Number(left) - Number(right))
          .map(([name]) => ({ kind: ({ identityRead: "identity-read", capabilityRead: "capability-read", targetRead: "target-read", mutation: "mutation" } as Record<string, string>)[name] })),
        authoritativeReads: {
          actor: item.authoritySources.actor,
          role: item.authoritySources.role,
          scope: item.authoritySources.scope,
          state: item.authoritySources.protectedState,
          owner: item.authoritySources.owner,
          amount: item.authoritySources.amount,
          approval: item.authoritySources.approval,
        },
        capabilityLookup: {
          capabilityId: item.capability.id,
          accessList: item.capability.accessListId,
          activeColumn: item.capability.activeField,
          principalColumn: item.capability.principalField,
          capabilityColumn: item.capability.capabilityField,
          readSource: item.capability.source,
          activeOnly: item.capability.activeOnly,
          cardinality: item.capability.matchCardinality,
          commandBound: item.capability.commandDeclared,
          transitionBound: item.capability.stateTransitionDeclared,
        },
        scopeGuard: {
          mode: item.scope.mode,
          ...(item.scope.targetField === undefined ? {} : { targetColumn: item.scope.targetField }),
          ...(item.scope.accessField === undefined ? {} : { accessColumn: item.scope.accessField }),
          ...(item.scope.lookupListId === undefined ? {} : { lookupList: item.scope.lookupListId }),
          targetValue: item.scope.targetValueSource,
          capabilityValue: item.scope.capabilityValueSource,
          evaluation: item.scope.evaluation,
          beforeMutation: item.scope.checkedBeforeMutation,
        },
        mutation: item.effectiveOperation,
      })) };
    case "permissionModels":
      return { plans: facts.map((item) => ({
        targetList: item.listId,
        inheritanceMode: item.inheritance,
        userGrantPolicy: item.directUserGrants,
        browserAllows: item.browserOperations,
        assignments: item.grants.map((grant: RecordValue) => ({
          principalType: grant.principalKind,
          binding: grant.principalBinding,
          roleName: grant.role,
          allows: grant.allowedOperations,
        })),
      })) };
    case "permissionProbes":
      return { readbacks: facts.map((item) => ({
        targetList: item.listId,
        principal: item.principalBinding,
        checks: Object.entries(item.operations).map(([operation, allowed]) => ({ operation, allowed })),
      })) };
    case "fieldOperations":
      return { fields: facts.map((item) => ({
        targetList: item.listId,
        fieldKey: item.logicalName,
        ...(item.identity === undefined ? {} : { identityRead: { readFrom: item.identity.source, internal: item.identity.internalName, entityProperty: item.identity.entityPropertyName } }),
        ...(item.uses === undefined ? {} : { consumers: item.uses.map((use: RecordValue) => ({ operation: use.operation, name: use.fieldName, reference: use.source })) }),
        ...(item.createPayload === undefined ? {} : { createRequest: { codec: item.createPayload.serialization, metadata: item.createPayload.metadataType, ...(item.createPayload.fieldTypeKind === undefined ? {} : { kind: item.createPayload.fieldTypeKind }) } }),
        ...(item.indexPayload === undefined ? {} : { indexRequest: { codec: item.indexPayload.serialization, metadata: item.indexPayload.metadataType, ...(item.indexPayload.fieldTypeKind === undefined ? {} : { kind: item.indexPayload.fieldTypeKind }) } }),
        ...(item.compatibility === undefined ? {} : { compatibilityRead: { httpResult: item.compatibility.response, compare: item.compatibility.comparedProperties, ...(item.compatibility.actual === undefined ? {} : { observed: item.compatibility.actual }), decision: item.compatibility.outcome, action: item.compatibility.writeAction } }),
      })) };
    case "httpClassifications":
      return { requests: facts.map((item) => ({
        status: item.status,
        phase: item.phase,
        kind: item.requestKind,
        permitInitial404: item.allowCreateMissing404,
        error: {
          ...(item.error.platformCode === undefined ? {} : { code: item.error.platformCode }),
          ...(item.error.messageCategory === undefined ? {} : { category: item.error.messageCategory }),
        },
        ...(item.responseBody === undefined ? {} : { parsedResponse: {
          schemaId: item.responseBody.schemaId ?? "sharepoint-list-item-v1:protected-items",
          targetList: item.responseBody.targetListId ?? "protected-items",
          expectedFields: item.responseBody.expectedFields ?? ["ID", "Title"],
          body: item.responseBody.actual === undefined
            ? { ID: 1, Title: "Synthetic item" }
            : Object.fromEntries(item.responseBody.actual.fields.map((field: RecordValue) => [
              field.name,
              field.valueKind === "boolean" ? true
                : field.valueKind === "number" ? 1
                : field.valueKind === "null" ? null
                : "Synthetic value",
            ])),
        } }),
        result: item.classification,
      })) };
    case "indexPlans":
      return { transactions: facts.map((item) => ({
        targetList: item.listId,
        before: item.currentFields,
        desired: item.requiredFields,
        mode: item.execution,
        approval: { fresh: item.digest.fresh, bindsBefore: item.digest.bindsCurrent, bindsDesired: item.digest.bindsRequired },
        outcome: item.result,
        maxWrites: item.maximumWrites,
        writes: item.writeCount,
        steps: item.operations.map((step: RecordValue) => ({
          order: step.sequence,
          action: step.kind,
          field: step.field,
          ...(step.payloadMetadataType === undefined ? {} : { metadata: step.payloadMetadataType }),
          readback: typeof step.readback === "boolean"
            ? step.readback
            : { done: step.readback.performed, fields: step.readback.observedFields },
        })),
        after: item.finalReadback,
      })) };
  }
}

export function wp06SourceIrFromFacts(
  kind: "builder" | "frontend",
  section: EvidenceSection,
  facts: readonly RecordValue[],
  contractRevision = 2,
): RecordValue {
  return {
    sourceIrProfile: kind === "frontend"
      ? WP06_FRONTEND_SOURCE_IR_PROFILE
      : WP06_POWER_AUTOMATE_SOURCE_IR_PROFILE,
    sourceRevision: 1,
    contractRevision,
    section,
    model: sourceModel(section, facts),
  };
}

function nodeBytes(data: unknown): Uint8Array {
  return Buffer.from(`${canonicalize(data)}\n`, "utf8");
}

export function hydrateWp06FixtureGraph(
  input: ArtifactGraphInput,
  contract: ProjectContract,
): ArtifactGraphInput {
  const graph = structuredClone(input);
  const evidence = graph.nodes.find((node) => {
    if (node.sourceProfile !== "wp06-evidence-v1" || typeof node.data !== "object" || node.data === null) {
      return false;
    }
    const binding = (node.data as RecordValue).binding;
    return typeof binding === "object"
      && binding !== null
      && typeof (binding as RecordValue).section === "string";
  });
  if (evidence === undefined || typeof evidence.data !== "object" || evidence.data === null) return graph;
  const data = evidence.data as RecordValue;
  const binding = data.binding as RecordValue;
  if (binding === undefined || typeof binding.section !== "string") return graph;
  const section = binding.section as EvidenceSection;
  const kind = evidence.kind as "builder" | "frontend";
  const facts = data[section] as RecordValue[];
  const flow = contract.flows[0];
  const sourceData = kind === "frontend"
    ? { fixtureProfile: "test-only-frontend-adapter-input-v1", section }
    : {
        properties: {
          definition: {
            triggers: { SyntheticTrigger: { type: "Request", inputs: {} } },
            actions: { SyntheticAction: { type: "Compose", inputs: "synthetic" } },
          },
        },
      };
  const sourcePath = kind === "frontend"
    ? `${contract.frontend.root}/source-${section}.ts`
    : flow?.definitionPath ?? "flows/synthetic/definition.json";
  const source = createArtifactNode({
    kind: kind === "frontend" ? "frontend" : "definition",
    relativePath: sourcePath,
    sourceProfile: kind === "frontend" ? "frontend-projection-v1" : "normalized-flow-v1",
    data: sourceData,
    bytes: nodeBytes(sourceData),
  });
  const projectionData = {
    sourceProjectionProfile: WP06_SOURCE_PROJECTION_PROFILE,
    projectionRevision: 1,
    contractRevision: contract.project.contractRevision,
    sourceKind: kind,
    section,
    adapter: {
      id: kind === "frontend"
        ? "spflow.frontend-source-v2"
        : "spflow.power-automate-definition-v2",
      version: 2,
    },
    facts,
  };
  const projection = createArtifactNode({
    kind: "projection",
    relativePath: `.spflow-derived/test-only/${kind}-${section}-${source.digest}.json`,
    sourceProfile: WP06_TRUSTED_PROJECTION_PROFILE,
    data: projectionData,
    bytes: nodeBytes(projectionData),
  });

  const contractNode = graph.nodes.find((node) => node.kind === "contract" && node.relativePath === "project.contract.json")!;
  binding.contractArtifactPath = contractNode.relativePath;
  binding.contractArtifactSha256 = contractNode.digest;
  binding.contractArtifactBytes = contractNode.byteLength;
  binding.sourceArtifactPath = source.relativePath;
  binding.sourceArtifactSha256 = source.digest;
  binding.sourceArtifactBytes = source.byteLength;
  binding.sourceArtifactKind = kind;
  binding.projectionArtifactPath = projection.relativePath;
  binding.projectionArtifactSha256 = projection.digest;
  binding.projectionArtifactBytes = projection.byteLength;

  const evidenceNode = createArtifactNode({
    kind,
    relativePath: evidence.relativePath,
    sourceProfile: WP06_TRUSTED_ARTIFACT_PROFILE,
    data: { ...data, evidenceProfile: WP06_EVIDENCE_PROFILE },
    bytes: nodeBytes({ ...data, evidenceProfile: WP06_EVIDENCE_PROFILE }),
  });
  const nodes: any[] = [evidenceNode, contractNode, projection, source];
  const edges: any[] = [
    { from: projection.id, to: source.id, relation: "derives-from" },
    { from: evidenceNode.id, to: source.id, relation: "derives-from" },
    { from: evidenceNode.id, to: projection.id, relation: "matches-projection" },
    { from: evidenceNode.id, to: contractNode.id, relation: "verifies-contract" },
  ];

  if (kind === "frontend") {
    const bundleData = {
      artifactProfile: "spflow.frontend-bundle-v1",
      artifactRevision: 1,
      contractRevision: contract.project.contractRevision,
      entrypoint: "index.js",
      files: ["index.js"],
      sources: [{ path: source.relativePath, sha256: source.digest, bytes: source.byteLength }],
    };
    const bundle = createArtifactNode({
      kind: "frontend",
      relativePath: `${contract.frontend.root}/bundle-${section}.json`,
      sourceProfile: "spflow.frontend-bundle-v1",
      data: bundleData,
      bytes: nodeBytes(bundleData),
    });
    nodes.push(bundle);
    edges.push(
      { from: source.id, to: bundle.id, relation: "generates" },
      { from: contractNode.id, to: bundle.id, relation: "declares" },
    );
  } else {
    const packageContract = contract.packages[0]!;
    if (flow === undefined) return graph;
    const zipData = { packageId: packageContract.id, flowIds: [flow.id], inventory: [flow.definitionPath] };
    const zip = createArtifactNode({
      kind: "zip",
      relativePath: packageContract.path,
      sourceProfile: "package-bytes-v1",
      data: zipData,
      bytes: nodeBytes(zipData),
    });
    const manifestData = {
      packageId: packageContract.id,
      artifact: {
        path: packageContract.path,
        sha256: zip.digest,
        bytes: zip.byteLength,
      },
    };
    const manifest = createArtifactNode({
      kind: "manifest",
      relativePath: packageContract.manifestPath,
      sourceProfile: "package-manifest-v1",
      data: manifestData,
      bytes: nodeBytes(manifestData),
    });
    nodes.push(zip, manifest);
    edges.push(
      { from: contractNode.id, to: source.id, relation: "declares" },
      { from: source.id, to: zip.id, relation: "packages" },
      { from: contractNode.id, to: zip.id, relation: "declares" },
      { from: manifest.id, to: zip.id, relation: "hashes" },
    );
  }
  return structuredClone({ nodes, edges });
}

function fixtureFlow(contract: ProjectContract): NormalizedFlow | undefined {
  const flow = contract.flows[0];
  if (flow === undefined) return undefined;
  return {
    id: flow.id,
    trigger: {
      id: "SyntheticTrigger",
      type: "Request",
      expressionPointers: [],
      expressions: [],
    },
    actions: new Map([["SyntheticAction", {
      id: "SyntheticAction",
      type: "Compose",
      containerId: "root",
      containerIndex: 0,
      runAfter: [],
      expressionPointers: [],
      expressions: [],
      inputs: "synthetic",
    }]]),
    connectionReferences: new Set(flow.connectionReferences),
    actionCount: 1,
    declaredDestructive: false,
  };
}

/** Test-only adapter output for detector unit fixtures; production never reads this from disk. */
export function wp06FixtureAdapterEvidence(
  graph: ArtifactGraphInput,
  contract: ProjectContract,
): RuleAdapterEvidence {
  const derivations: Wp06AdapterDerivation[] = [];
  for (const evidence of graph.nodes.filter(({ sourceProfile }) =>
    sourceProfile === WP06_TRUSTED_ARTIFACT_PROFILE
  )) {
    const evidenceData = evidence.data as RecordValue;
    const evidenceBinding = evidenceData.binding as RecordValue | undefined;
    const section = evidenceBinding?.section as EvidenceSection | undefined;
    if (section === undefined) continue;
    const source = graph.nodes.find(({ relativePath, digest, byteLength }) =>
      relativePath === evidenceBinding.sourceArtifactPath
      && digest === evidenceBinding.sourceArtifactSha256
      && byteLength === evidenceBinding.sourceArtifactBytes
    );
    const projection = graph.nodes.find(({ relativePath }) =>
      relativePath === evidenceBinding.projectionArtifactPath
    );
    const projectionData = projection?.data as RecordValue | undefined;
    const adapter = projectionData?.adapter as RecordValue | undefined;
    if (source === undefined || projection === undefined || !Array.isArray(projectionData?.facts)) continue;
    derivations.push({
      adapterId: adapter?.id as Wp06AdapterDerivation["adapterId"],
      adapterVersion: 2,
      contractRevision: contract.project.contractRevision,
      sourceKind: evidence.kind as "builder" | "frontend",
      section,
      sourceArtifactPath: source.relativePath,
      sourceArtifactSha256: source.digest,
      sourceArtifactBytes: source.byteLength!,
      facts: structuredClone(projectionData.facts),
    });
  }

  const frontendSources = graph.nodes.filter((node) =>
    node.kind === "frontend"
    && node.sourceProfile === "frontend-projection-v1"
    && derivations.some(({ sourceArtifactPath }) => sourceArtifactPath === node.relativePath)
  );
  const normalizedFlow = fixtureFlow(contract);
  const definition = normalizedFlow === undefined
    ? undefined
    : graph.nodes.find((node) =>
        node.kind === "definition"
        && node.relativePath === contract.flows[0]?.definitionPath
      );
  const normalizedSha256 = definition?.digest;
  const definitions = definition === undefined || normalizedFlow === undefined
    ? []
    : [{
        flowId: normalizedFlow.id,
        relativePath: definition.relativePath,
        contract: contract.flows[0]!,
        bytes: definition.byteLength,
        sha256: definition.digest,
        normalizedSha256,
        flow: normalizedFlow,
      }];
  const packages = contract.packages.flatMap((packageContract) => {
    const zip = graph.nodes.find((node) =>
      node.kind === "zip" && node.relativePath === packageContract.path
    );
    if (zip === undefined || normalizedFlow === undefined) return [];
    const inventory = [`Workflows/${normalizedFlow.id}.json`];
    return [{
      packageId: packageContract.id,
      relativePath: zip.relativePath,
      contract: packageContract,
      bytes: zip.byteLength,
      sha256: zip.digest,
      inspection: {
        profile: "power-platform-solution-v1" as const,
        valid: true,
        inventory,
        expectedInventory: inventory,
        flows: [normalizedFlow],
        diagnostics: [],
      },
    }];
  });
  const flows = normalizedFlow === undefined || normalizedSha256 === undefined
    ? []
    : contract.flows.map((flowContract) => ({
        packageId: flowContract.packageId,
        packagePath: contract.packages.find(({ id }) => id === flowContract.packageId)?.path ?? "",
        contract: flowContract,
        flow: normalizedFlow,
        normalizedSha256,
      }));

  return {
    packages,
    flows,
    definitions,
    frontendBundles: frontendSources.length === 0 ? [] : [{
      root: contract.frontend.root,
      entrypoint: frontendSources[0]!.relativePath,
      files: frontendSources.map((node) => ({
        relativePath: node.relativePath,
        bytes: node.byteLength!,
        sha256: node.digest,
      })),
      sourcePaths: frontendSources.map(({ relativePath }) => relativePath),
      valid: true,
    }],
    wp06Derivations: derivations,
  };
}
