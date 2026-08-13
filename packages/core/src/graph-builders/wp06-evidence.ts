import {
  WP06_ARTIFACT_PROFILE,
  WP06_EVIDENCE_PROFILE,
  WP06_EVIDENCE_SECTIONS,
  type NormalizedWp06Evidence,
  type NormalizedWp06EvidenceBinding,
  type Wp06EvidenceSection,
} from "../types/wp06-evidence.js";
import { isRecord, type ArtifactSource } from "./common.js";

const ENVELOPE_KEYS = new Set<string>([
  "evidenceProfile",
  "contractRevision",
  "binding",
  ...WP06_EVIDENCE_SECTIONS,
]);

const BINDING_KEYS = new Set<string>([
  "section",
  "contractArtifactPath",
  "contractArtifactSha256",
  "sourceArtifactPath",
  "sourceArtifactSha256",
  "sourceArtifactBytes",
  "sourceArtifactKind",
]);
const SHA256 = /^[0-9a-f]{64}$/;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [key, normalizeValue(item)]),
    );
  }
  return value;
}

function isEvidenceSection(value: unknown): value is Wp06EvidenceSection {
  return typeof value === "string"
    && (WP06_EVIDENCE_SECTIONS as readonly string[]).includes(value);
}

function isBinding(value: unknown): value is NormalizedWp06EvidenceBinding {
  return isRecord(value)
    && Object.keys(value).length === BINDING_KEYS.size
    && Object.keys(value).every((key) => BINDING_KEYS.has(key))
    && isEvidenceSection(value.section)
    && typeof value.contractArtifactPath === "string"
    && value.contractArtifactPath.length > 0
    && typeof value.contractArtifactSha256 === "string"
    && SHA256.test(value.contractArtifactSha256)
    && typeof value.sourceArtifactPath === "string"
    && value.sourceArtifactPath.length > 0
    && typeof value.sourceArtifactSha256 === "string"
    && SHA256.test(value.sourceArtifactSha256)
    && Number.isSafeInteger(value.sourceArtifactBytes)
    && (value.sourceArtifactBytes as number) > 0
    && (value.sourceArtifactKind === "builder" || value.sourceArtifactKind === "frontend");
}

export function normalizeWp06Evidence(data: unknown): NormalizedWp06Evidence | undefined {
  if (
    !isRecord(data)
    || data.evidenceProfile !== WP06_EVIDENCE_PROFILE
    || !Number.isSafeInteger(data.contractRevision)
    || (data.contractRevision as number) < 1
    || !isBinding(data.binding)
    || Object.keys(data).some((key) => !ENVELOPE_KEYS.has(key))
  ) {
    return undefined;
  }

  const presentSections: Wp06EvidenceSection[] = [];
  for (const section of WP06_EVIDENCE_SECTIONS) {
    const value = data[section];
    if (value === undefined) {
      continue;
    }
    if (
      !Array.isArray(value)
      || value.length === 0
      || value.some((item) => !isRecord(item))
    ) {
      return undefined;
    }
    presentSections.push(section);
  }
  if (presentSections.length !== 1 || presentSections[0] !== data.binding.section) {
    return undefined;
  }

  return normalizeValue(data) as NormalizedWp06Evidence;
}

export function normalizeWp06ArtifactSource(source: ArtifactSource): ArtifactSource {
  const evidence = normalizeWp06Evidence(source.data);
  return evidence === undefined
    ? source
    : {
      ...source,
      data: evidence,
      sourceProfile: WP06_ARTIFACT_PROFILE,
    };
}
