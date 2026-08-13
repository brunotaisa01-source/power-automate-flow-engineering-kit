import type { FlowTrigger, PackageProfile } from "./constants.js";

export interface FlowContract {
  id: string;
  definitionPath: string;
  trigger: FlowTrigger;
  processorForCommandTypes: string[];
  connectionReferences: string[];
  actionBudget: number;
  concurrency: FlowConcurrency;
  packageId: string;
}

export interface FlowConcurrency {
  enabled: boolean;
  degree: number;
}

export interface PackageContract {
  id: string;
  path: string;
  profile: PackageProfile;
  manifestPath: string;
  flowIds: string[];
  importMode: "disabled";
  nestedArchives: "forbidden";
}
