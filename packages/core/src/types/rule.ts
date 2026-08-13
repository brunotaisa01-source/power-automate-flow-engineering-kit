import type {
  ArtifactKind,
  EvidenceClass,
  RuleDomain,
} from "./constants.js";

export interface RuleDefinition {
  schemaVersion: "1.0";
  id: string;
  title: string;
  domain: RuleDomain;
  severity: "error" | "warning";
  description: string;
  rationale: string;
  appliesTo: ArtifactSelector[];
  detector: DetectorContract;
  red: FixtureExpectation;
  green: FixtureExpectation;
  finalArtifact: FinalArtifactRequirement;
  remediation: string[];
  residualGate: ResidualGate;
  supportedEvidence: EvidenceClass[];
  tags: string[];
}

export interface ArtifactSelector {
  kind: ArtifactKind;
  profile?: string;
  pathPattern?: string;
}

export interface DetectorContract {
  implementation: string;
  exportName: string;
  input: "artifact-node" | "artifact-graph";
  deterministic: true;
  network: "forbidden";
  parameters: Record<string, string | number | boolean>;
}

export interface FixtureExpectation {
  root: string;
  expectedResult: "PASS" | "FAIL";
  expectedDiagnosticCodes: string[];
}

export interface FinalArtifactRequirement {
  required: boolean;
  artifactKinds: Array<"generated-definition" | "zip" | "frontend-bundle" | "manifest">;
}

export interface ResidualGate {
  required: boolean;
  claimClass?: EvidenceClass;
  description?: string;
}
