import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { Ajv2020 } from "ajv/dist/2020.js";
import { promisify } from "node:util";
import { lstat, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";


const execFileAsync = promisify(execFile);

export interface LearningDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly severity: "error" | "info";
}

export interface LearningAuditOptions {
  readonly executeBindings?: boolean;
}

export interface LearningAuditResult {
  readonly registryId?: string;
  readonly revision?: number;
  readonly digest?: string;
  readonly approvedLessons?: readonly Record<string, unknown>[];
  readonly diagnostics: readonly LearningDiagnostic[];
}

const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const WORK_PACKAGE = /^WP-[0-9]+$/;
const PRIVATE_MARKER = new RegExp([
  "OneDrive\\s+-",
  "private-project-marker",
  ["-".repeat(5), "BEGIN"].join(""),
  ["Bear", "er"].join("\\s+[A-Za-z0-9._~-]{20,}"),
  "C:\\\\Users\\[^\\s]+",
].join("|"), "i");

function repositoryPath(root: string, candidate: string): string | undefined {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  const value = relative(resolve(root), absolute).replaceAll("\\", "/");
  return value === "" || value === ".." || value.startsWith("../") || isAbsolute(value) ? undefined : value;
}

async function existingRepositoryPath(root: string, candidate: string): Promise<string | undefined> {
  try {
    const realRoot = await realpath(root);
    const realCandidate = await realpath(resolve(root, candidate));
    const value = relative(realRoot, realCandidate).replaceAll("\\", "/");
    return value === "" || value === ".." || value.startsWith("../") || isAbsolute(value) ? undefined : value;
  } catch {
    return undefined;
  }
}

async function writableRepositoryPath(root: string, candidate: string): Promise<string | undefined> {
  const normalized = repositoryPath(root, candidate);
  if (normalized === undefined) return undefined;
  const absolute = resolve(root, normalized);
  try {
    if ((await lstat(absolute)).isSymbolicLink()) return undefined;
  } catch {
    // A new target is allowed only when its real parent remains inside the root.
  }
  try {
    const realRoot = await realpath(root);
    const realParent = await realpath(dirname(absolute));
    const value = relative(realRoot, realParent).replaceAll("\\", "/");
    return value === "" || value === ".." || value.startsWith("../") || isAbsolute(value) ? undefined : normalized;
  } catch {
    return undefined;
  }
}

async function writeContainedFile(root: string, candidate: string, content: string): Promise<void> {
  const first = await writableRepositoryPath(root, candidate);
  if (first === undefined) throw new Error("The write path is not contained by the repository.");
  const immediate = await writableRepositoryPath(root, first);
  if (immediate !== first) throw new Error("The write path changed during containment revalidation.");
  await writeFile(resolve(root, immediate), content, "utf8");
  if (await existingRepositoryPath(root, immediate) === undefined) throw new Error("The write path escaped the repository after the write.");
}

