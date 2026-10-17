import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  MAX_PHOTO_BYTES,
  PhotoTooLargeError,
  isAllowedPhotoUrl,
  readPhotoBody,
} from "../convex/lib/rh/photo";
import { brtWallToInstant, toBrtDateKey } from "../convex/lib/rh/rhid";
import { setup, withUser } from "./helpers";

const SYNCED_AT = brtWallToInstant(2026, 1, 14, 8);
const PHOTO_URL = "https://media.rhid.com.br/fotos/101.jpg";

async function seed() {
  const t = setup();
  const hr = await withUser(t, {
    clerkId: "hr-foto",
    name: "RH",
    role: "operator",
    department: "rh",
  });
  const engineer = await withUser(t, {
    clerkId: "eng-foto",
    name: "Eng",
    role: "engenheiro",
    department: "engenharia",
  });
  await t.mutation(internal.timeClock.upsertPeopleBatch, {
    people: [{ rhidPersonId: 1, name: "Ana Souza", department: "Produção" }],
    syncedAt: SYNCED_AT,
    fromRoster: true,
  });
  await t.mutation(internal.timeClock.replaceDay, {
    date: "2026-01-14",
    syncedAt: SYNCED_AT,
    punches: [
      {
        rhidRecordId: 101,
        rhidPersonId: 1,
        personName: "Ana Souza",
        date: "2026-01-14",
        punchedAt: brtWallToInstant(2026, 1, 14, 7),
        timeLabel: "07:00",
        sequence: 1,
        kind: "entrada",
        latitude: -23.55,
        longitude: -46.63,
        photoUrl: PHOTO_URL,
      },
      {
        rhidRecordId: 102,
        rhidPersonId: 1,
        personName: "Ana Souza",
        date: "2026-01-14",
        punchedAt: brtWallToInstant(2026, 1, 14, 17),
        timeLabel: "17:00",
        sequence: 2,
        kind: "almoco_saida",
      },
    ],
  });
  const punchIds = await t.run(async (ctx) => {
    const rows = await ctx.db.query("timeClockPunches").collect();
    const byRecord = new Map(rows.map((row) => [row.rhidRecordId, row._id]));
    return { withPhoto: byRecord.get(101)!, withoutPhoto: byRecord.get(102)! };
  });
  return { t, hr, engineer, punchIds };
}

function imageResponse(bytes = new Uint8Array([1, 2, 3]), type = "image/jpeg") {
  return new Response(bytes, { status: 200, headers: { "Content-Type": type } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("lib/rh/photo", () => {
  test("só aceita HTTPS do RHID ou de hosts configurados", () => {
    expect(isAllowedPhotoUrl("https://rhid.com.br/f/1.jpg")).toBe(true);
    expect(isAllowedPhotoUrl("https://media.rhid.com.br/f/1.jpg")).toBe(true);
    expect(isAllowedPhotoUrl("https://cdn.example.com/1.jpg", "cdn.example.com, x.test")).toBe(
      true
    );
    for (const url of [
      "http://rhid.com.br/1.jpg",
      "https://rhid.com.br.evil.test/1.jpg",
      "https://evilrhid.com.br/1.jpg",
      "https://127.0.0.1/a",
      "https://rhid.com.br:8443/a",
      "https://user:pass@rhid.com.br/a",
      "https://cdn.example.com/1.jpg",
      "file:///etc/passwd",
      "garbage",
    ]) {
      expect(isAllowedPhotoUrl(url), url).toBe(false);
    }
  });

  test("limita o tamanho mesmo sem content-length", async () => {
    const big = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_PHOTO_BYTES));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      })
    );
    await expect(readPhotoBody(big)).rejects.toBeInstanceOf(PhotoTooLargeError);
    const declared = new Response("x", {
      headers: { "content-length": String(MAX_PHOTO_BYTES + 1) },
    });
    await expect(readPhotoBody(declared)).rejects.toBeInstanceOf(PhotoTooLargeError);
    expect(await readPhotoBody(new Response(new Uint8Array([1, 2, 3])))).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });
});

