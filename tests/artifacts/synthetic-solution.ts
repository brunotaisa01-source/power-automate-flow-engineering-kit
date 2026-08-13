interface ZipEntryInput {
  readonly name: string;
  readonly content: string;
}

interface SyntheticFlowInput {
  readonly id: string;
  readonly definition: unknown;
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

export function syntheticSolution(
  flowDefinition: unknown,
  flowId = "SyntheticFlow",
): Buffer {
  return syntheticSolutionWithFlows([{ id: flowId, definition: flowDefinition }]);
}

export function syntheticSolutionWithFlows(
  flows: readonly SyntheticFlowInput[],
): Buffer {
  if (flows.length === 0 || new Set(flows.map(({ id }) => id)).size !== flows.length) {
    throw new TypeError("Synthetic solution flows must be non-empty and unique.");
  }
  const workflows = flows.map(({ id, definition }) => ({
    id,
    definition,
    path: `Workflows/${id}.json`,
  }));
  return syntheticZip([
    {
      name: "[Content_Types].xml",
      content: "<Types><Default Extension='json' ContentType='application/json' /></Types>",
    },
    {
      name: "customizations.xml",
      content: [
        "<ImportExportXml><Workflows>",
        ...workflows.map(({ id, path }) => `<Workflow name='${id}' path='${path}' />`),
        "</Workflows></ImportExportXml>",
      ].join(""),
    },
    {
      name: "solution.xml",
      content: [
        "<ImportExportXml><SolutionManifest><RootComponents>",
        ...workflows.map(({ id }) => `<RootComponent type='29' schemaName='${id}' />`),
        "</RootComponents></SolutionManifest></ImportExportXml>",
      ].join(""),
    },
    ...workflows.map(({ path, definition }) => ({
      name: path,
      content: JSON.stringify(definition),
    })),
  ]);
}
