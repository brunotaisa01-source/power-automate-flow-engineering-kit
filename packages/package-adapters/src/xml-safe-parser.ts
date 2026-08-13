import { DOMParser, MIME_TYPE, type Element } from "@xmldom/xmldom";

import { ArchiveSafetyError } from "./archive-reader.ts";

export interface SafeXmlNode {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly SafeXmlNode[];
  readonly text: string;
}

const FORBIDDEN_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/i;
const NON_BUILTIN_ENTITY = /&(?!amp;|lt;|gt;|apos;|quot;|#\d+;|#x[0-9a-f]+;)[A-Za-z_:][\w:.-]*;/i;

function freezeElement(element: Element): SafeXmlNode {
  const attributes: Record<string, string> = {};
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes.item(index);
    if (attribute !== null) {
      attributes[attribute.name] = attribute.value;
    }
  }
  const children: SafeXmlNode[] = [];
  let text = "";
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes.item(index);
    if (child === null) {
      continue;
    }
    if (child.nodeType === 1) {
      children.push(freezeElement(child as Element));
    } else if (child.nodeType === 3 || child.nodeType === 4) {
      text += child.nodeValue ?? "";
    }
  }
  return Object.freeze({
    name: element.tagName,
    attributes: Object.freeze(attributes),
    children: Object.freeze(children),
    text,
  });
}

export function parseSafeXml(xml: string | Uint8Array): SafeXmlNode {
  let source: string;
  try {
    source = typeof xml === "string"
      ? xml
      : new TextDecoder("utf-8", { fatal: true }).decode(xml);
  } catch {
    throw new ArchiveSafetyError("UNSAFE_XML");
  }
  if (FORBIDDEN_DECLARATION.test(source) || NON_BUILTIN_ENTITY.test(source)) {
    throw new ArchiveSafetyError("UNSAFE_XML");
  }

  try {
    const document = new DOMParser({
      locator: false,
      onError: () => {
        throw new Error("XML parsing failed.");
      },
    }).parseFromString(source, MIME_TYPE.XML_APPLICATION);
    if (document.doctype !== null || document.documentElement === null) {
      throw new Error("XML parsing failed.");
    }
    for (let index = 0; index < document.childNodes.length; index += 1) {
      const child = document.childNodes.item(index);
      if (child?.nodeType === 1 && child !== document.documentElement) {
        throw new Error("XML parsing failed.");
      }
    }
    return freezeElement(document.documentElement);
  } catch {
    throw new ArchiveSafetyError("UNSAFE_XML");
  }
}

export function findXmlElements(root: SafeXmlNode, localName: string): SafeXmlNode[] {
  const matches: SafeXmlNode[] = [];
  const visit = (node: SafeXmlNode): void => {
    const actualLocalName = node.name.includes(":")
      ? node.name.slice(node.name.lastIndexOf(":") + 1)
      : node.name;
    if (actualLocalName === localName) {
      matches.push(node);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  visit(root);
  return matches;
}
