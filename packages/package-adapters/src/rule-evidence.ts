import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { PackageContract } from "@spflow/core/types/flow";
import type { ProjectContract } from "@spflow/core/types/project-contract";
import type {
  DefinitionRuleEvidence,
  FlowRuleEvidence,
  PackageInspection,
  PackageRuleEvidence,
  RuleAdapterEvidence,
} from "@spflow/core/types/rule-input";

import { ArchiveSafetyError } from "./archive-reader.ts";
import { normalizeFlow } from "./flow-normalizer.ts";
import { inspectFrontendInventory } from "./frontend-inventory.ts";
import { deriveDefinitionWp06, deriveFrontendWp06 } from "./wp06-derivation.ts";

export type {
  FlowRuleEvidence,
  PackageRuleEvidence,
  RuleAdapterEvidence,
} from "@spflow/core/types/rule-input";

export type PackageBytesInspector = (
  bytes: Uint8Array,
) => Promise<PackageInspection>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeContractPath(path: string): string {
  if (
    path.length === 0
    || isAbsolute(path)
    || /^[A-Za-z]:/.test(path)
    || /^[\\/]/.test(path)
    || /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new TypeError("Contract package path must be repository-relative.");
  }
  const segments = path.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new TypeError("Contract package path must be normalized.");
  }
  return segments.join("/");
}

function pathIsWithinRoot(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot === ""
    || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== ".." && !isAbsolute(fromRoot));
}