function add(diagnostics: LearningDiagnostic[], code: string, path: string, message: string, severity: LearningDiagnostic["severity"] = "error"): void {
  diagnostics.push({ code, path, message, severity });
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function reviewDecisionApproved(text: string): boolean {
  return text.split(/\r?\n/).some((line) => line.trim() === "Decision: APPROVED");
}

function reviewRoleMatches(text: string, role: string): boolean {
  return text.split(/\r?\n/).some((line) => line.trim() === "Reviewer role: " + role);
}

function reviewRecordValid(text: string, role: string): boolean {
  return reviewDecisionApproved(text)
    && reviewRoleMatches(text, role)
    && /(?:^|##\s+|Review evidence:).*(RED|evidence)/im.test(text)
    && /RED.*GREEN.*positive-control/is.test(text)
    && /local.*synthetic/is.test(text);
}

function escapeRegex(value: string): string {
  const metacharacters = ".^$*+?()[]{}|\\";
  return [...value].map((character) => metacharacters.includes(character) ? "\\" + character : character).join("");
}

function privacyDiagnostics(text: string, path: string, diagnostics: LearningDiagnostic[]): void {
  const variants = [text];
  let decoded = text;
  for (let round = 0; round < 2 && /%[0-9a-f]{2}/i.test(decoded); round += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      variants.push(next);
      decoded = next;
    } catch {
      add(diagnostics, "SELF_LEARNING_ENCODED_INVALID", path, "Percent-encoded lesson content must decode cleanly before privacy classification.");
      break;
    }
  }
  const inspected = variants.join("\n");
  if (variants.some((variant) => PRIVATE_MARKER.test(variant))) add(diagnostics, "SELF_LEARNING_PRIVATE_DATA", path, "The lesson contains a private marker or credential-shaped value.");
  const credentialKeys = [["pass", "word"].join(""), ["client", "_", "secret"].join(""), ["access", "_", "token"].join(""), ["refresh", "_", "token"].join(""), ["api", "_", "key"].join("")];
  if (credentialKeys.some((key) => new RegExp(key + "\\s*[:=]\\s*[^\\s,}]+", "i").test(inspected))) add(diagnostics, "SELF_LEARNING_CREDENTIAL_SHAPE", path, "Lessons must not contain credential-shaped assignments.");
  const jwtPrefix = ["ey", "J"].join("");
  if (new RegExp(jwtPrefix + "[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}").test(inspected)) add(diagnostics, "SELF_LEARNING_TOKEN_SHAPE", path, "Lessons must not contain JWT-shaped token values.");
  const nonSynthetic = inspected.replaceAll("example.test", "");
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(nonSynthetic)) add(diagnostics, "SELF_LEARNING_PRIVATE_EMAIL", path, "Lessons may contain only reserved synthetic email domains.");
  if (/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.test(inspected)) add(diagnostics, "SELF_LEARNING_PRIVATE_ID", path, "Lessons must not contain GUID-shaped identifiers.");
  const backslashPair = String.fromCharCode(92) + String.fromCharCode(92);
  const driveMatch = /[A-Za-z]:/.exec(inspected);
  const hasDrivePath = driveMatch !== null && ["/", String.fromCharCode(92)].includes(inspected.charAt(driveMatch.index + 2));
  const absoluteMarkers = ["/Users/", "/home/", "/private/", "/var/", "/tmp/", "/mnt/"];
  if (hasDrivePath || absoluteMarkers.some((marker) => inspected.includes(marker)) || inspected.includes(backslashPair)) add(diagnostics, "SELF_LEARNING_ABSOLUTE_PATH", path, "Lessons must use repository-relative paths only.");
  const urls = inspected.split(/\s+/).filter((token) => token.startsWith("http://") || token.startsWith("https://"));
  if (urls.some((url) => { try { return new URL(url).hostname !== "example.test"; } catch { return true; } })) add(diagnostics, "SELF_LEARNING_PRIVATE_URL", path, "Lessons may contain only reserved synthetic URLs.");
}

async function validateLessonSchema(value: unknown, diagnostics: LearningDiagnostic[]): Promise<void> {
  try {
    const rootSchema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../../contracts/self-improvement.schema.json"), "utf8")) as Record<string, unknown>;
    const lessonSchema = { $schema: rootSchema.$schema, $defs: rootSchema.$defs, $ref: "#/$defs/lesson" };
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    const validate = ajv.compile(lessonSchema as object);
    if (!validate(value)) {
      for (const error of validate.errors ?? []) add(diagnostics, "SELF_LEARNING_SCHEMA_INVALID", error.instancePath || "/lesson", "The self-improvement lesson schema " + (error.message ?? "validation failed") + ".");
    }
  } catch {
    add(diagnostics, "SELF_LEARNING_SCHEMA_UNAVAILABLE", "knowledge/self-improvement/candidates", "The self-improvement lesson schema could not be loaded or compiled.");
  }
}

