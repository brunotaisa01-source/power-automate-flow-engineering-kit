import {
  WP06_ARTIFACT_PROFILE,
  WP06_EVIDENCE_PROFILE,
  WP06_EVIDENCE_SECTIONS,
  type NormalizedWp06Evidence,
} from "../types/wp06-evidence.js";
import { isRecord, type ArtifactSource } from "./common.js";

const ENVELOPE_KEYS = new Set<string>([
  "evidenceProfile",
  "contractRevision",
  ...WP06_EVIDENCE_SECTIONS,
]);

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

export function normalizeWp06Evidence(data: unknown): NormalizedWp06Evidence | undefined {
  if (
    !isRecord(data)
    || data.evidenceProfile !== WP06_EVIDENCE_PROFILE
    || !Number.isSafeInteger(data.contractRevision)
    || (data.contractRevision as number) < 1
    || Object.keys(data).some((key) => !ENVELOPE_KEYS.has(key))
  ) {
    return undefined;
  }

  let populated = false;
  for (const section of WP06_EVIDENCE_SECTIONS) {
    const value = data[section];
    if (value === undefined) {
      continue;
    }
    if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
      return undefined;
    }
    populated ||= value.length > 0;
  }
  if (!populated) {
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
