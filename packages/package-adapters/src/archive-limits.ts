export interface ArchiveLimits {
  readonly maxEntries: number;
  readonly maxEntryUncompressedBytes: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxCompressionRatio: number;
  readonly nestedArchives: "forbidden";
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = Object.freeze({
  maxEntries: 2_000,
  maxEntryUncompressedBytes: 50 * 1024 * 1024,
  maxTotalUncompressedBytes: 250 * 1024 * 1024,
  maxCompressionRatio: 100,
  nestedArchives: "forbidden",
});

export function resolveArchiveLimits(
  limits: Partial<ArchiveLimits> = {},
): ArchiveLimits {
  const resolved: ArchiveLimits = {
    ...DEFAULT_ARCHIVE_LIMITS,
    ...limits,
    nestedArchives: "forbidden",
  };

  for (const [name, value] of Object.entries(resolved)) {
    if (name === "nestedArchives") {
      continue;
    }
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new TypeError(`Archive limit '${name}' must be a positive safe integer.`);
    }
  }
  return Object.freeze(resolved);
}