async function validateRegistrySchema(value: unknown, diagnostics: LearningDiagnostic[]): Promise<void> {
  try {
    const schema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../../contracts/self-improvement.schema.json"), "utf8")) as unknown;
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    const validate = ajv.compile(schema as object);
    if (!validate(value)) {
      for (const error of validate.errors ?? []) {
        add(diagnostics, "SELF_LEARNING_SCHEMA_INVALID", error.instancePath || "/", "The self-improvement registry schema " + (error.message ?? "validation failed") + ".");
      }
    }
  } catch {
    add(diagnostics, "SELF_LEARNING_SCHEMA_UNAVAILABLE", "knowledge/self-improvement/registry.json", "The self-improvement schema could not be loaded or compiled.");
  }
}

async function inspectBinding(root: string, value: unknown, path: string, diagnostics: LearningDiagnostic[], seen: Set<string>, options: LearningAuditOptions, executedPaths: Set<string>): Promise<void> {
  const binding = objectValue(value);
  if (binding === undefined || !nonEmptyString(binding.path) || !nonEmptyString(binding.testName) || binding.runner !== "node-test" || binding.expectedExitCode !== 0) {
    add(diagnostics, "SELF_LEARNING_BINDING_INVALID", path, "Learning evidence must bind a repository-relative path, test name, node-test runner, and expected exit code 0.");
    return;
  }
  const normalized = repositoryPath(root, resolve(root, binding.path));
  if (normalized !== binding.path || normalized === undefined) {
    add(diagnostics, "SELF_LEARNING_PATH_INVALID", path + "/path", "Learning evidence paths must remain inside the repository.");
    return;
  }
  const safeBinding = await existingRepositoryPath(root, binding.path);
  if (safeBinding === undefined) {
    add(diagnostics, "SELF_LEARNING_SYMLINK_ESCAPE", path + "/path", "Learning evidence must resolve through a realpath contained by the repository.");
    return;
  }
  const key = binding.path + "#" + binding.testName;
  if (seen.has(key)) add(diagnostics, "SELF_LEARNING_CONTROLS_NOT_INDEPENDENT", path, "RED, GREEN, and positive-control bindings must be distinct.");
  seen.add(key);
  try {
    const text = await readFile(resolve(root, safeBinding), "utf8");
    const namedTest = new RegExp("(?:test|it)\\s*\\(\\s*[\"\'`]" + escapeRegex(binding.testName) + "[\"\'`]\\s*[,)]");
    if (!namedTest.test(text)) add(diagnostics, "SELF_LEARNING_TEST_NOT_FOUND", path + "/testName", "The bound named node-test is not present in the bound repository file.");
    if (options.executeBindings === true && !executedPaths.has(key)) {
      executedPaths.add(key);
      try {
        await execFileAsync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", escapeRegex(binding.testName), resolve(root, safeBinding)], { cwd: root, timeout: 120000, windowsHide: true });
      } catch {
        add(diagnostics, "SELF_LEARNING_TEST_EXECUTION_FAILED", path, "A bound node-test did not complete with expected exit code 0.");
      }
    }
  } catch {
    add(diagnostics, "SELF_LEARNING_TEST_FILE_MISSING", path + "/path", "A bound learning test file does not exist.");
  }
}

function lifecycleHistoryValid(history: unknown, current: unknown): boolean {
  if (!Array.isArray(history) || history.length === 0) return false;
  let previous: string | undefined;
  const records = new Set<string>();
  for (const entry of history) {
    const value = objectValue(entry);
    const status = value?.status;
    const recordPath = value?.recordPath;
    if (typeof status !== "string" || !nonEmptyString(recordPath) || records.has(recordPath)) return false;
    records.add(recordPath);
    if (previous === undefined) {
      if (status !== "CANDIDATE") return false;
    } else if (!allowedLearningTransition(previous, status)) {
      return false;
    }
    previous = status;
  }
  return previous === current;
}

