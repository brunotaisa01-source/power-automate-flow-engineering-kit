const PATCH_ALLOWLISTS = Object.freeze({ "protected-items": Object.freeze(["Title"]) });
const READ_ALLOWLISTS = Object.freeze({ "protected-items": Object.freeze(["ID", "Title"]) });
const SITE_URL = "https://example.test/sites/app";
const LIST_RESOURCES = Object.freeze({ "protected-items": "/_api/web/lists/getbytitle('ITEMS_LIST')" });

function siteBoundaryUrl(candidate, siteUrl) {
  try {
    const configured = new URL(SITE_URL);
    if ((configured.protocol !== "https:" && configured.protocol !== "http:") || configured.search || configured.hash || configured.username || configured.password) throw new Error("invalid-site");
    const actual = new URL(candidate, configured);
    const expectedSegments = configured.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const actualSegments = actual.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (actual.origin !== configured.origin || actual.username || actual.password || actual.hash || actualSegments.length < expectedSegments.length || !expectedSegments.every((segment, index) => actualSegments[index] === segment)) throw new Error("invalid-site");
    return actual;
  } catch {
    throw new Error("site-boundary");
  }
}

function listResourceUrl(listId, candidate) {
  const resource = LIST_RESOURCES[listId];
  if (!resource) throw new Error("unknown-list");
  const actual = siteBoundaryUrl(candidate, SITE_URL);
  const configured = new URL(SITE_URL);
  const expected = new URL((configured.pathname.endsWith("/") ? configured.pathname.slice(0, -1) : configured.pathname) + resource, configured.origin);
  const expectedSegments = expected.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const actualSegments = actual.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (actual.origin !== expected.origin || actualSegments.length < expectedSegments.length || !expectedSegments.every((segment, index) => actualSegments[index] === segment)) throw new Error("list-boundary");
  return actual;
}

function allowlistedPatch(listId, patch) {
  const fields = PATCH_ALLOWLISTS[listId];
  if (!fields) throw new Error("unknown-list");
  const entries = Object.entries(patch);
  if (entries.length === 0 || !entries.every(([field, value]) => fields.includes(field) && value !== undefined)) throw new Error("invalid-patch");
  return Object.fromEntries(entries);
}

async function freshDigest(listId, itemUrl, siteUrl) {
  const item = listResourceUrl(listId, itemUrl);
  const site = siteBoundaryUrl(SITE_URL, SITE_URL);
  const digestUrl = new URL(site.pathname.replace(/\/$/, "") + "/_api/contextinfo", site.origin);
  const response = await globalThis.fetch(digestUrl, { method: "POST" });
  if (!response.ok || response.status < 200 || response.status >= 300) throw new Error("digest-failed");
  const body = await response.json();
  if (body === null || typeof body !== "object" || typeof body.FormDigestValue !== "string" || body.FormDigestValue.length === 0) throw new Error("digest-failed");
  return body.FormDigestValue;
}

export async function saveSharePointItem(listId, itemUrl, etag, patch, siteUrl) {
  const item = listResourceUrl(listId, itemUrl);
  const body = allowlistedPatch(listId, patch);
  if (typeof etag !== "string" || !/^"(?:[^"\\]|\\.)+"$/.test(etag)) throw new Error("invalid-etag");
  const currentResponse = await globalThis.fetch(item, { method: "GET" });
  if (!currentResponse.ok || currentResponse.status !== 200) throw new Error("etag-read-failed");
  const currentBody = await currentResponse.json();
  if (currentBody === null || typeof currentBody !== "object" || typeof currentBody["@odata.etag"] !== "string" || currentBody["@odata.etag"] !== etag) throw new Error("etag-mismatch");
  const digest = await freshDigest(listId, itemUrl, siteUrl);
  const response = await globalThis.fetch(item, {
    method: "POST",
    headers: {
      "X-HTTP-Method": "MERGE",
      "IF-MATCH": etag,
      "X-RequestDigest": digest
    },
    body: JSON.stringify(body)
  });
  if (response.status === 412) throw new Error("conflict");
  if (!response.ok) {
    await globalThis.fetch(item, { method: "GET" });
    throw new Error("ambiguous-write");
  }
  const readback = await globalThis.fetch(item, { method: "GET" });
  if (!readback.ok || readback.status !== 200) throw new Error("readback-failed");
  const current = await readback.json();
  if (!Object.entries(body).every(([field, value]) => Object.is(current[field], value))) throw new Error("readback-mismatch");
  return current;
}

export async function loadAllSharePointPages(initialUrl, listId, siteUrl) {
  if (typeof initialUrl !== "string" || initialUrl.length === 0) throw new Error("malformed-next-link");
  const first = listResourceUrl(listId, initialUrl);
  const expectedSegments = first.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (typeof listId !== "string" || listId.length === 0) throw new Error("unknown-list");
  const visited = new Set();
  const items = [];
  let next = first.href;
  let pages = 0;
  while (next) {
    pages += 1;
    if (pages > 50) throw new Error("page-limit");
    if (typeof next !== "string" || next.length === 0) throw new Error("malformed-next-link");
    const pageUrl = listResourceUrl(listId, next);
    const pageSegments = pageUrl.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (pageSegments.length < expectedSegments.length || !expectedSegments.every((segment, index) => pageSegments[index] === segment)) throw new Error("boundary");
    if (visited.has(pageUrl.href)) throw new Error("loop");
    visited.add(pageUrl.href);
    const response = await globalThis.fetch(pageUrl, { method: "GET" });
    if (!response.ok || response.status < 200 || response.status >= 300) throw new Error("response-failed");
    const body = await response.json();
    if (body === null || typeof body !== "object" || !Array.isArray(body.value)) throw new Error("response-failed");
    items.push(...body.value);
    const nextLink = body["@odata.nextLink"];
    if (nextLink !== undefined && nextLink !== null && (typeof nextLink !== "string" || nextLink.length === 0)) throw new Error("malformed-next-link");
    next = nextLink ?? null;
  }
  return items;
}

export function buildSharePointODataUrl(base, listId, field, value, siteUrl) {
  const fields = READ_ALLOWLISTS[listId];
  if (!fields) throw new Error("unknown-list");
  if (!fields.includes(field)) throw new Error("unknown-field");
  const url = listResourceUrl(listId, base);
  const params = new URLSearchParams();
  params.set("$select", fields.join(","));
  const escaped = String(value).replaceAll("'", "''");
  params.set("$filter", `${field} eq '${escaped}'`);
  url.search = params.toString();
  return url;
}
