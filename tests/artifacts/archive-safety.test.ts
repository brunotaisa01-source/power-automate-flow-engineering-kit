import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { describe, test } from "node:test";

import {
  ArchiveSafetyError,
  openSafeArchive,
} from "../../packages/package-adapters/src/archive-reader.ts";
import {
  DEFAULT_ARCHIVE_LIMITS,
  type ArchiveLimits,
} from "../../packages/package-adapters/src/archive-limits.ts";
import { parseSafeXml } from "../../packages/package-adapters/src/xml-safe-parser.ts";

interface ZipEntryInput {
  readonly name: string;
  readonly content?: string | Uint8Array;
  readonly compressed?: boolean;
  readonly encrypted?: boolean;
  readonly unixMode?: number;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function syntheticZip(entries: readonly ZipEntryInput[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const input of entries) {
    const name = Buffer.from(input.name, "utf8");
    const content = typeof input.content === "string"
      ? Buffer.from(input.content, "utf8")
      : Buffer.from(input.content ?? new Uint8Array());
    const method = input.compressed === true ? 8 : 0;
    const payload = method === 8 ? deflateRawSync(content) : content;
    const flags = input.encrypted === true ? 1 : 0;
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((input.unixMode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function rejectsArchive(
  entries: readonly ZipEntryInput[],
  reason: ArchiveSafetyError["reason"],
  limits?: Partial<ArchiveLimits>,
): Promise<void> {
  await assert.rejects(
    openSafeArchive(syntheticZip(entries), limits),
    (error: unknown) => {
      assert.ok(error instanceof ArchiveSafetyError);
      assert.equal(error.code, "PKG-ARCHIVE-001");
      assert.equal(error.reason, reason);
      assert.equal(error.message.includes("private-marker"), false);
      return true;
    },
  );
}

describe("package adapter archive safety", () => {
  test("enumerates safe entries and reads content without filesystem extraction", async () => {
    const archive = await openSafeArchive(syntheticZip([
      { name: "Workflows/synthetic-flow.json", content: "synthetic" },
    ]));
    try {
      assert.deepEqual(archive.inventory, ["Workflows/synthetic-flow.json"]);
      assert.equal(
        (await archive.read("Workflows/synthetic-flow.json")).toString("utf8"),
        "synthetic",
      );
    } finally {
      archive.close();
    }
  });

  test("rejects traversal, absolute, drive-prefixed, and UNC entry paths", async () => {
    for (const name of [
      "safe/../private-marker.txt",
      "/private-marker.txt",
      "X:/private-marker.txt",
      "//private-marker/share.txt",
    ]) {
      await rejectsArchive([{ name }], "UNSAFE_PATH");
    }
  });

  test("rejects duplicate normalized paths and case collisions", async () => {
    await rejectsArchive(
      [{ name: "safe/./item.txt" }, { name: "safe/item.txt" }],
      "DUPLICATE_PATH",
    );
    await rejectsArchive(
      [{ name: "Safe/item.txt" }, { name: "safe/item.txt" }],
      "CASE_COLLISION",
    );
  });

  test("rejects encrypted entries, links, and device names", async () => {
    await rejectsArchive(
      [{ name: "private-marker.txt", encrypted: true }],
      "ENCRYPTED_ENTRY",
    );
    await rejectsArchive(
      [{ name: "private-marker.txt", unixMode: 0o120777 }],
      "UNSUPPORTED_ENTRY_TYPE",
    );
    await rejectsArchive([{ name: "aux.txt" }], "DEVICE_NAME");
  });

  test("enforces entry count, entry size, total size, and compression ratio", async () => {
    await rejectsArchive(
      [{ name: "one.txt" }, { name: "two.txt" }],
      "ENTRY_COUNT_LIMIT",
      { maxEntries: 1 },
    );
    await rejectsArchive(
      [{ name: "large.txt", content: "1234" }],
      "ENTRY_SIZE_LIMIT",
      { maxEntryUncompressedBytes: 3 },
    );
    await rejectsArchive(
      [
        { name: "one.txt", content: "123" },
        { name: "two.txt", content: "456" },
      ],
      "TOTAL_SIZE_LIMIT",
      { maxTotalUncompressedBytes: 5 },
    );
    await rejectsArchive(
      [{ name: "compressed.txt", content: "0".repeat(4_096), compressed: true }],
      "COMPRESSION_RATIO_LIMIT",
      { maxCompressionRatio: 10 },
    );
  });

  test("uses the approved default archive limits", () => {
    assert.deepEqual(DEFAULT_ARCHIVE_LIMITS, {
      maxEntries: 2_000,
      maxEntryUncompressedBytes: 50 * 1024 * 1024,
      maxTotalUncompressedBytes: 250 * 1024 * 1024,
      maxCompressionRatio: 100,
      nestedArchives: "forbidden",
    });
  });

  test("normalizes a fixed-seed bounded inventory deterministically", async () => {
    let state = 0x5f10a11;
    const random = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state;
    };
    const entries = Array.from({ length: 64 }, (_, index) => ({
      name: `Workflows/group-${random() % 8}/item-${index.toString().padStart(2, "0")}.json`,
      content: `synthetic-${index}`,
    }));
    for (let index = entries.length - 1; index > 0; index -= 1) {
      const swapIndex = random() % (index + 1);
      const current = entries[index];
      const swap = entries[swapIndex];
      assert.ok(current !== undefined && swap !== undefined);
      entries[index] = swap;
      entries[swapIndex] = current;
    }

    const archive = await openSafeArchive(syntheticZip(entries), { maxEntries: 64 });
    try {
      assert.equal(archive.inventory.length, 64);
      assert.deepEqual(archive.inventory, [...archive.inventory].sort());
      assert.equal(new Set(archive.inventory).size, 64);
    } finally {
      archive.close();
    }
  });

  test("rejects a nested archive by content signature", async () => {
    const nested = syntheticZip([{ name: "inside.txt", content: "synthetic" }]);
    await rejectsArchive(
      [{ name: "payload.bin", content: nested }],
      "NESTED_ARCHIVE",
    );
  });

  test("rejects XML DTD and entity declarations without exposing content", () => {
    for (const xml of [
      "<!DOCTYPE root><root />",
      "<!DOCTYPE root [<!ENTITY private-marker SYSTEM 'synthetic.dtd'>]><root>&private-marker;</root>",
    ]) {
      assert.throws(
        () => parseSafeXml(xml),
        (error: unknown) => {
          assert.ok(error instanceof ArchiveSafetyError);
          assert.equal(error.code, "PKG-ARCHIVE-001");
          assert.equal(error.reason, "UNSAFE_XML");
          assert.equal(error.message.includes("private-marker"), false);
          return true;
        },
      );
    }
  });
});
