import {
  WP06_ARTIFACT_PROFILE,
  parseNormalizedWp06Evidence,
  parseNormalizedWp06SourceProjection,
  type NormalizedWp06Evidence,
  type NormalizedWp06SourceProjection,
} from "../types/wp06-evidence.js";
import {
  WP06_FRONTEND_BUNDLE_PROFILE,
  parseWp06FrontendBundle,
  wp06SourceProfile,
} from "../wp06-source-adapters.js";
import { isRecord, type ArtifactSource } from "./common.js";

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
  const normalized = normalizeValue(data);
  return parseNormalizedWp06Evidence(normalized);
}

export function normalizeWp06SourceProjection(
  data: unknown,
): NormalizedWp06SourceProjection | undefined {
  const normalized = normalizeValue(data);
  return parseNormalizedWp06SourceProjection(normalized);
}

export function normalizeWp06ArtifactSource(source: ArtifactSource): ArtifactSource {
  const evidence = normalizeWp06Evidence(source.data);
  if (evidence !== undefined) {
    return {
      ...source,
      data: evidence,
      sourceProfile: WP06_ARTIFACT_PROFILE,
    };
  }
  const sourceProfile = wp06SourceProfile(source.data);
  if (sourceProfile !== undefined) {
    return { ...source, sourceProfile };
  }
  return parseWp06FrontendBundle(source.data) === undefined
    ? source
    : { ...source, sourceProfile: WP06_FRONTEND_BUNDLE_PROFILE };
}
