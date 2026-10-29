import r2Test from "@convex-dev/r2/test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  MAX_PLAN_BYTES,
  PLAN_KEY_PREFIX,
  PLAN_UPLOAD_HEADERS,
  parsePlanHash,
  parsePlanUploadRequest,
  parsePlanUploadedRequest,
  planHashFromPath,
  planKey,
} from "../convex/model/procurement/takeoffPlans";
import { setup } from "./helpers";

const HASH = "a".repeat(64);

describe("plan keys and hashes", () => {
  test("accepts a SHA-256 in hex, normalising case and whitespace", () => {
    expect(parsePlanHash(HASH)).toBe(HASH);
    expect(parsePlanHash(` ${HASH.toUpperCase()} `)).toBe(HASH);
  });

  test("rejects anything that is not 64 hex characters", () => {
    expect(parsePlanHash("abc")).toBeNull();
    expect(parsePlanHash(`${HASH}0`)).toBeNull();
    expect(parsePlanHash("g".repeat(64))).toBeNull();
    expect(parsePlanHash(42)).toBeNull();
    expect(parsePlanHash(undefined)).toBeNull();
  });

  test("the object key is the hash under a fixed prefix", () => {
    expect(planKey(HASH)).toBe(`${PLAN_KEY_PREFIX}${HASH}.pdf`);
  });

  test("reads the hash out of the download route and nothing else", () => {
    expect(planHashFromPath(`/takeoff/plans/${HASH}/url`)).toBe(HASH);
    expect(planHashFromPath(`/takeoff/plans/${HASH}`)).toBeNull();
    expect(planHashFromPath(`/takeoff/plans/${HASH}/url/extra`)).toBeNull();
    expect(planHashFromPath("/takeoff/plans/nope/url")).toBeNull();
    expect(planHashFromPath("/takeoff/catalog")).toBeNull();
  });
});

describe("parsePlanUploadRequest", () => {
  test("requires a hash and a positive size, trims the name", () => {
    expect(parsePlanUploadRequest(null)).toMatchObject({ ok: false });
    expect(parsePlanUploadRequest([])).toMatchObject({ ok: false });
    expect(parsePlanUploadRequest({ size: 10 })).toMatchObject({
      ok: false,
      error: expect.stringContaining("hash"),
    });
    expect(parsePlanUploadRequest({ hash: HASH })).toMatchObject({
      ok: false,
      error: expect.stringContaining("size"),
    });
    expect(parsePlanUploadRequest({ hash: HASH, size: 1.5 })).toMatchObject({
      ok: false,
    });
    expect(parsePlanUploadRequest({ hash: HASH, size: 0 })).toMatchObject({
      ok: false,
    });
    expect(
      parsePlanUploadRequest({ hash: HASH, size: 10, name: "  planta.pdf " })
    ).toEqual({ ok: true, value: { hash: HASH, size: 10, name: "planta.pdf" } });
  });

  test("falls back to the hash as the name and caps the size", () => {
    expect(parsePlanUploadRequest({ hash: HASH, size: 10 })).toEqual({
      ok: true,
      value: { hash: HASH, size: 10, name: `${HASH}.pdf` },
    });
    expect(
      parsePlanUploadRequest({ hash: HASH, size: MAX_PLAN_BYTES + 1 })
    ).toMatchObject({ ok: false, error: expect.stringContaining("limit") });
  });
});

describe("parsePlanUploadedRequest", () => {
  test("takes the hash with an optional size", () => {
    expect(parsePlanUploadedRequest({ hash: HASH })).toEqual({
      ok: true,
      value: { hash: HASH },
    });
    expect(parsePlanUploadedRequest({ hash: HASH, size: 7 })).toEqual({
      ok: true,
      value: { hash: HASH, size: 7 },
    });
    expect(parsePlanUploadedRequest({ hash: HASH, size: -1 })).toMatchObject({
      ok: false,
    });
    expect(parsePlanUploadedRequest({})).toMatchObject({ ok: false });
  });
});

