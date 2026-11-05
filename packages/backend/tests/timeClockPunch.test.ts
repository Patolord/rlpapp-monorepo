import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { toBrtDateKey } from "../convex/lib/rh/timeClock";
import {
  buildPunchHash,
  classifyGeofence,
  distanceMeters,
  isDuplicatePunch,
  nextSequence,
  punchHashPayload,
  sha256Hex,
} from "../convex/lib/rh/timeClockPunch";
import { setup, withUser } from "./helpers";

const POS = { latitude: -23.5290093, longitude: -46.6738077 };
const OBRA = { ...POS, radiusMeters: 500 };

describe("timeClockPunch lib", () => {
  test("sha256 bate com os vetores conhecidos", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    // Entrada maior que um bloco (56+ bytes) exercita o padding em dois blocos.
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
    );
  });

  test("hash do comprovante é determinístico e muda com o NSR", () => {
    const input = {
      nsr: 7,
      employerId: "RLP",
      personId: "user1",
      cpf: "12345678909",
      punchedAt: Date.UTC(2026, 0, 14, 10, 0, 0),
    };
    expect(punchHashPayload(input)).toBe("7|RLP|user1|12345678909|2026-01-14T10:00:00.000Z");
    expect(buildPunchHash(input)).toBe(buildPunchHash({ ...input }));
    expect(buildPunchHash(input)).not.toBe(buildPunchHash({ ...input, nsr: 8 }));
    expect(buildPunchHash(input)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("distância e classificação de cerca", () => {
    expect(distanceMeters(OBRA.latitude, OBRA.longitude, OBRA.latitude, OBRA.longitude)).toBe(0);
    // ~1 km ao norte.
    const far = { latitude: OBRA.latitude + 0.009, longitude: OBRA.longitude };
    expect(distanceMeters(far.latitude, far.longitude, OBRA.latitude, OBRA.longitude)).toBeGreaterThan(
      900
    );

    const fences = [
      { id: "a", ...OBRA },
      { id: "b", latitude: -23.6, longitude: -46.7, radiusMeters: 200 },
    ];
    expect(classifyGeofence(OBRA, fences)).toMatchObject({ status: "inside", worksite: { id: "a" } });
    expect(classifyGeofence(far, fences)).toMatchObject({
      status: "outside",
      worksite: { id: "a" },
    });
    expect(classifyGeofence(null, fences).status).toBe("not_controlled");
    expect(classifyGeofence(OBRA, []).status).toBe("not_controlled");
  });

  test("janela de repetição e posição no dia", () => {
    const now = Date.now();
    expect(isDuplicatePunch(now - 30_000, now, 1)).toBe(true);
    expect(isDuplicatePunch(now - 90_000, now, 1)).toBe(false);
    expect(isDuplicatePunch(null, now, 1)).toBe(false);
    expect(isDuplicatePunch(now - 1, now, 0)).toBe(false);
    expect(nextSequence(0)).toEqual({ sequence: 0, kind: "entrada" });
    expect(nextSequence(3)).toEqual({ sequence: 3, kind: "saida" });
  });
});

async function seed() {
  const t = setup();
  const worker = await withUser(t, {
    clerkId: "worker-1",
    name: "Edilson Bispo",
    roles: ["qr_operator"],
    permissionGrants: ["ponto.registrar"],
  });
  const stranger = await withUser(t, {
    clerkId: "stranger-1",
    name: "Sem Ponto",
    roles: ["qr_operator"],
  });
  const hr = await withUser(t, {
    clerkId: "hr-1",
    name: "RH",
    roles: ["rh"],
  });
  const { userId, projectId } = await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", "worker-1"))
      .unique();
    const projectId = await ctx.db.insert("projects", {
      name: "Escritório RLP",
      floors: [],
      createdAt: Date.now(),
      geofence: OBRA,
    });
    // Obra sem cerca não entra na classificação.
    await ctx.db.insert("projects", { name: "Obra sem cerca", floors: [], createdAt: Date.now() });
    return { userId: user!._id, projectId };
  });
  return { t, worker, stranger, hr, userId, projectId };
}

