function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeRepositoryPath(input: string): string {
  if (input.length === 0) {
    throw new Error("Repository path must not be empty.");
  }
  if (/^[A-Za-z]:/.test(input) || /^[\\/]/.test(input)) {
    throw new Error(`Repository path must be relative: '${input}'.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(input)) {
    throw new Error("Repository path contains a control character.");
  }

  const segments = input.replaceAll("\\", "/").split("/");
  if (segments.includes("..")) {
    throw new Error(`Repository path traversal is forbidden: '${input}'.`);
  }

  const normalized = segments.filter((segment) => segment !== "" && segment !== ".").join("/");
  if (normalized.length === 0) {
    throw new Error("Repository path must identify a repository entry.");
  }
  return normalized;
}

export function assertNoPathCaseCollisions(paths: readonly string[]): readonly string[] {
  const normalized = paths.map(normalizeRepositoryPath).sort(compareText);
  const pathsByFoldedName = new Map<string, string>();

  for (const path of normalized) {
    const folded = path.toLowerCase();
    const existing = pathsByFoldedName.get(folded);
    if (existing !== undefined && existing !== path) {
      throw new Error(`Repository path case collision: '${existing}' and '${path}'.`);
    }
    pathsByFoldedName.set(folded, path);
  }

  return Object.freeze(normalized);
}