// The handlers talk to R2 only after the token, the storage configuration and
// the request itself check out, so every refusal below runs without a bucket.
describe("/takeoff/plans routes", () => {
  const R2_VARS = [
    "R2_BUCKET",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const name of ["TAKEOFF_CATALOG_TOKEN", ...R2_VARS]) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });
  afterEach(() => {
    for (const name of ["TAKEOFF_CATALOG_TOKEN", ...R2_VARS]) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });
  const configureStorage = () => {
    process.env.R2_BUCKET = "takeoff-test";
    process.env.R2_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
  };
  const auth = { Authorization: "Bearer secret" };
  const post = (path: string, body: string, headers: Record<string, string>) =>
    setup().fetch(path, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body,
    });

  test("are disabled until the takeoff token is configured", async () => {
    expect((await post("/takeoff/plans/upload-url", "{}", {})).status).toBe(503);
    expect((await post("/takeoff/plans/uploaded", "{}", {})).status).toBe(503);
    expect((await setup().fetch(`/takeoff/plans/${HASH}/url`)).status).toBe(503);
  });

  test("reject a missing or wrong token", async () => {
    process.env.TAKEOFF_CATALOG_TOKEN = "secret";
    const wrong = { Authorization: "Bearer wrong" };
    expect((await post("/takeoff/plans/upload-url", "{}", {})).status).toBe(401);
    expect((await post("/takeoff/plans/upload-url", "{}", wrong)).status).toBe(401);
    expect((await post("/takeoff/plans/uploaded", "{}", wrong)).status).toBe(401);
    expect(
      (await setup().fetch(`/takeoff/plans/${HASH}/url`, { headers: wrong })).status
    ).toBe(401);
  });

  test("answer 503 while the bucket is not configured", async () => {
    process.env.TAKEOFF_CATALOG_TOKEN = "secret";
    const body = JSON.stringify({ hash: HASH, size: 10 });
    const res = await post("/takeoff/plans/upload-url", body, auth);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Plan storage is not configured" });
    expect((await post("/takeoff/plans/uploaded", body, auth)).status).toBe(503);
    expect(
      (await setup().fetch(`/takeoff/plans/${HASH}/url`, { headers: auth })).status
    ).toBe(503);
  });

  test("validate the body before touching the bucket", async () => {
    process.env.TAKEOFF_CATALOG_TOKEN = "secret";
    configureStorage();
    const notJson = await post("/takeoff/plans/upload-url", "not json", auth);
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({ error: "Body must be JSON" });

    const badHash = await post(
      "/takeoff/plans/upload-url",
      JSON.stringify({ hash: "xyz", size: 10 }),
      auth
    );
    expect(badHash.status).toBe(400);
    expect(await badHash.json()).toMatchObject({
      error: expect.stringContaining("hash"),
    });

    const noSize = await post(
      "/takeoff/plans/uploaded",
      JSON.stringify({ hash: HASH, size: "10" }),
      auth
    );
    expect(noSize.status).toBe(400);
  });

  test("answer 404 for a malformed download path", async () => {
    process.env.TAKEOFF_CATALOG_TOKEN = "secret";
    configureStorage();
    const t = setup();
    expect((await t.fetch("/takeoff/plans/nope/url", { headers: auth })).status).toBe(
      404
    );
    expect((await t.fetch(`/takeoff/plans/${HASH}`, { headers: auth })).status).toBe(
      404
    );
  });
});

// With the component registered, the handlers run for real against its metadata
// table; only the calls that would reach the bucket (HEAD on confirm) are kept
// out of these tests. A plan "on record" is seeded straight into that table.
describe("/takeoff/plans with a plan on record", () => {
  const R2_VARS = [
    "R2_BUCKET",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const name of ["TAKEOFF_CATALOG_TOKEN", ...R2_VARS]) {
      saved[name] = process.env[name];
    }
    process.env.TAKEOFF_CATALOG_TOKEN = "secret";
    process.env.R2_BUCKET = "takeoff-test";
    process.env.R2_ENDPOINT = "https://acc.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
  });
  afterEach(() => {
    for (const name of ["TAKEOFF_CATALOG_TOKEN", ...R2_VARS]) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });
  const auth = { Authorization: "Bearer secret" };

  async function withRecordedPlan() {
    const t = setup();
    const r2 = r2Test.register(t);
    await t.mutation(r2.lib.upsertMetadata, {
      bucket: "takeoff-test",
      key: planKey(HASH),
      size: 1234,
      contentType: "application/pdf",
      lastModified: "2026-10-26T00:00:00.000Z",
      link: "",
    });
    const metadata = () =>
      t.query(r2.lib.getMetadata, {
        bucket: "takeoff-test",
        endpoint: "https://acc.r2.cloudflarestorage.com",
        accessKeyId: "key",
        secretAccessKey: "secret",
        key: planKey(HASH),
      });
    return { t, metadata };
  }

  test("upload-url answers exists for it and a create-only signed PUT for a new one", async () => {
    const { t } = await withRecordedPlan();
    const known = await t.fetch("/takeoff/plans/upload-url", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ hash: HASH, size: 1234, name: "planta.pdf" }),
    });
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual({ exists: true, size: 1234 });

    const other = "c".repeat(64);
    const fresh = await t.fetch("/takeoff/plans/upload-url", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ hash: other, size: 10, name: "nova.pdf" }),
    });
    expect(fresh.status).toBe(200);
    const ticket = (await fresh.json()) as {
      exists: boolean;
      url: string;
      headers: Record<string, string>;
    };
    expect(ticket.exists).toBe(false);
    expect(ticket.headers).toEqual(PLAN_UPLOAD_HEADERS);
    // virtual-hosted style: the bucket is the first label of the host
    const url = new URL(ticket.url);
    expect(url.host).toBe("takeoff-test.acc.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/${planKey(other)}`);
    // the signature covers If-None-Match, so the PUT can only create the object
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("if-none-match");
  });

  test("uploaded confirms a plan on record and never deletes it over a claimed size", async () => {
    const { t, metadata } = await withRecordedPlan();
    const ok = await t.fetch("/takeoff/plans/uploaded", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ hash: HASH, size: 1234 }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, size: 1234 });

    const wrong = await t.fetch("/takeoff/plans/uploaded", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ hash: HASH, size: 99 }),
    });
    expect(wrong.status).toBe(409);
    expect(await metadata()).toMatchObject({ key: planKey(HASH), size: 1234 });
  });

  test("download answers a signed GET URL for a plan on record and 404 otherwise", async () => {
    const { t } = await withRecordedPlan();
    const res = await t.fetch(`/takeoff/plans/${HASH}/url`, { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; expiresAt: number; size: number };
    expect(new URL(body.url).host).toBe("takeoff-test.acc.r2.cloudflarestorage.com");
    expect(new URL(body.url).pathname).toBe(`/${planKey(HASH)}`);
    expect(body.size).toBe(1234);
    expect(body.expiresAt).toBeGreaterThan(Date.now());

    const missing = await t.fetch(`/takeoff/plans/${"d".repeat(64)}/url`, { headers: auth });
    expect(missing.status).toBe(404);
  });
});