describe("timeClockPunch: registro pelo app", () => {
  test("registra dentro da cerca da obra e emite comprovante no nome do usuário", async () => {
    const { t, worker, userId, projectId } = await seed();
    const receipt = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "c1",
      capturedAt: Date.now(),
      ...POS,
      accuracyMeters: 12,
      deviceModel: "Pixel 8",
    });
    expect(receipt).toMatchObject({
      personName: "Edilson Bispo",
      sequence: 0,
      kind: "entrada",
      geofenceStatus: "inside",
      worksiteName: "Escritório RLP",
      nsr: 1,
      duplicate: false,
    });
    expect(receipt.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.date).toBe(toBrtDateKey(receipt.punchedAt));

    const stored = await t.run((ctx) => ctx.db.get("clockPunches", receipt.punchId));
    expect(stored).toMatchObject({ userId, projectId, geofenceStatus: "inside" });
    const day = await t.run((ctx) =>
      ctx.db
        .query("clockDays")
        .withIndex("by_user_and_date", (q) => q.eq("userId", userId).eq("date", receipt.date))
        .unique()
    );
    expect(day).toMatchObject({ projectId, punchCount: 1, lastKind: "entrada" });

    const context = await worker.query(api.timeClockPunch.getContext, { date: receipt.date });
    expect(context.allowed).toBe(true);
    expect(context.personName).toBe("Edilson Bispo");
    expect(context.rules).toEqual({
      photoRequired: false,
      locationRequired: true,
      duplicateWindowMinutes: 1,
    });
    expect(context.worksites).toEqual([
      { projectId, name: "Escritório RLP", ...OBRA },
    ]);
    expect(context.punches).toHaveLength(1);
    expect(context.punches[0]).toMatchObject({
      kind: "entrada",
      geofenceStatus: "inside",
      worksiteName: "Escritório RLP",
      nsr: 1,
    });

    const history = await worker.query(api.timeClockPunch.myPunches, {
      from: receipt.date,
      to: receipt.date,
    });
    expect(history.map((punch) => punch._id)).toEqual([receipt.punchId]);
  });

  test("reenvio com o mesmo clientPunchId devolve o mesmo comprovante", async () => {
    const { worker } = await seed();
    const first = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "same",
      capturedAt: Date.now(),
      ...POS,
    });
    const again = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "same",
      capturedAt: Date.now(),
      ...POS,
    });
    expect(again.punchId).toBe(first.punchId);
    expect(again.nsr).toBe(first.nsr);
    expect(again.hash).toBe(first.hash);
    expect(again.duplicate).toBe(true);
  });

  test("toque repetido dentro da janela é recusado", async () => {
    const { worker } = await seed();
    await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "p1",
      capturedAt: Date.now(),
      ...POS,
    });
    await expect(
      worker.mutation(api.timeClockPunch.register, {
        clientPunchId: "p2",
        capturedAt: Date.now(),
        ...POS,
      })
    ).rejects.toThrow(/Marcação repetida/);
  });

  test("regras: localização obrigatória, foto obrigatória e fora da cerca", async () => {
    const { t, worker, hr } = await seed();
    await expect(
      worker.mutation(api.timeClockPunch.register, {
        clientPunchId: "noloc",
        capturedAt: Date.now(),
      })
    ).rejects.toThrow(/localização/);

    await hr.mutation(api.timeClock.updateTimeClockSettings, {
      photoRequired: true,
      duplicateWindowMinutes: 0,
    });
    await expect(
      worker.mutation(api.timeClockPunch.register, {
        clientPunchId: "nophoto",
        capturedAt: Date.now(),
        ...POS,
      })
    ).rejects.toThrow(/foto/i);

    const photoId = await t.run((ctx) =>
      ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }))
    );
    const receipt = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "withphoto",
      capturedAt: Date.now(),
      photoStorageId: photoId as Id<"_storage">,
      photoCapturedAt: Date.now() - 1000,
      latitude: OBRA.latitude + 0.05,
      longitude: OBRA.longitude,
    });
    expect(receipt.geofenceStatus).toBe("outside");
    expect(receipt.worksiteName).toBe("Escritório RLP");

    await expect(
      worker.mutation(api.timeClockPunch.register, {
        clientPunchId: "oldphoto",
        capturedAt: Date.now(),
        photoStorageId: photoId as Id<"_storage">,
        photoCapturedAt: Date.now() - 10 * 60 * 1000,
        ...POS,
      })
    ).rejects.toThrow(/expirada/);
  });

  test("usuário sem a permissão de bater ponto é recusado e o contexto diz isso", async () => {
    const { stranger } = await seed();
    const context = await stranger.query(api.timeClockPunch.getContext, {
      date: toBrtDateKey(Date.now()),
    });
    expect(context.allowed).toBe(false);
    expect(context.worksites).toEqual([]);
    expect(context.punches).toEqual([]);
    await expect(
      stranger.mutation(api.timeClockPunch.register, {
        clientPunchId: "x",
        capturedAt: Date.now(),
        ...POS,
      })
    ).rejects.toThrow(/não bate ponto/);
    await expect(
      stranger.mutation(api.timeClockPunch.generatePhotoUploadUrl, {})
    ).rejects.toThrow(/não bate ponto/);
  });

  test("marcações offline mantêm o horário do aparelho e ordenam o dia", async () => {
    const { t, worker, hr } = await seed();
    await hr.mutation(api.timeClock.updateTimeClockSettings, { duplicateWindowMinutes: 0 });
    const now = Date.now();
    const online = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "online",
      capturedAt: now,
      ...POS,
    });
    // Marcação feita 2h antes sem internet, enviada agora.
    const offline = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "offline",
      capturedAt: now - 2 * 60 * 60 * 1000,
      offline: true,
      ...POS,
    });
    expect(offline.punchedAt).toBe(now - 2 * 60 * 60 * 1000);
    if (offline.date === online.date) {
      expect(offline.sequence).toBe(0);
      expect(offline.kind).toBe("entrada");
      const later = await t.run((ctx) => ctx.db.get("clockPunches", online.punchId));
      expect(later?.sequence).toBe(1);
      expect(later?.kind).toBe("almoco_saida");
    }
    await expect(
      worker.mutation(api.timeClockPunch.register, {
        clientPunchId: "ancient",
        capturedAt: now - 10 * 24 * 60 * 60 * 1000,
        offline: true,
        ...POS,
      })
    ).rejects.toThrow(/7 dias/);
  });

  test("clientPunchId de outro usuário não é reaproveitado", async () => {
    const { t, worker } = await seed();
    await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "shared",
      capturedAt: Date.now(),
      ...POS,
    });
    const other = await withUser(t, {
      clerkId: "worker-2",
      name: "Outro",
      roles: [],
      permissionGrants: ["ponto.registrar"],
    });
    await expect(
      other.mutation(api.timeClockPunch.register, {
        clientPunchId: "shared",
        capturedAt: Date.now(),
        ...POS,
      })
    ).rejects.toThrow(/já utilizado/);
  });
});