async function inspectLesson(root: string, lesson: unknown, index: number, ids: Set<string>, diagnostics: LearningDiagnostic[], options: LearningAuditOptions, executedPaths: Set<string>): Promise<void> {
  const path = "/lessons/" + index;
  const value = objectValue(lesson);
  if (value === undefined) {
    add(diagnostics, "SELF_LEARNING_LESSON_INVALID", path, "Every lesson must be an object.");
    return;
  }
  const id = value.id;
  if (!nonEmptyString(id) || !IDENTIFIER.test(id) || ids.has(id)) {
    add(diagnostics, "SELF_LEARNING_ID_INVALID", path + "/id", "Lesson IDs must be unique lowercase kebab-case identifiers.");
  } else {
    ids.add(id);
  }
  if (value.status !== "CANDIDATE" && value.status !== "BLOCKED" && value.status !== "APPROVED" && value.status !== "RETIRED") add(diagnostics, "SELF_LEARNING_STATUS_INVALID", path + "/status", "Learning status must be CANDIDATE, BLOCKED, APPROVED, or RETIRED.");
  const lifecycle = objectValue(value.lifecycle);
  const history = lifecycle?.history;
  if (lifecycle === undefined || lifecycle.current !== value.status || !lifecycleHistoryValid(history, value.status)) {
    add(diagnostics, "SELF_LEARNING_LIFECYCLE_INVALID", path + "/lifecycle", "Lifecycle current state and immutable history must match the lesson status.");
  }
  if (value.privacy !== "synthetic-public") add(diagnostics, "SELF_LEARNING_PRIVACY_INVALID", path + "/privacy", "Global lessons must be synthetic-public.");
  const provenance = objectValue(value.provenance);
  if (provenance === undefined || !nonEmptyString(provenance.workPackage) || !WORK_PACKAGE.test(provenance.workPackage)) {
    add(diagnostics, "SELF_LEARNING_PROVENANCE_INVALID", path + "/provenance", "A lesson must bind a work package such as WP-17.");
  }
  const review = objectValue(value.review);
  const needsApprovedReview = value.status === "APPROVED" || value.status === "RETIRED";
  if (needsApprovedReview && review?.decision !== "APPROVED") add(diagnostics, "SELF_LEARNING_REVIEW_NOT_APPROVED", path + "/review/decision", "An unapproved review cannot teach future AIs.");
  if (needsApprovedReview && (!nonEmptyString(review?.reviewerRole) || !/^independent-[a-z0-9-]+$/.test(review.reviewerRole))) add(diagnostics, "SELF_LEARNING_REVIEWER_INVALID", path + "/review/reviewerRole", "An approved lesson requires a structured independent reviewer role.");
  if (objectValue(value.provenance)?.recordPath === review?.recordPath) add(diagnostics, "SELF_LEARNING_REVIEW_REUSED", path + "/review/recordPath", "The independent review record must differ from the provenance/source record.");
  privacyDiagnostics(JSON.stringify(value), path, diagnostics);
  const seen = new Set<string>();
  const red = objectValue(value.red);
  const green = objectValue(value.green);
  const positive = objectValue(value.positiveControl);
  if (nonEmptyString(red?.path) && nonEmptyString(green?.path) && nonEmptyString(positive?.path) && (positive.path === red.path || positive.path === green.path)) {
    add(diagnostics, "SELF_LEARNING_CONTROLS_NOT_INDEPENDENT", path + "/positiveControl/path", "The positive control must use a structurally separate repository file.");
  }
  await inspectBinding(root, value.red, path + "/red", diagnostics, seen, options, executedPaths);
  await inspectBinding(root, value.green, path + "/green", diagnostics, seen, options, executedPaths);
  await inspectBinding(root, value.positiveControl, path + "/positiveControl", diagnostics, seen, options, executedPaths);
  for (const candidate of [review?.recordPath, provenance?.recordPath]) {
    if (!nonEmptyString(candidate)) {
      add(diagnostics, "SELF_LEARNING_RECORD_INVALID", path, "A source and independent review record are required.");
      continue;
    }
    const normalized = repositoryPath(root, resolve(root, candidate));
    if (normalized !== candidate || normalized === undefined) {
      add(diagnostics, "SELF_LEARNING_PATH_INVALID", path, "Learning record paths must remain inside the repository.");
      continue;
    }
    const safeRecord = await existingRepositoryPath(root, candidate);
    if (safeRecord === undefined) {
      add(diagnostics, "SELF_LEARNING_SYMLINK_ESCAPE", path, "Learning records must resolve through a realpath contained by the repository.");
      continue;
    }
    try {
      const text = await readFile(resolve(root, safeRecord), "utf8");
      if (needsApprovedReview && candidate === review?.recordPath) {
        if (!nonEmptyString(review?.reviewerRole) || !reviewRecordValid(text, review.reviewerRole)) add(diagnostics, "SELF_LEARNING_REVIEW_INVALID", path + "/review/recordPath", "The approval record must contain structured decision, role, RED/GREEN/positive-control evidence, and local synthetic scope.");
      }
    } catch {
      add(diagnostics, "SELF_LEARNING_RECORD_MISSING", path, "A bound learning record does not exist.");
    }
  }
}

