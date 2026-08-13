import { type Readable } from "node:stream";

import {
  fromBufferPromise,
  openPromise,
  type Entry,
  type ZipFile,
} from "yauzl";

import {
  resolveArchiveLimits,
  type ArchiveLimits,
} from "./archive-limits.ts";

export type ArchiveSafetyReason =
  | "MALFORMED_ARCHIVE"
  | "UNSAFE_PATH"
  | "DUPLICATE_PATH"
  | "CASE_COLLISION"
  | "ENCRYPTED_ENTRY"
  | "UNSUPPORTED_ENTRY_TYPE"
  | "UNSUPPORTED_COMPRESSION"
  | "DEVICE_NAME"
  | "ENTRY_COUNT_LIMIT"
  | "ENTRY_SIZE_LIMIT"
  | "TOTAL_SIZE_LIMIT"
  | "COMPRESSION_RATIO_LIMIT"
  | "NESTED_ARCHIVE"
  | "UNSAFE_XML";

const REASON_MESSAGES: Readonly<Record<ArchiveSafetyReason, string>> = Object.freeze({
  MALFORMED_ARCHIVE: "Archive structure is malformed or unsupported.",
  UNSAFE_PATH: "Archive contains an unsafe entry path.",
  DUPLICATE_PATH: "Archive contains a duplicate normalized path.",
  CASE_COLLISION: "Archive contains a case-colliding path.",
  ENCRYPTED_ENTRY: "Archive contains an encrypted entry.",
  UNSUPPORTED_ENTRY_TYPE: "Archive contains a link or unsupported entry type.",
  UNSUPPORTED_COMPRESSION: "Archive contains an unsupported compression method.",
  DEVICE_NAME: "Archive contains a reserved device path.",
  ENTRY_COUNT_LIMIT: "Archive entry count exceeds the configured limit.",
  ENTRY_SIZE_LIMIT: "Archive entry size exceeds the configured limit.",
  TOTAL_SIZE_LIMIT: "Archive total size exceeds the configured limit.",
  COMPRESSION_RATIO_LIMIT: "Archive compression ratio exceeds the configured limit.",
  NESTED_ARCHIVE: "Archive contains a forbidden nested archive.",
  UNSAFE_XML: "XML contains a forbidden declaration or is malformed.",
});

export class ArchiveSafetyError extends Error {
  readonly code = "PKG-ARCHIVE-001" as const;
  readonly reason: ArchiveSafetyReason;

  constructor(reason: ArchiveSafetyReason) {
    super(REASON_MESSAGES[reason]);
    this.name = "ArchiveSafetyError";
    this.reason = reason;
  }
}

export interface ArchiveEntryMetadata {
  readonly path: string;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly compressionMethod: number;
}

export interface SafeArchive {
  readonly inventory: readonly string[];
  readonly entries: readonly ArchiveEntryMetadata[];
  read(path: string): Promise<Buffer>;
  close(): void;
}

interface IndexedEntry {
  readonly metadata: ArchiveEntryMetadata;
  readonly entry: Entry;
}

const DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const NESTED_EXTENSIONS = [".7z", ".gz", ".rar", ".tar", ".zip"] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(reason: ArchiveSafetyReason): never {
  throw new ArchiveSafetyError(reason);
}

function decodeEntryName(entry: Entry): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(entry.fileNameRaw);
  } catch {
    return fail("UNSAFE_PATH");
  }
}

function normalizeEntryPath(rawPath: string): string {
  if (
    rawPath.length === 0
    || /^[A-Za-z]:/.test(rawPath)
    || /^[\\/]/.test(rawPath)
    || /[\u0000-\u001f\u007f]/.test(rawPath)
  ) {
    return fail("UNSAFE_PATH");
  }

  const segments = rawPath.replaceAll("\\", "/").split("/");
  if (segments.includes("..")) {
    return fail("UNSAFE_PATH");
  }
  const normalizedSegments = segments.filter((segment) => segment !== "" && segment !== ".");
  if (normalizedSegments.length === 0) {
    return fail("UNSAFE_PATH");
  }
  for (const segment of normalizedSegments) {
    if (segment.endsWith(".") || segment.endsWith(" ") || DEVICE_NAME.test(segment)) {
      return fail("DEVICE_NAME");
    }
  }
  return normalizedSegments.join("/");
}

