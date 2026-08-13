import type { CommandReport } from "../parse-args.ts";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
}

export function formatJsonReport(report: CommandReport): string {
  return `${JSON.stringify(sortKeys(report), null, 2)}\n`;
}