async function inspectCandidates(root: string, diagnostics: LearningDiagnostic[], options: LearningAuditOptions, executedPaths: Set<string>): Promise<void> {
  const directory = resolve(root, "knowledge/self-improvement/candidates");
  let names: string[];
  try {
    if (!(await stat(directory)).isDirectory()) return;
    const safeDirectory = await existingRepositoryPath(root, "knowledge/self-improvement/candidates");
    if (safeDirectory === undefined) {
      add(diagnostics, "SELF_LEARNING_SYMLINK_ESCAPE", "knowledge/self-improvement/candidates", "Candidate storage must resolve through a realpath contained by the repository.");
      return;
    }
    names = await readdir(resolve(root, safeDirectory));
  } catch {
    return;
  }
  for (const name of names.filter((candidate) => candidate.endsWith(".json")).sort()) {
    const path = "knowledge/self-improvement/candidates/" + name;
    try {
      const safeFile = await existingRepositoryPath(root, path);
      if (safeFile === undefined) {
        add(diagnostics, "SELF_LEARNING_SYMLINK_ESCAPE", path, "Candidate files must resolve through a realpath contained by the repository.");
        continue;
      }
      const text = await readFile(resolve(root, safeFile), "utf8");
      privacyDiagnostics(text, path, diagnostics);
      const value = objectValue(JSON.parse(text));
      if (value !== undefined) {
        await validateLessonSchema(value, diagnostics);
        await inspectLesson(root, value, 0, new Set<string>(), diagnostics, options, executedPaths);
      }
      if (value?.status !== "APPROVED") add(diagnostics, "SELF_LEARNING_CANDIDATE_OPEN", path, "An unresolved learning candidate blocks promotion until its evidence and independent review pass.");
    } catch {
      add(diagnostics, "SELF_LEARNING_CANDIDATE_INVALID", path, "A learning candidate is not valid JSON.");
    }
  }
}

