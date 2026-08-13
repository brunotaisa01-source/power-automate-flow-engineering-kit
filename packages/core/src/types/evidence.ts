import type { EvidenceClass } from "./constants.js";

export interface EvidenceRecord {
  schemaVersion: "1.0";
  evidenceId: string;
  claimClass: EvidenceClass;
  subject: EvidenceSubject;
  contract: EvidenceContractBinding;
  artifacts: EvidenceArtifact[];
  execution: ExecutionEvidence;
  assertions: EvidenceAssertion[];
  dependencies: string[];
  residualGates: ResidualGateRecord[];
  review: ReviewRecord;
  result: "PASS" | "FAIL" | "BLOCKED";
}

export interface EvidenceSubject {
  type: "toolkit-release" | "project-artifact" | "tenant-import" | "tenant-flow" | "tenant-application";
  id: string;
  targetBindingKey?: string;
  changeWindowId?: string;
}

export interface EvidenceContractBinding {
  projectId: string;
  revision: number;
  digest: string;
}

export interface EvidenceArtifact {
  path: string;
  sha256: string;
  bytes: number;
  role: string;
}

export interface ExecutionEvidence {
  command: string;
  toolVersion: string;
  startedAt: string;
  endedAt: string;
  exitCode: number;
  normalizedOutputPath: string;
  networkMode: "offline" | "authenticated-read" | "authorized-write";
}

export interface EvidenceAssertion {
  id: string;
  description: string;
  expected: unknown;
  actual: unknown;
  result: "PASS" | "FAIL" | "NOT_RUN";
}

export interface ResidualGateRecord {
  id: string;
  requiredClaimClass: EvidenceClass;
  status: "OPEN" | "SATISFIED" | "NOT_APPLICABLE";
  evidenceId?: string;
}

export interface ReviewRecord {
  gate: string;
  reviewerRole: string;
  decision: "APPROVED" | "REJECTED" | "PENDING";
  decidedAt?: string;
}
