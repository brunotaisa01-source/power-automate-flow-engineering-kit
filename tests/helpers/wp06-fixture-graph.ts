import { canonicalize } from "../../packages/core/dist/canonical-json.js";
import { createArtifactNode } from "../../packages/core/dist/artifact-node.js";
import type { ProjectContract } from "../../packages/core/src/types/project-contract.ts";
import {
  WP06_FRONTEND_BUNDLE_PROFILE,
  WP06_FRONTEND_SOURCE_IR_PROFILE,
  WP06_POWER_AUTOMATE_SOURCE_IR_PROFILE,
  buildWp06ProjectionArtifact,
  deriveWp06SourceProjection,
} from "../../packages/core/dist/wp06-source-adapters.js";
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
  const sourceData = wp06SourceIrFromFacts(kind, section, facts, contract.project.contractRevision);
  const sourcePath = kind === "frontend"
    ? `frontend/source-${section}.json`
    : `flows/synthetic/builder-source-${section}.json`;
  const source = createArtifactNode({
    kind,
    relativePath: sourcePath,
    sourceProfile: kind === "frontend" ? WP06_FRONTEND_SOURCE_IR_PROFILE : WP06_POWER_AUTOMATE_SOURCE_IR_PROFILE,
    data: sourceData,
    bytes: nodeBytes(sourceData),
  });
  const projection = buildWp06ProjectionArtifact(source);
  if (projection === undefined) return graph;
  const normalized = deriveWp06SourceProjection(sourceData)!;
  data[section] = normalized.facts;

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
    sourceProfile: "wp06-evidence-v1",
    data,
    bytes: nodeBytes(data),
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
      artifactProfile: WP06_FRONTEND_BUNDLE_PROFILE,
      artifactRevision: 1,
      contractRevision: contract.project.contractRevision,
      entrypoint: "index.js",
      files: ["index.js"],
      sources: [{ path: source.relativePath, sha256: source.digest, bytes: source.byteLength }],
    };
    const bundle = createArtifactNode({
      kind: "frontend",
      relativePath: `${contract.frontend.root}/bundle-${section}.json`,
      sourceProfile: WP06_FRONTEND_BUNDLE_PROFILE,
      data: bundleData,
      bytes: nodeBytes(bundleData),
    });
    nodes.push(bundle);
    edges.push(
      { from: source.id, to: bundle.id, relation: "generates" },
      { from: contractNode.id, to: bundle.id, relation: "declares" },
    );
  } else {
    const flow = contract.flows[0]!;
    const packageContract = contract.packages[0]!;
    const definitionData = {
      properties: {
        definition: {
          triggers: { SyntheticTrigger: { type: "Request", inputs: {} } },
          actions: { SyntheticAction: { type: "Compose", inputs: "synthetic" } },
        },
      },
    };
    const definition = createArtifactNode({
      kind: "definition",
      relativePath: flow.definitionPath,
      sourceProfile: "normalized-flow-v1",
      data: definitionData,
      bytes: nodeBytes(definitionData),
    });
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
    nodes.push(definition, zip, manifest);
    edges.push(
      { from: source.id, to: definition.id, relation: "generates" },
      { from: contractNode.id, to: definition.id, relation: "declares" },
      { from: definition.id, to: zip.id, relation: "packages" },
      { from: contractNode.id, to: zip.id, relation: "declares" },
      { from: manifest.id, to: zip.id, relation: "hashes" },
    );
  }
  return structuredClone({ nodes, edges });
}
