export interface ParsedWdlAssertion {
  readonly actionId: string;
  readonly field: string;
  readonly operator: "equals" | "not-equals" | "exists";
  readonly expected: unknown;
}

export interface ParsedWdlDataReference {
  readonly source: "trigger" | "action";
  readonly actionId?: string;
  readonly path: readonly (string | number)[];
}

export interface ParsedWdlExpression {
  readonly functions: readonly string[];
  readonly actionReferences: readonly string[];
  readonly readbackAssertions: readonly ParsedWdlAssertion[];
  readonly directDataReference?: ParsedWdlDataReference;
}

type WdlLiteral = string | number | boolean | null;

type WdlValue =
  | { readonly kind: "literal"; readonly value: WdlLiteral }
  | { readonly kind: "call"; readonly name: string; readonly arguments: readonly WdlValue[] }
  | { readonly kind: "access"; readonly target: WdlValue; readonly key: string | number };

export class WdlParseError extends Error {
  readonly code = "PA-WDL-001" as const;

  constructor() {
    super("Workflow expression is malformed or unsupported.");
    this.name = "WdlParseError";
  }
}

function uniqueInOrder(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

class Parser {
  private index = 1;
  private readonly functions: string[] = [];
  private readonly actionReferences: string[] = [];
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  parse(): ParsedWdlExpression {
    if (!this.source.startsWith("@")) {
      throw new WdlParseError();
    }
    this.skipSpace();
    const root = this.parseValue();
    this.skipSpace();
    if (this.index !== this.source.length || this.functions.length === 0) {
      throw new WdlParseError();
    }
    const dataReference = directDataReference(root);
    return Object.freeze({
      functions: Object.freeze(uniqueInOrder(this.functions)),
      actionReferences: Object.freeze(uniqueInOrder(this.actionReferences)),
      readbackAssertions: Object.freeze(readbackAssertions(root)),
      ...(dataReference === undefined ? {} : { directDataReference: dataReference }),
    });
  }

  private parseValue(): WdlValue {
    this.skipSpace();
    const character = this.source[this.index];
    let value: WdlValue;
    if (character === "'") {
      value = { kind: "literal", value: this.parseString() };
    } else if (character !== undefined && /[-0-9]/.test(character)) {
      value = { kind: "literal", value: this.parseNumber() };
    } else if (character !== undefined && /[A-Za-z_]/.test(character)) {
      value = this.parseIdentifierValue();
    } else {
      throw new WdlParseError();
    }
    return this.parsePostfix(value);
  }

  private parseIdentifierValue(): WdlValue {
    const name = this.parseIdentifier();
    this.skipSpace();
    if (this.source[this.index] !== "(") {
      const literal = name.toLowerCase();
      if (!["false", "null", "true"].includes(literal)) {
        throw new WdlParseError();
      }
      return {
        kind: "literal",
        value: literal === "null" ? null : literal === "true",
      };
    }

    this.functions.push(name);
    this.index += 1;
    this.skipSpace();
    const argumentsFound: WdlValue[] = [];
    if (this.source[this.index] !== ")") {
      while (true) {
        argumentsFound.push(this.parseValue());
        this.skipSpace();
        if (this.source[this.index] === ")") {
          break;
        }
        if (this.source[this.index] !== ",") {
          throw new WdlParseError();
        }
        this.index += 1;
        this.skipSpace();
        if (this.source[this.index] === ")" || this.source[this.index] === ",") {
          throw new WdlParseError();
        }
      }
    }
    if (this.source[this.index] !== ")") {
      throw new WdlParseError();
    }
    this.index += 1;
    if (
      ["action", "actions", "body", "outputs", "result"].includes(name.toLowerCase())
      && argumentsFound.length > 0
    ) {
      const reference = argumentsFound[0];
      if (
        reference?.kind === "literal"
        && typeof reference.value === "string"
        && reference.value.length > 0
      ) {
        this.actionReferences.push(reference.value);
      }
    }
    return Object.freeze({
      kind: "call",
      name,
      arguments: Object.freeze(argumentsFound),
    });
  }

  private parsePostfix(initial: WdlValue): WdlValue {
    let value = initial;
    while (true) {
      this.skipSpace();
      if (this.source[this.index] === "?") {
        this.index += 1;
      }
      if (this.source[this.index] !== "[") {
        return value;
      }
      this.index += 1;
      this.skipSpace();
      let key: string | number;
      if (this.source[this.index] === "'") {
        key = this.parseString();
      } else {
        key = this.parseNumber();
      }
      this.skipSpace();
      if (this.source[this.index] !== "]") {
        throw new WdlParseError();
      }
      this.index += 1;
      value = Object.freeze({ kind: "access", target: value, key });
    }
  }

  private parseIdentifier(): string {
    const start = this.index;
    this.index += 1;
    while (/[A-Za-z0-9_.]/.test(this.source[this.index] ?? "")) {
      this.index += 1;
    }
    return this.source.slice(start, this.index);
  }

  private parseString(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      if (this.source[this.index] !== "'") {
        this.index += 1;
        continue;
      }
      if (this.source[this.index + 1] === "'") {
        this.index += 2;
        continue;
      }
      this.index += 1;
      return this.source.slice(start + 1, this.index - 1).replaceAll("''", "'");
    }
    throw new WdlParseError();
  }

  private parseNumber(): number {
    const remaining = this.source.slice(this.index);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?/.exec(remaining);
    if (match === null) {
      throw new WdlParseError();
    }
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      throw new WdlParseError();
    }
    return value;
  }

  private skipSpace(): void {
    while (/\s/.test(this.source[this.index] ?? "")) {
      this.index += 1;
    }
  }
}

