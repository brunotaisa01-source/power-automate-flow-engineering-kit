import { createArtifactNode, type ArtifactNode, type ArtifactProjections } from "../artifact-node.js";
import type { ProjectContract } from "../types/project-contract.js";
import { frontendProjections } from "./frontend.js";
import { flowProjections } from "./flow.js";
import { schemaProjections } from "./schema.js";

export interface ContractArtifacts {
  readonly contract: ArtifactNode;
  readonly schema: ArtifactNode;
  readonly frontend: ArtifactNode;
  readonly flows: readonly ArtifactNode[];
}

function contractProjections(contract: ProjectContract): ArtifactProjections {
  const projections: ArtifactProjections[] = [
    schemaProjections(contract.sharePoint),
    frontendProjections(contract.frontend),
    ...contract.flows.map(flowProjections),
  ];
  const result: Record<string, Record<string, unknown>> = {};

  for (const projection of projections) {
    for (const [key, scopes] of Object.entries(projection)) {
      result[key] = { ...result[key], ...scopes };
    }
  }
  result.inventory = Object.fromEntries(
    contract.packages.map(({ id, flowIds }) => [`package:${id}:flows`, flowIds]),
  );
  return result as ArtifactProjections;
}

export function buildContractArtifacts(
  relativePath: string,
  contract: ProjectContract,
  bytes?: Uint8Array,
): ContractArtifacts {
  const withBytes = bytes === undefined ? {} : { bytes };
  const contractNode = createArtifactNode({
    kind: "contract",
    relativePath,
    sourceProfile: "project-contract-v1",
    data: contract,
    projections: contractProjections(contract),
    ...withBytes,
  });
  const schema = createArtifactNode({
    kind: "schema",
    relativePath,
    sourceProfile: "project-contract-sharepoint-v1",
    data: contract.sharePoint,
    projections: schemaProjections(contract.sharePoint),
  });
  const frontend = createArtifactNode({
    kind: "frontend",
    relativePath,
    sourceProfile: "project-contract-frontend-v1",
    data: contract.frontend,
    projections: frontendProjections(contract.frontend),
  });
  const flows = contract.flows.map((flow) =>
    createArtifactNode({
      kind: "contract",
      relativePath,
      sourceProfile: `flow-contract-v1:${flow.id}`,
      data: flow,
      projections: flowProjections(flow),
    })
  );

  return Object.freeze({
    contract: contractNode,
    schema,
    frontend,
    flows: Object.freeze(flows),
  });
}