export async function auditLearningRegistry(root: string, registryPath: string, options: LearningAuditOptions = {}): Promise<LearningAuditResult> {
  const diagnostics: LearningDiagnostic[] = [];
  const repositoryRoot = resolve(root);
  const normalizedRegistry = repositoryPath(repositoryRoot, registryPath);
  if (normalizedRegistry !== "knowledge/self-improvement/registry.json") {
    add(diagnostics, "SELF_LEARNING_REGISTRY_PATH_INVALID", "<input>", "The global registry must be knowledge/self-improvement/registry.json inside the repository.");
    return { diagnostics };
  }
  const safeRegistry = await existingRepositoryPath(repositoryRoot, normalizedRegistry);
  if (safeRegistry === undefined) {
    add(diagnostics, "SELF_LEARNING_SYMLINK_ESCAPE", normalizedRegistry, "The global registry must resolve through a realpath contained by the repository.");
    return { diagnostics };
  }
  let value: unknown;
  let registryText: string;
  try {
    registryText = await readFile(resolve(repositoryRoot, safeRegistry), "utf8");
    value = JSON.parse(registryText) as unknown;
  } catch {
    add(diagnostics, "SELF_LEARNING_REGISTRY_UNREADABLE", normalizedRegistry, "The global learning registry could not be read as JSON.");
    return { diagnostics };
  }
  await validateRegistrySchema(value, diagnostics);
  const registry = objectValue(value);
  if (registry === undefined) {
    add(diagnostics, "SELF_LEARNING_REGISTRY_INVALID", normalizedRegistry, "The global learning registry must be an object.");
    return { diagnostics };
  }
  if (registry.schemaVersion !== "1.0" || registry.registryId !== "sharepoint-flow-engineering-kit-global" || typeof registry.revision !== "number" || !Number.isSafeInteger(registry.revision) || registry.revision < 1) {
    add(diagnostics, "SELF_LEARNING_REGISTRY_INVALID", normalizedRegistry, "The global registry identity or revision is invalid.");
  }
  const executedPaths = new Set<string>();
  const lessons = Array.isArray(registry.lessons) ? registry.lessons : undefined;
  if (lessons === undefined) {
    add(diagnostics, "SELF_LEARNING_REGISTRY_INVALID", normalizedRegistry + "/lessons", "The global registry must contain a lessons array.");
  } else {
    const ids = new Set<string>();
    await Promise.all(lessons.map((lesson, index) => inspectLesson(repositoryRoot, lesson, index, ids, diagnostics, options, executedPaths)));
  }
  privacyDiagnostics(JSON.stringify(registry), normalizedRegistry, diagnostics);
  let registryDigest: string | undefined;
  try {
    const safeDigest = await existingRepositoryPath(repositoryRoot, "knowledge/self-improvement/registry.sha256");
    if (safeDigest === undefined) throw new Error("digest path escape");
    const expected = (await readFile(resolve(repositoryRoot, safeDigest), "utf8")).trim();
    const actual = createHash("sha256").update(registryText, "utf8").digest("hex");
    if (!/^[a-f0-9]{64}$/.test(expected) || expected !== actual) {
      add(diagnostics, "SELF_LEARNING_DIGEST_MISMATCH", "knowledge/self-improvement/registry.sha256", "The registry sidecar digest does not match the exact registry bytes.");
    } else {
      registryDigest = actual;
    }
  } catch {
    add(diagnostics, "SELF_LEARNING_DIGEST_MISSING", "knowledge/self-improvement/registry.sha256", "The global registry requires an exact SHA-256 sidecar.");
  }
  await inspectCandidates(repositoryRoot, diagnostics, options, executedPaths);
  return {
    ...(typeof registry.registryId === "string" ? { registryId: registry.registryId } : {}),
    ...(typeof registry.revision === "number" ? { revision: registry.revision } : {}),
    ...(registryDigest === undefined ? {} : { digest: registryDigest }),
    ...(Array.isArray(registry.lessons) ? { approvedLessons: registry.lessons.filter((lesson): lesson is Record<string, unknown> => objectValue(lesson)?.status === "APPROVED") } : {}),
    diagnostics: diagnostics.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path)),
  };
}

export async function consumeApprovedLessons(root: string, registryPath: string, scopes: readonly string[] = []): Promise<readonly Record<string, unknown>[]> {
  const result = await auditLearningRegistry(root, registryPath, { executeBindings: true });
  if (result.diagnostics.length > 0 || result.approvedLessons === undefined) {
    throw new Error("The global self-improvement registry is not consumable.");
  }
  if (scopes.length === 0) return result.approvedLessons;
  return result.approvedLessons.filter((lesson) => {
    const scope = Array.isArray(lesson.scope) ? lesson.scope : [];
    return scopes.some((candidate) => scope.includes(candidate));
  });
}