interface ReadbackReference {
  readonly actionId: string;
  readonly field: string;
}

function directDataReference(value: WdlValue): ParsedWdlDataReference | undefined {
  const path: Array<string | number> = [];
  let current = value;
  while (current.kind === "access") {
    path.unshift(current.key);
    current = current.target;
  }
  if (current.kind !== "call" || path.length === 0) {
    return undefined;
  }

  const functionName = current.name.toLowerCase();
  if (
    ["triggerbody", "triggeroutputs"].includes(functionName)
    && current.arguments.length === 0
  ) {
    const normalizedPath = functionName === "triggeroutputs"
        && path[0] === "body"
      ? path.slice(1)
      : path;
    return normalizedPath.length === 0
      ? undefined
      : Object.freeze({
          source: "trigger",
          path: Object.freeze(normalizedPath),
        });
  }

  if (
    ["action", "actions", "body", "outputs", "result"].includes(functionName)
    && current.arguments.length === 1
  ) {
    const action = current.arguments[0];
    if (action?.kind !== "literal" || typeof action.value !== "string") {
      return undefined;
    }
    const normalizedPath = ["action", "actions", "outputs", "result"].includes(functionName)
        && path[0] === "body"
      ? path.slice(1)
      : path;
    return normalizedPath.length === 0
      ? undefined
      : Object.freeze({
          source: "action",
          actionId: action.value,
          path: Object.freeze(normalizedPath),
        });
  }

  return undefined;
}

function readbackReference(value: WdlValue): ReadbackReference | undefined {
  const keys: Array<string | number> = [];
  let current = value;
  while (current.kind === "access") {
    keys.unshift(current.key);
    current = current.target;
  }
  if (
    current.kind !== "call"
    || !["action", "actions", "body", "outputs", "result"].includes(
      current.name.toLowerCase(),
    )
  ) {
    return undefined;
  }
  const reference = current.arguments[0];
  if (reference?.kind !== "literal" || typeof reference.value !== "string") {
    return undefined;
  }
  const stringKeys = keys.filter((key): key is string => typeof key === "string");
  const field = stringKeys.at(-1);
  if (field === undefined || field.toLowerCase() === "body") {
    return undefined;
  }
  return { actionId: reference.value, field };
}

function literal(value: WdlValue): WdlLiteral | undefined {
  return value.kind === "literal" ? value.value : undefined;
}

function equalityAssertion(
  value: WdlValue,
  operator: "equals" | "not-equals",
): ParsedWdlAssertion | undefined {
  if (
    value.kind !== "call"
    || value.name.toLowerCase() !== "equals"
    || value.arguments.length !== 2
  ) {
    return undefined;
  }
  const left = value.arguments[0];
  const right = value.arguments[1];
  if (left === undefined || right === undefined) {
    return undefined;
  }
  const leftReference = readbackReference(left);
  const rightReference = readbackReference(right);
  const reference = leftReference ?? rightReference;
  const expected = leftReference === undefined ? literal(left) : literal(right);
  if (reference === undefined || expected === undefined) {
    return undefined;
  }
  return Object.freeze({ ...reference, operator, expected });
}

function directAssertions(value: WdlValue): ParsedWdlAssertion[] {
  if (value.kind !== "call") {
    return [];
  }
  const functionName = value.name.toLowerCase();
  if (functionName === "and") {
    return value.arguments.flatMap(directAssertions);
  }
  if (functionName === "equals") {
    const assertion = equalityAssertion(value, "equals");
    return assertion === undefined ? [] : [assertion];
  }
  if (functionName === "not" && value.arguments.length === 1) {
    const argument = value.arguments[0];
    if (argument === undefined) {
      return [];
    }
    const unequal = equalityAssertion(argument, "not-equals");
    if (unequal !== undefined) {
      return [unequal];
    }
    if (
      argument.kind === "call"
      && argument.name.toLowerCase() === "empty"
      && argument.arguments.length === 1
    ) {
      const reference = argument.arguments[0] === undefined
        ? undefined
        : readbackReference(argument.arguments[0]);
      return reference === undefined
        ? []
        : [Object.freeze({ ...reference, operator: "exists", expected: true })];
    }
  }
  return [];
}

function readbackAssertions(value: WdlValue): ParsedWdlAssertion[] {
  return directAssertions(value).sort((left, right) =>
    left.actionId.localeCompare(right.actionId, "en")
    || left.field.localeCompare(right.field, "en")
    || left.operator.localeCompare(right.operator, "en")
    || JSON.stringify(left.expected).localeCompare(JSON.stringify(right.expected), "en")
  );
}

export function parseWdlExpression(expression: string): ParsedWdlExpression {
  return new Parser(expression).parse();
}