function classifyEntryType(entry: Entry, rawPath: string): "file" | "directory" {
  const unixMode = entry.externalFileAttributes >>> 16;
  const fileType = unixMode & 0o170000;
  if (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000) {
    return fail("UNSUPPORTED_ENTRY_TYPE");
  }
  return rawPath.endsWith("/") || fileType === 0o040000 ? "directory" : "file";
}

function hasNestedArchiveExtension(path: string): boolean {
  const folded = path.toLowerCase();
  return NESTED_EXTENSIONS.some((extension) => folded.endsWith(extension));
}

function hasArchiveSignature(prefix: Uint8Array): boolean {
  if (prefix.length >= 4) {
    const firstFour = Buffer.from(prefix.subarray(0, 4)).toString("hex");
    if (["504b0304", "504b0506", "504b0708", "52617221"].includes(firstFour)) {
      return true;
    }
  }
  return (
    prefix.length >= 6
    && Buffer.from(prefix.subarray(0, 6)).toString("hex") === "377abcaf271c"
  ) || (
    prefix.length >= 2
    && prefix[0] === 0x1f
    && prefix[1] === 0x8b
  );
}

async function readPrefix(zipFile: ZipFile, entry: Entry, length: number): Promise<Buffer> {
  let stream: Readable;
  try {
    stream = await zipFile.openReadStreamPromise(entry);
  } catch {
    return fail("MALFORMED_ARCHIVE");
  }

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const finish = (value: Buffer): void => {
      if (settled) {
        return;
      }
      settled = true;
      stream.destroy();
      resolve(value);
    };
    stream.once("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      finish(Buffer.from(bytes.subarray(0, length)));
    });
    stream.once("end", () => finish(Buffer.alloc(0)));
    stream.once("error", () => {
      if (!settled) {
        settled = true;
        reject(new ArchiveSafetyError("MALFORMED_ARCHIVE"));
      }
    });
  });
}

async function readEntry(zipFile: ZipFile, indexed: IndexedEntry): Promise<Buffer> {
  let stream: Readable;
  try {
    stream = await zipFile.openReadStreamPromise(indexed.entry);
  } catch {
    return fail("MALFORMED_ARCHIVE");
  }

  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += bytes.length;
      if (total > indexed.metadata.uncompressedBytes) {
        return fail("MALFORMED_ARCHIVE");
      }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof ArchiveSafetyError) {
      throw error;
    }
    return fail("MALFORMED_ARCHIVE");
  }
  if (total !== indexed.metadata.uncompressedBytes) {
    return fail("MALFORMED_ARCHIVE");
  }
  return Buffer.concat(chunks, total);
}

async function openZip(source: string | Uint8Array): Promise<ZipFile> {
  const options = {
    autoClose: false,
    lazyEntries: true,
    decodeStrings: false,
    validateEntrySizes: false,
    strictFileNames: true,
  } as const;
  try {
    return typeof source === "string"
      ? await openPromise(source, options)
      : await fromBufferPromise(Buffer.from(source), options);
  } catch {
    return fail("MALFORMED_ARCHIVE");
  }
}

