import { createHash } from "node:crypto";

import { canonicalize } from "./canonical-json.js";
import { normalizeRepositoryPath } from "./path-policy.js";
import type { ArtifactKind } from "./types/constants.js";

export const PROJECTION_KEYS = [
  "fields",
  "indexes",
  "states",
  "save-mode",
  "connection-references",
  "action-budget",
  "inventory",
  "digests",
] as const;

export type ProjectionKey = (typeof PROJECTION_KEYS)[number];
export type ProjectionScopes = Readonly<Record<string, unknown>>;
export type ArtifactProjections = Readonly<
  Partial<Record<ProjectionKey, ProjectionScopes>>
>;

export interface ArtifactNode {
  readonly id: string;
  readonly kind: ArtifactKind;
  readonly relativePath: string;
  readonly digest: string;
  readonly byteLength?: number;
  readonly sourceProfile: string;
  readonly data: unknown;
  readonly projections: ArtifactProjections;
}

export type ArtifactRelation =
  | "declares"
  | "generates"
  | "packages"
  | "hashes"
  | "documents"
  | "supports";

export interface ArtifactEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: ArtifactRelation;
}

export interface CreateArtifactNodeInput {
  readonly kind: ArtifactKind;
  readonly relativePath: string;
  readonly sourceProfile: string;
  readonly data: unknown;
  readonly projections?: ArtifactProjections;
  readonly bytes?: Uint8Array;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cloneAndFreeze<T>(value: T): T {
  const clone = structuredClone(value);
  const visited = new Set<object>();

  const freeze = (item: unknown): void => {
    if (item === null || typeof item !== "object" || visited.has(item)) {
      return;
    }
    visited.add(item);
    for (const child of Object.values(item)) {
      freeze(child);
    }
    Object.freeze(item);
  };

  freeze(clone);
  return clone;
}

function normalizedProjections(projections: ArtifactProjections): ArtifactProjections {
  const result: Partial<Record<ProjectionKey, ProjectionScopes>> = {};
  for (const key of PROJECTION_KEYS) {
    const scopes = projections[key];
    if (scopes === undefined) {
      continue;
    }
    result[key] = Object.fromEntries(
      Object.entries(scopes).sort(([left], [right]) => compareText(left, right)),
    );
  }
  return cloneAndFreeze(result);
}

export function createArtifactNode(input: CreateArtifactNodeInput): ArtifactNode {
  const relativePath = normalizeRepositoryPath(input.relativePath);
  const data = cloneAndFreeze(input.data);
  const projections = normalizedProjections(input.projections ?? {});
  const digest = createHash("sha256")
    .update(input.bytes ?? Buffer.from(canonicalize(data), "utf8"))
    .digest("hex");
  const id = `${input.kind}:${relativePath}:${input.sourceProfile}`;

  return Object.freeze({
    id,
    kind: input.kind,
    relativePath,
    digest,
    ...(input.bytes === undefined ? {} : { byteLength: input.bytes.byteLength }),
    sourceProfile: input.sourceProfile,
    data,
    projections,
  });
}

export function createArtifactEdge(edge: ArtifactEdge): ArtifactEdge {
  if (edge.from.length === 0 || edge.to.length === 0) {
    throw new Error("Artifact edge endpoints must not be empty.");
  }
  return Object.freeze({ ...edge });
}