function isMissing(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function normalizedFlowSha256(flow: FlowRuleEvidence["flow"]): string {
  const serialized = JSON.stringify({
    id: flow.id,
    trigger: flow.trigger,
    actions: [...flow.actions.entries()],
    connectionReferences: [...flow.connectionReferences].sort(compareText),
    actionCount: flow.actionCount,
    declaredDestructive: flow.declaredDestructive,
  });
  return createHash("sha256").update(serialized).digest("hex");
}

async function inspectDefinition(
  repositoryRoot: string,
  contract: ProjectContract["flows"][number],
): Promise<DefinitionRuleEvidence> {
  const relativePath = normalizeContractPath(contract.definitionPath);
  const target = resolve(repositoryRoot, ...relativePath.split("/"));
  let bytes: Buffer;
  try {
    const resolvedTarget = await realpath(target);
    if (!pathIsWithinRoot(repositoryRoot, resolvedTarget)) {
      return Object.freeze({ flowId: contract.id, relativePath, contract, failure: "invalid" });
    }
    bytes = await readFile(resolvedTarget);
  } catch (error) {
    return Object.freeze({
      flowId: contract.id,
      relativePath,
      contract,
      failure: isMissing(error) ? "missing" : "invalid",
    });
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    const raw = JSON.parse(bytes.toString("utf8")) as unknown;
    const flow = normalizeFlow(raw, { id: contract.id });
    return Object.freeze({
      flowId: contract.id,
      relativePath,
      contract,
      bytes: bytes.byteLength,
      sha256,
      normalizedSha256: normalizedFlowSha256(flow),
      flow,
    });
  } catch {
    return Object.freeze({
      flowId: contract.id,
      relativePath,
      contract,
      bytes: bytes.byteLength,
      sha256,
      failure: "invalid",
    });
  }
}

async function inspectPackage(
  repositoryRoot: string,
  contract: PackageContract,
  inspectSolutionBytes: PackageBytesInspector,
): Promise<PackageRuleEvidence> {
  const relativePath = normalizeContractPath(contract.path);
  const target = resolve(repositoryRoot, ...relativePath.split("/"));
  let resolvedTarget: string;
  let bytes: Buffer;
  try {
    resolvedTarget = await realpath(target);
    if (!pathIsWithinRoot(repositoryRoot, resolvedTarget)) {
      return Object.freeze({
        packageId: contract.id,
        relativePath,
        contract,
        failure: "invalid",
      });
    }
    bytes = await readFile(resolvedTarget);
  } catch (error) {
    if (isMissing(error)) {
      return Object.freeze({
        packageId: contract.id,
        relativePath,
        contract,
        failure: "missing",
      });
    }
    return Object.freeze({
      packageId: contract.id,
      relativePath,
      contract,
      failure: "invalid",
    });
  }

  const digest = createHash("sha256").update(bytes).digest("hex");
  try {
    const inspection = await inspectSolutionBytes(bytes);
    return Object.freeze({
      packageId: contract.id,
      relativePath,
      contract,
      bytes: bytes.byteLength,
      sha256: digest,
      inspection,
    });
  } catch (error) {
    if (error instanceof ArchiveSafetyError) {
      return Object.freeze({
        packageId: contract.id,
        relativePath,
        contract,
        bytes: bytes.byteLength,
        sha256: digest,
        failure: "unsafe",
        archiveReason: error.reason,
      });
    }
    return Object.freeze({
      packageId: contract.id,
      relativePath,
      contract,
      bytes: bytes.byteLength,
      sha256: digest,
      failure: "invalid",
    });
  }
}

export function createProjectRuleEvidenceInspector(
  inspectSolutionBytes: PackageBytesInspector,
): (root: string, contract: ProjectContract) => Promise<RuleAdapterEvidence> {
  return async (root, contract) => {
    const repositoryRoot = await realpath(resolve(root));
    const definitions: DefinitionRuleEvidence[] = [];
    for (const flow of [...contract.flows].sort((left, right) =>
      compareText(left.definitionPath, right.definitionPath) || compareText(left.id, right.id)
    )) {
      definitions.push(await inspectDefinition(repositoryRoot, flow));
    }
    const frontendContract = (contract as Partial<ProjectContract>).frontend;
    const frontendBundles = frontendContract === undefined
      ? []
      : [await inspectFrontendInventory(
          repositoryRoot,
          frontendContract.root,
          contract.project.contractRevision,
        )];
    const wp06Derivations = definitions.flatMap((definition) =>
      deriveDefinitionWp06(contract, definition)
    );
    const frontendBundle = frontendBundles[0];
    if (frontendBundle?.valid) {
      for (const sourcePath of frontendBundle.sourcePaths) {
        const source = frontendBundle.files.find(({ relativePath }) => relativePath === sourcePath);
        if (source === undefined) continue;
        try {
          const target = await realpath(resolve(repositoryRoot, ...sourcePath.split("/")));
          if (!pathIsWithinRoot(repositoryRoot, target)) continue;
          const bytes = await readFile(target);
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          if (bytes.byteLength !== source.bytes || sha256 !== source.sha256) continue;
          wp06Derivations.push(...deriveFrontendWp06(contract, source, bytes.toString("utf8")));
        } catch {
          // The inventory becomes non-authoritative when a source cannot be read back exactly.
        }
      }
    }
    const packages: PackageRuleEvidence[] = [];
    for (const packageContract of [...contract.packages].sort((left, right) =>
      compareText(left.path, right.path) || compareText(left.id, right.id)
    )) {
      packages.push(await inspectPackage(
        repositoryRoot,
        packageContract,
        inspectSolutionBytes,
      ));
    }

    const flowContracts = new Map(contract.flows.map((flow) => [flow.id, flow]));
    const flows: FlowRuleEvidence[] = [];
    for (const packaged of packages) {
      for (const flow of packaged.inspection?.flows ?? []) {
        const flowContract = flowContracts.get(flow.id);
        if (
          flowContract !== undefined
          && flowContract.packageId === packaged.packageId
          && packaged.contract.flowIds.includes(flow.id)
        ) {
          flows.push(Object.freeze({
            packageId: packaged.packageId,
            packagePath: packaged.relativePath,
            contract: flowContract,
            flow,
            normalizedSha256: normalizedFlowSha256(flow),
          }));
        }
      }
    }
    flows.sort((left, right) =>
      compareText(left.packagePath, right.packagePath)
      || compareText(left.flow.id, right.flow.id)
    );
    return Object.freeze({
      packages: Object.freeze(packages),
      flows: Object.freeze(flows),
      definitions: Object.freeze(definitions),
      frontendBundles: Object.freeze(frontendBundles),
      wp06Derivations: Object.freeze(wp06Derivations),
    });
  };
}
