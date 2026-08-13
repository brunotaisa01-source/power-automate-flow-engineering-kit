import {
  WP06_ARTIFACT_PROFILE,
  WP06_SOURCE_PROJECTION_PROFILE,
  parseNormalizedWp06Evidence,
  parseNormalizedWp06SourceProjection,
  type NormalizedWp06Evidence,
  type NormalizedWp06SourceProjection,
} from "../types/wp06-evidence.js";
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
  const projection = normalizeWp06SourceProjection(source.data);
  return projection === undefined
    ? source
    : {
      ...source,
      data: projection,
      sourceProfile: WP06_SOURCE_PROJECTION_PROFILE,
    };
}
