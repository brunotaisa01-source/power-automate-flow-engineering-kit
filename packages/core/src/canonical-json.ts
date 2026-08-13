export type ArrayPolicy = "ordered" | "set";

export interface CanonicalizeOptions {
  readonly arrayPolicies?: Readonly<Record<string, ArrayPolicy>>;
}

type JsonPrimitive = boolean | null | number | string;
type CanonicalValue = JsonPrimitive | CanonicalValue[] | { [key: string]: CanonicalValue };

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function childPointer(pointer: string, segment: string): string {
  return `${pointer}/${escapePointerSegment(segment)}`;
}

function wildcardPointer(pointer: string): string {
  return pointer.replace(/\/[0-9]+(?=\/|$)/g, "/*");
}

function arrayPolicy(pointer: string, options: CanonicalizeOptions): ArrayPolicy {
  return options.arrayPolicies?.[pointer]
    ?? options.arrayPolicies?.[wildcardPointer(pointer)]
    ?? "ordered";
}

function normalize(
  value: unknown,
  pointer: string,
  options: CanonicalizeOptions,
  ancestors: Set<object>,
): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Canonical JSON requires a finite number at '${pointer || "/"}'.`);
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value !== "object") {
    throw new TypeError(
      `Canonical JSON cannot represent ${typeof value} at '${pointer || "/"}'.`,
    );
  }

  if (ancestors.has(value)) {
    throw new TypeError(`Canonical JSON cannot represent a cycle at '${pointer || "/"}'.`);
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const normalized = value.map((item, index) =>
        normalize(item, childPointer(pointer, String(index)), options, ancestors)
      );
      if (arrayPolicy(pointer, options) === "set") {
        normalized.sort((left, right) =>
          compareText(JSON.stringify(left), JSON.stringify(right))
        );
      }
      return normalized;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(
        `Canonical JSON requires a plain object at '${pointer || "/"}'.`,
      );
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(
        `Canonical JSON cannot represent symbol keys at '${pointer || "/"}'.`,
      );
    }

    const result: { [key: string]: CanonicalValue } = {};
    for (const key of Object.keys(value).sort(compareText)) {
      result[key] = normalize(
        (value as Record<string, unknown>)[key],
        childPointer(pointer, key),
        options,
        ancestors,
      );
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalize(
  value: unknown,
  options: CanonicalizeOptions = {},
): string {
  return `${JSON.stringify(normalize(value, "", options, new Set()))}\n`;
}

export function canonicalBytes(
  value: unknown,
  options: CanonicalizeOptions = {},
): Uint8Array {
  return Buffer.from(canonicalize(value, options), "utf8");
}
