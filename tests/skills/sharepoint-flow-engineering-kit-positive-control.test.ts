import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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
  return import(`${pathToFileURL(FRONTEND_PATH).href}?independent-positive=${Date.now()}-${Math.random()}`);
}

test("independent valid Save positive control performs exact readback", async () => {
  const frontend = await frontendModule();
  const responses = [
    httpResponse(200, { "@odata.etag": '"v1"' }),
    httpResponse(200, { FormDigestValue: "digest-v1" }),
    httpResponse(204, null),
    httpResponse(200, { ID: 1, Title: "Updated" }),
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => responses.shift()!) as typeof fetch;
  try {
    const readback = await frontend.saveSharePointItem("protected-items", ITEM_URL, '"v1"', { Title: "Updated" }, "https://evil.test");
    assert.deepEqual(readback, { ID: 1, Title: "Updated" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
