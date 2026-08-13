import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { PackageContract } from "@spflow/core/types/flow";
import type { ProjectContract } from "@spflow/core/types/project-contract";
import type {
  FlowRuleEvidence,
  PackageInspection,
  PackageRuleEvidence,
  RuleAdapterEvidence,
} from "@spflow/core/types/rule-input";

import { ArchiveSafetyError } from "./archive-reader.ts";

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
    });
  };
}
