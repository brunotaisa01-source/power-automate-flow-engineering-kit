import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILL_PATH = resolve(ROOT, "skills/sharepoint-flow-engineering-kit/SKILL.md");
const FRONTEND_PATH = resolve(ROOT, "examples/minimal-public-app/frontend/index.js");
const SITE_URL = "https://example.test/sites/app";
const LIST_URL = `${SITE_URL}/_api/web/lists/getbytitle('ITEMS_LIST')`;
const ITEM_URL = `${LIST_URL}/items(1)`;

function httpResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

async function frontendModule(): Promise<typeof import("../../examples/minimal-public-app/frontend/index.js")> {
  return import(`${pathToFileURL(FRONTEND_PATH).href}?skill-tdd=${Date.now()}-${Math.random()}`);
}

function naiveListPrefix(candidate: string): string {
  return candidate.startsWith(LIST_URL) ? candidate : (() => { throw new Error("boundary"); })();
}

test("pressure scenario without the skill is an executable RED", () => {
  const unsafe = `${LIST_URL}/fields`;
  assert.doesNotThrow(() => naiveListPrefix(unsafe));
  assert.equal(unsafe.startsWith(LIST_URL), true);
});

test("skill procedure rejects endpoint attacks before any fetch", async () => {
  const frontend = await frontendModule();
  const invalidSave = [
    `${LIST_URL}/fields`,
    LIST_URL,
    `${LIST_URL}/items`,
    `${ITEM_URL}/fields`,
    `${LIST_URL}/items(not-an-id)`,
    `${LIST_URL}/items(1)/%2e%2e/items(2)`,
    `${LIST_URL}/fields%2f..%2fitems(1)`,
    `${SITE_URL}/_api/web/lists/getbytitle('OTHER_LIST')/items(1)`,
    `https://example.test/sites/app-evil/_api/web/lists/getbytitle('ITEMS_LIST')/items(1)`,
    `https://evil.test/sites/app/_api/web/lists/getbytitle('ITEMS_LIST')/items(1)`,
  ];
  const invalidCollection = [
    `${LIST_URL}/fields`,
    `${LIST_URL}/items`,
    ITEM_URL,
    `${LIST_URL}/fields%2f..%2fitems`,
    `${LIST_URL}/%2e%2e/getbytitle('OTHER_LIST')`,
  ];
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return httpResponse(200, {
      "@odata.etag": '"synthetic-etag"',
      FormDigestValue: "synthetic-digest",
      Title: "Expected",
      value: [],
      "@odata.nextLink": null,
    });
  }) as typeof fetch;
  try {
    for (const candidate of invalidSave) {
      await assert.rejects(
        frontend.saveSharePointItem("protected-items", candidate, '"synthetic-etag"', { Title: "Expected" }, "https://evil.test"),
      );
    }
    for (const candidate of invalidCollection) {
      assert.throws(() => frontend.buildSharePointODataUrl(candidate, "protected-items", "Title", "value", SITE_URL));
      await assert.rejects(frontend.loadAllSharePointPages(candidate, "protected-items", SITE_URL));
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("independent Save positive control binds ETag, IF-MATCH, digest, and readback", async () => {
  const frontend = await frontendModule();
  const observed: { url: string; method: string; headers: Record<string, string> }[] = [];
  const responses = [
    httpResponse(200, { "@odata.etag": '"v1"' }),
    httpResponse(200, { FormDigestValue: "digest-v1" }),
    httpResponse(204, null),
    httpResponse(200, { ID: 1, Title: "Updated" }),
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const headers = Object.fromEntries(Object.entries(init?.headers ?? {}).map(([key, value]) => [key, String(value)]));
    observed.push({ url: input.toString(), method: init?.method ?? "GET", headers });
    return responses.shift()!;
  }) as typeof fetch;
  try {
    const readback = await frontend.saveSharePointItem("protected-items", ITEM_URL, '"v1"', { Title: "Updated" }, "https://evil.test");
    assert.deepEqual(readback, { ID: 1, Title: "Updated" });
    assert.equal(observed.length, 4);
    assert.equal(observed[0]?.url, ITEM_URL);
    assert.equal(observed[0]?.method, "GET");
    assert.equal(observed[1]?.url, `${SITE_URL}/_api/contextinfo`);
    assert.equal(observed[1]?.method, "POST");
    assert.equal(observed[2]?.url, ITEM_URL);
    assert.equal(observed[2]?.method, "POST");
    assert.equal(observed[2]?.headers["X-HTTP-Method"], "MERGE");
    assert.equal(observed[2]?.headers["IF-MATCH"], '"v1"');
    assert.equal(observed[2]?.headers["X-RequestDigest"], "digest-v1");
    assert.equal(observed[3]?.method, "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("independent OData and pagination positive controls preserve exact collection authority", async () => {
  const frontend = await frontendModule();
  const odata = frontend.buildSharePointODataUrl(LIST_URL, "protected-items", "Title", "O'Reilly", SITE_URL);
  assert.equal(odata.origin, "https://example.test");
  assert.equal(odata.pathname, new URL(LIST_URL).pathname);
  assert.equal(odata.searchParams.get("$filter"), "Title eq 'O''Reilly'");

  const requested: string[] = [];
  const responses = [
    httpResponse(200, { value: [{ ID: 1 }], "@odata.nextLink": `${LIST_URL}?$skiptoken=page-2` }),
    httpResponse(200, { value: [{ ID: 2 }], "@odata.nextLink": null }),
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    requested.push(input.toString());
    return responses.shift()!;
  }) as typeof fetch;
  try {
    const items = await frontend.loadAllSharePointPages(LIST_URL, "protected-items", SITE_URL);
    assert.deepEqual(items, [{ ID: 1 }, { ID: 2 }]);
    assert.deepEqual(requested, [LIST_URL, `${LIST_URL}?$skiptoken=page-2`]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skill procedure delegates schema, index, permission, and evidence to shipped rules", async () => {
  const productionFiles = [
    "tests/rules/wp-06-raw-artifact-authority.test.ts",
    "tests/rules/wp-06-remediation-adversarial.test.ts",
  ] as const;
  for (const relativePath of productionFiles) {
    const childEnvironment = { ...process.env };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const result = await execFileAsync(process.execPath, [
      "--experimental-strip-types",
      "--test",
      resolve(ROOT, relativePath),
    ], { cwd: ROOT, timeout: 240000, windowsHide: true, env: childEnvironment });
    assert.match(result.stdout + result.stderr, /(?:#|ℹ) tests [1-9]/);
  }
});



test("skill is procedural, English, and contradiction-resistant", async () => {
  const skill = await readFile(SKILL_PATH, "utf8");
  for (const heading of ["Read and bind the project contract", "Operation-specific endpoint helpers", "typed command queue", "Schema lifecycle", "Index lifecycle", "Permission and authorization boundaries", "RED/GREEN workflow", "Local, runtime, tenant, and publication evidence", "Privacy and release checklist"]) {
    assert.match(skill, new RegExp(heading, "i"));
  }
  assert.doesNotMatch(skill, /use a generic list-prefix|caller-supplied.*authority|successful HTTP status.*body.*prove|IF-MATCH\s*[:=]\s*["']?\*/i);
  assert.match(skill, /rejected candidates must\s+fail before any `globalThis\.fetch` call/is);
  assert.match(skill, /local evidence must not be treated as tenant evidence/is);
  assert.match(skill, /never use a write-capable MCP/is);
  assert.match(skill, /NOT_RUN.{0,120}(residual|external|tenant)/is);
  assert.doesNotMatch(skill, /C:\\Users\\[^`\s]+|OneDrive\s+-|private-project-marker|Você/i);
});
