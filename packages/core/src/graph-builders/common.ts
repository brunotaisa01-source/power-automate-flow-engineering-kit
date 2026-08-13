import type {
  ArtifactProjections,
  CreateArtifactNodeInput,
  ProjectionKey,
  ProjectionScopes,
} from "../artifact-node.js";
import { PROJECTION_KEYS } from "../artifact-node.js";

export interface ArtifactSource {
  readonly relativePath: string;
  readonly data: unknown;
  readonly sourceProfile?: string;
  readonly bytes?: Uint8Array;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function projectionEnvelope(data: unknown): ArtifactProjections {
  if (!isRecord(data) || !isRecord(data.projections)) {
    return {};
  }

  const result: Partial<Record<ProjectionKey, ProjectionScopes>> = {};
  for (const key of PROJECTION_KEYS) {
    const scopes = data.projections[key];
    if (isRecord(scopes)) {
      result[key] = scopes;
    }
  }
  return result;
}

export function mergeProjections(
  ...items: readonly ArtifactProjections[]
): ArtifactProjections {
  const result: Partial<Record<ProjectionKey, Record<string, unknown>>> = {};
  for (const item of items) {
    for (const key of PROJECTION_KEYS) {
      const scopes = item[key];
      if (scopes !== undefined) {
        result[key] = { ...result[key], ...scopes };
      }
    }
  }
  return result;
}

export function nodeInput(
  source: ArtifactSource,
  fallbackProfile: string,
): Pick<CreateArtifactNodeInput, "relativePath" | "data" | "sourceProfile" | "bytes"> {
  return {
    relativePath: source.relativePath,
    data: source.data,
    sourceProfile: source.sourceProfile ?? fallbackProfile,
    ...(source.bytes === undefined ? {} : { bytes: source.bytes }),
  };
}