describe("timeClock: fotos não vazam para o cliente", () => {
  test("getDay e getLiveStatus expõem só o id da marcação com foto", async () => {
    const { hr, punchIds } = await seed();

    const day = await hr.query(api.timeClock.getDay, { date: "2026-01-14" });
    expect(JSON.stringify(day)).not.toContain(PHOTO_URL);
    expect(day.punches.map((p) => p.hasPhoto)).toEqual([true, false]);
    expect(day.people[0]?.photoPunchId).toBe(punchIds.withPhoto);

    const live = await hr.query(api.timeClock.getLiveStatus, { date: "2026-01-14" });
    expect(JSON.stringify(live)).not.toContain(PHOTO_URL);
    expect(live.people[0]?.photoPunchId).toBe(punchIds.withPhoto);
  });

  test("resolvePhoto exige RH e uma marcação com foto", async () => {
    const { t, hr, engineer, punchIds } = await seed();
    const resolve = (client: typeof t, punchId: string) =>
      client.query(internal.timeClock.resolvePhoto, { punchId });

    expect(await resolve(t, punchIds.withPhoto)).toEqual({ status: "unauthenticated" });
    expect(await resolve(engineer, punchIds.withPhoto)).toEqual({ status: "forbidden" });
    expect(await resolve(hr, punchIds.withoutPhoto)).toEqual({ status: "not_found" });
    expect(await resolve(hr, "nao-e-um-id")).toEqual({ status: "not_found" });
    expect(await resolve(hr, punchIds.withPhoto)).toEqual({ status: "ok", url: PHOTO_URL });
  });
});

describe("GET /time-clock/photo/:punchId", () => {
  const path = (id: Id<"timeClockPunches"> | string) => `/time-clock/photo/${id}`;

  test("RH recebe a imagem sem cache; upstream não recebe credenciais", async () => {
    const { hr, punchIds } = await seed();
    const upstream = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      imageResponse()
    );
    vi.stubGlobal("fetch", upstream);

    const response = await hr.fetch(path(punchIds.withPhoto), { method: "GET" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe(PHOTO_URL);
    expect(init?.headers).toBeUndefined();
    expect(init?.redirect).toBe("error");
  });

  test("sem login, sem permissão ou sem foto não chega ao RHID", async () => {
    const { t, engineer, hr, punchIds } = await seed();
    const upstream = vi.fn(async () => imageResponse());
    vi.stubGlobal("fetch", upstream);

    expect((await t.fetch(path(punchIds.withPhoto), { method: "GET" })).status).toBe(401);
    expect((await engineer.fetch(path(punchIds.withPhoto), { method: "GET" })).status).toBe(
      403
    );
    expect((await hr.fetch(path(punchIds.withoutPhoto), { method: "GET" })).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  test("resposta do RHID que não é imagem vira 404; falha de rede vira 502", async () => {
    const { hr, punchIds } = await seed();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { headers: { "Content-Type": "text/html" } }))
    );
    expect((await hr.fetch(path(punchIds.withPhoto), { method: "GET" })).status).toBe(404);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      })
    );
    expect((await hr.fetch(path(punchIds.withPhoto), { method: "GET" })).status).toBe(502);
  });
});

describe("rhidSync: crons", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RHID_EMAIL = "integ@rlp.com";
    process.env.RHID_PASSWORD = "secret";
  });

  afterEach(() => {
    for (const key of ["RHID_EMAIL", "RHID_PASSWORD"]) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  function installFakeRhid() {
    const bodies: Array<{ ini: string; fim: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const json = (body: unknown) =>
          new Response(JSON.stringify(body), {
            headers: { "Content-Type": "application/json" },
          });
        if (url.endsWith("/login.svc/")) return json({ accessToken: "tok" });
        if (url.endsWith("/person.svc/a_status/ativo")) return json({ data: [] });
        if (url.endsWith("/afd.svc/afd_mobile")) {
          bodies.push(JSON.parse(String(init?.body)));
          return json([]);
        }
        return new Response("not found", { status: 404 });
      })
    );
    return bodies;
  }

  test("cron de hoje busca só o dia corrente; reconciliação busca 7 dias", async () => {
    const t = setup();
    const bodies = installFakeRhid();
    const today = toBrtDateKey(Date.now()).replaceAll("-", "");
    const weekAgo = toBrtDateKey(Date.now() - 6 * 24 * 60 * 60 * 1000).replaceAll("-", "");

    await t.action(internal.rhidSync.syncTodayFromCron, {});
    expect(bodies.at(-1)).toMatchObject({ ini: today, fim: today });

    await t.action(internal.rhidSync.syncRecentFromCron, {});
    expect(bodies.at(-1)).toMatchObject({ ini: weekAgo, fim: today });
  });

  test("com sync em andamento, hoje é ignorado e a reconciliação é reagendada", async () => {
    vi.useFakeTimers();
    const t = setup();
    const bodies = installFakeRhid();
    await t.mutation(internal.timeClock.markSyncStarted, {
      from: "2026-01-14",
      to: "2026-01-14",
      trigger: "manual",
    });

    await expect(t.action(internal.rhidSync.syncTodayFromCron, {})).resolves.toBeNull();
    await expect(t.action(internal.rhidSync.syncRecentFromCron, {})).resolves.toBeNull();
    expect(bodies).toHaveLength(0);

    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.map((job) => job.name)).toEqual(["rhidSync:syncRecentFromCron"]);
  });
});