export async function openSafeArchive(
  source: string | Uint8Array,
  limitOverrides: Partial<ArchiveLimits> = {},
): Promise<SafeArchive> {
  const limits = resolveArchiveLimits(limitOverrides);
  const zipFile = await openZip(source);
  const indexedByPath = new Map<string, IndexedEntry>();
  const foldedPaths = new Map<string, string>();
  let totalUncompressedBytes = 0;

  try {
    if (zipFile.entryCount > limits.maxEntries) {
      return fail("ENTRY_COUNT_LIMIT");
    }

    let entryCount = 0;
    for await (const entry of zipFile.eachEntry()) {
      entryCount += 1;
      if (entryCount > limits.maxEntries) {
        return fail("ENTRY_COUNT_LIMIT");
      }
      const rawPath = decodeEntryName(entry);
      const path = normalizeEntryPath(rawPath);
      const foldedPath = path.toLowerCase();
      const existing = foldedPaths.get(foldedPath);
      if (existing === path) {
        return fail("DUPLICATE_PATH");
      }
      if (existing !== undefined) {
        return fail("CASE_COLLISION");
      }
      foldedPaths.set(foldedPath, path);

      if (entry.isEncrypted()) {
        return fail("ENCRYPTED_ENTRY");
      }
      const entryType = classifyEntryType(entry, rawPath);
      if (![0, 8].includes(entry.compressionMethod)) {
        return fail("UNSUPPORTED_COMPRESSION");
      }
      if (entry.compressionMethod === 0 && entry.compressedSize !== entry.uncompressedSize) {
        return fail("MALFORMED_ARCHIVE");
      }
      if (entry.uncompressedSize > limits.maxEntryUncompressedBytes) {
        return fail("ENTRY_SIZE_LIMIT");
      }
      totalUncompressedBytes += entry.uncompressedSize;
      if (!Number.isSafeInteger(totalUncompressedBytes)
        || totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
        return fail("TOTAL_SIZE_LIMIT");
      }
      const compressionRatio = entry.uncompressedSize === 0
        ? 0
        : entry.compressedSize === 0
          ? Number.POSITIVE_INFINITY
          : entry.uncompressedSize / entry.compressedSize;
      if (compressionRatio > limits.maxCompressionRatio) {
        return fail("COMPRESSION_RATIO_LIMIT");
      }
      if (entryType === "file") {
        const metadata = Object.freeze({
          path,
          compressedBytes: entry.compressedSize,
          uncompressedBytes: entry.uncompressedSize,
          compressionMethod: entry.compressionMethod,
        });
        indexedByPath.set(path, { metadata, entry });
      }
    }

    if (limits.nestedArchives === "forbidden") {
      for (const [path, indexed] of [...indexedByPath].sort(([left], [right]) => compareText(left, right))) {
        if (hasNestedArchiveExtension(path)) {
          return fail("NESTED_ARCHIVE");
        }
        if (indexed.metadata.uncompressedBytes >= 2) {
          const prefix = await readPrefix(zipFile, indexed.entry, 8);
          if (hasArchiveSignature(prefix)) {
            return fail("NESTED_ARCHIVE");
          }
        }
      }
    }
  } catch (error) {
    zipFile.close();
    if (error instanceof ArchiveSafetyError) {
      throw error;
    }
    return fail("MALFORMED_ARCHIVE");
  }

  const sortedEntries = [...indexedByPath.values()]
    .sort((left, right) => compareText(left.metadata.path, right.metadata.path));
  const inventory = Object.freeze(sortedEntries.map(({ metadata }) => metadata.path));
  const entries = Object.freeze(sortedEntries.map(({ metadata }) => metadata));
  let closed = false;

  return Object.freeze({
    inventory,
    entries,
    async read(path: string): Promise<Buffer> {
      if (closed) {
        throw new Error("Archive reader is closed.");
      }
      const normalized = normalizeEntryPath(path);
      const indexed = indexedByPath.get(normalized);
      if (indexed === undefined) {
        throw new Error("Archive entry does not exist.");
      }
      return readEntry(zipFile, indexed);
    },
    close(): void {
      if (!closed) {
        closed = true;
        zipFile.close();
      }
    },
  });
}