export function allowedLearningTransition(from: string, to: string): boolean {
  return (from === "CANDIDATE" && (to === "BLOCKED" || to === "APPROVED"))
    || (from === "BLOCKED" && (to === "CANDIDATE" || to === "APPROVED"))
    || (from === "APPROVED" && to === "RETIRED");
}

export async function captureLearningCandidate(root: string, candidatePath: string, candidate: Record<string, unknown>): Promise<void> {
  const repositoryRoot = resolve(root);
  const normalized = repositoryPath(repositoryRoot, candidatePath);
  if (normalized === undefined || !normalized.startsWith("knowledge/self-improvement/candidates/") || !normalized.endsWith(".json")) {
    throw new Error("Learning candidate path must be a repository-relative candidates JSON path.");
  }
  const writableCandidate = await writableRepositoryPath(repositoryRoot, normalized);
  if (writableCandidate === undefined) throw new Error("Learning candidate path must not escape the repository through a symlink.");
  if (candidate.status !== "CANDIDATE" && candidate.status !== "BLOCKED") throw new Error("A captured lesson must be CANDIDATE or BLOCKED.");
  const capturePrivacyDiagnostics: LearningDiagnostic[] = [];
  privacyDiagnostics(JSON.stringify(candidate), normalized, capturePrivacyDiagnostics);
  if (candidate.privacy !== "synthetic-public" || capturePrivacyDiagnostics.length > 0) throw new Error("Learning candidate failed the synthetic privacy gate.");
  const candidateDiagnostics: LearningDiagnostic[] = [];
  await validateLessonSchema(candidate, candidateDiagnostics);
  await inspectLesson(repositoryRoot, candidate, 0, new Set<string>(), candidateDiagnostics, { executeBindings: true }, new Set<string>());
  if (candidateDiagnostics.length > 0) throw new Error("Candidate RED/GREEN/positive-control evidence is not executable and valid.");
  await mkdir(resolve(repositoryRoot, dirname(writableCandidate)), { recursive: true });
  await writeContainedFile(repositoryRoot, writableCandidate, JSON.stringify(candidate, null, 2) + "\n");
}

