import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { inspectSolutionBytes } from "../../packages/package-adapters/src/solution-v1.ts";

interface ZipEntryInput {
  readonly name: string;
  readonly content: string;
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
    const content = Buffer.from(input.content, "utf8");
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

const contentTypes = "<Types><Default Extension='json' ContentType='application/json' /></Types>";
const solutionXml = [
  "<ImportExportXml><SolutionManifest><RootComponents>",
  "<RootComponent type='29' schemaName='SyntheticFlow' />",
  "</RootComponents></SolutionManifest></ImportExportXml>",
].join("");
const customizationsXml = [
  "<ImportExportXml><Workflows>",
  "<Workflow name='SyntheticFlow' path='Workflows/SyntheticFlow.json' />",
  "</Workflows></ImportExportXml>",
].join("");
const flowDefinition = JSON.stringify({
  properties: {
    connectionReferences: {
      synthetic_connection: { connectorId: "synthetic-connector" },
    },
    definition: {
      triggers: { Synthetic_trigger: { type: "Request" } },
      actions: { Synthetic_action: { type: "Compose", inputs: "synthetic" } },
    },
  },
});

function validEntries(): ZipEntryInput[] {
  return [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "customizations.xml", content: customizationsXml },
    { name: "solution.xml", content: solutionXml },
    { name: "Workflows/SyntheticFlow.json", content: flowDefinition },
  ];
}

describe("package adapter solution envelope", () => {
  test("accepts the exact metadata-derived inventory and normalizes its flow", async () => {
    const inspection = await inspectSolutionBytes(syntheticZip(validEntries()));

    assert.equal(inspection.profile, "power-platform-solution-v1");
    assert.equal(inspection.valid, true);
    assert.deepEqual(inspection.diagnostics, []);
    assert.deepEqual(inspection.inventory, [
      "Workflows/SyntheticFlow.json",
      "[Content_Types].xml",
      "customizations.xml",
      "solution.xml",
    ]);
    assert.deepEqual(inspection.expectedInventory, inspection.inventory);
    assert.equal(inspection.flows.length, 1);
    assert.equal(inspection.flows[0]?.id, "SyntheticFlow");
    assert.equal(inspection.flows[0]?.actionCount, 1);
    assert.deepEqual([...inspection.flows[0]!.connectionReferences], ["synthetic_connection"]);
  });

  test("reports a missing required root entry deterministically", async () => {
    const entries = validEntries().filter(({ name }) => name !== "solution.xml");
    const inspection = await inspectSolutionBytes(syntheticZip(entries));

    assert.deepEqual(inspection.diagnostics, [{
      code: "PKG-NATIVE-001",
      path: "synthetic-solution.zip#/inventory",
      message: "Solution inventory is missing required root entry 'solution.xml'.",
    }]);
  });

  test("reports an extra entry without echoing its name or content", async () => {
    const entries = [
      ...validEntries(),
      { name: "private-marker.txt", content: "private-marker" },
    ];
    const inspection = await inspectSolutionBytes(syntheticZip(entries));

    assert.deepEqual(inspection.diagnostics, [{
      code: "PKG-NATIVE-001",
      path: "synthetic-solution.zip#/inventory",
      message: "Solution inventory contains 1 unexpected entry.",
    }]);
    assert.equal(JSON.stringify(inspection.diagnostics).includes("private-marker"), false);
  });

  test("reports a required root entry placed below the archive root", async () => {
    const entries = validEntries().map((entry) => entry.name === "solution.xml"
      ? { ...entry, name: "Metadata/solution.xml" }
      : entry);
    const inspection = await inspectSolutionBytes(syntheticZip(entries));

    assert.deepEqual(inspection.diagnostics, [{
      code: "PKG-NATIVE-001",
      path: "synthetic-solution.zip#/inventory",
      message: "Required root entry 'solution.xml' is misplaced.",
    }]);
  });
});