export async function promoteLearningCandidate(root: string, candidatePath: string, reviewPath: string, reviewerRole: string): Promise<void> {
  const repositoryRoot = resolve(root);
  const normalizedCandidate = repositoryPath(repositoryRoot, candidatePath);
  if (normalizedCandidate === undefined || !normalizedCandidate.startsWith("knowledge/self-improvement/candidates/") || !normalizedCandidate.endsWith(".json")) throw new Error("Learning candidate path is outside the approved local scope.");
  const safeCandidate = await existingRepositoryPath(repositoryRoot, normalizedCandidate);
  if (safeCandidate === undefined) throw new Error("Learning candidate path must not escape the repository through a symlink.");
  const writableCandidate = await writableRepositoryPath(repositoryRoot, normalizedCandidate);
  if (writableCandidate === undefined) throw new Error("Learning candidate path must be a non-symlink repository path.");
  const candidate = objectValue(JSON.parse(await readFile(resolve(repositoryRoot, safeCandidate), "utf8")));
  if (candidate === undefined || (candidate.status !== "CANDIDATE" && candidate.status !== "BLOCKED") || !allowedLearningTransition(String(candidate.status), "APPROVED")) throw new Error("Only a reviewed CANDIDATE or BLOCKED lesson may be promoted.");
  const candidateDiagnostics: LearningDiagnostic[] = [];
  await validateLessonSchema(candidate, candidateDiagnostics);
  await inspectLesson(repositoryRoot, candidate, 0, new Set<string>(), candidateDiagnostics, { executeBindings: true }, new Set<string>());
  if (candidateDiagnostics.length > 0) throw new Error("Candidate RED/GREEN/positive-control evidence is not executable and valid.");
  const normalizedReview = repositoryPath(repositoryRoot, resolve(repositoryRoot, reviewPath));
  if (normalizedReview === undefined) throw new Error("Promotion requires an in-repository APPROVED review record.");
  const safeReview = await existingRepositoryPath(repositoryRoot, normalizedReview);
  if (safeReview === undefined) throw new Error("The approval record must resolve through a realpath contained by the repository.");
  if (objectValue(candidate.provenance)?.recordPath === normalizedReview) throw new Error("The independent review record must differ from the provenance/source record.");
  const reviewText = await readFile(resolve(repositoryRoot, safeReview), "utf8");
  if (!nonEmptyString(reviewerRole) || !/^independent-[a-z0-9-]+$/.test(reviewerRole) || !reviewRecordValid(reviewText, reviewerRole)) throw new Error("Promotion requires a substantive structured independent review record.");
  const safeRegistry = await existingRepositoryPath(repositoryRoot, "knowledge/self-improvement/registry.json");
  const writableRegistry = await writableRepositoryPath(repositoryRoot, "knowledge/self-improvement/registry.json");
  if (safeRegistry === undefined || writableRegistry === undefined) throw new Error("The registry must be a non-symlink path contained by the repository.");
  const registryTextBefore = await readFile(resolve(repositoryRoot, safeRegistry), "utf8");
  const safeDigest = await existingRepositoryPath(repositoryRoot, "knowledge/self-improvement/registry.sha256");
  const writableDigest = await writableRepositoryPath(repositoryRoot, "knowledge/self-improvement/registry.sha256");
  if (safeDigest === undefined || writableDigest === undefined) throw new Error("The registry digest must be a non-symlink repository path.");
  const registryDigestBefore = (await readFile(resolve(repositoryRoot, safeDigest), "utf8")).trim();
  if (registryDigestBefore !== createHash("sha256").update(registryTextBefore, "utf8").digest("hex")) throw new Error("The global registry digest must be valid before promotion.");
  const registry = objectValue(JSON.parse(registryTextBefore));
  if (registry === undefined || !Array.isArray(registry.lessons)) throw new Error("The global registry is invalid.");
  const registrySchemaDiagnostics: LearningDiagnostic[] = [];
  await validateRegistrySchema(registry, registrySchemaDiagnostics);
  if (registrySchemaDiagnostics.length > 0) throw new Error("The global registry schema is invalid before promotion.");
  const id = candidate.id;
  if (!nonEmptyString(id) || registry.lessons.some((lesson) => objectValue(lesson)?.id === id)) throw new Error("The candidate ID is missing or already registered.");
  const lifecycle = objectValue(candidate.lifecycle);
  const history = Array.isArray(lifecycle?.history) ? [...lifecycle.history, { status: "APPROVED", recordPath: normalizedReview }] : [{ status: "APPROVED", recordPath: normalizedReview }];
  const promoted = { ...candidate, status: "APPROVED", review: { decision: "APPROVED", recordPath: normalizedReview, reviewerRole }, lifecycle: { current: "APPROVED", history } };
  const promotedDiagnostics: LearningDiagnostic[] = [];
  await inspectLesson(repositoryRoot, promoted, 0, new Set<string>(), promotedDiagnostics, { executeBindings: true }, new Set<string>());
  if (promotedDiagnostics.length > 0) throw new Error("Promoted lesson failed executable evidence validation.");
  registry.lessons.push(promoted);
  registry.revision = typeof registry.revision === "number" ? registry.revision + 1 : 1;
  const registryText = JSON.stringify(registry, null, 2) + "\n";
  await writeContainedFile(repositoryRoot, writableRegistry, registryText);
  await writeContainedFile(repositoryRoot, writableDigest, createHash("sha256").update(registryText, "utf8").digest("hex") + "\n");
  await writeContainedFile(repositoryRoot, writableCandidate, JSON.stringify(promoted, null, 2) + "\n");
}

export async function learningRegistryExists(root: string): Promise<boolean> {
  return (await existingRepositoryPath(root, "knowledge/self-improvement/registry.json")) !== undefined;
}
