import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { toBrtDateKey } from "../convex/model/hr/timeClock";
import {
  buildPunchHash,
  classifyGeofence,
  distanceMeters,
  isDuplicatePunch,
  isPunchPhotoType,
  punchHashPayload,
  sha256Hex,
} from "../convex/model/hr/timeClockPunch";
import { setup, withUser } from "./helpers";

/** Relógio fixo em Brasília (a leitura do dia depende do horário). */
const DAY = "2026-03-10";
function setClock(label: string) {
  vi.setSystemTime(Date.parse(`${DAY}T${label}:00-03:00`));
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setClock("07:02");
});
afterEach(() => {
  vi.useRealTimers();
});

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

  test("só formatos raster valem como foto da marcação", () => {
    expect(isPunchPhotoType("image/jpeg")).toBe(true);
    expect(isPunchPhotoType("image/png; charset=binary")).toBe(true);
    expect(isPunchPhotoType("image/svg+xml")).toBe(false);
    expect(isPunchPhotoType(undefined)).toBe(false);
  });

  test("janela de repetição", () => {
    const now = Date.now();
    expect(isDuplicatePunch(now - 30_000, now, 1)).toBe(true);
    expect(isDuplicatePunch(now - 90_000, now, 1)).toBe(false);
    expect(isDuplicatePunch(null, now, 1)).toBe(false);
    expect(isDuplicatePunch(now - 1, now, 0)).toBe(false);
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
    expect(context.schedule).toMatchObject({ startMinute: 7 * 60, endMinute: 17 * 60 });
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

  test("foto que não é JPEG/PNG/WebP (ex.: SVG) nunca é entregue ao painel", async () => {
    const { t, worker, hr } = await seed();
    const svgId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["<svg xmlns='http://www.w3.org/2000/svg'/>"], { type: "image/svg+xml" })
      )
    );
    // O convex-test não grava o tipo do upload; em produção o registro já
    // recusa. A rota de entrega confere o arquivo de qualquer forma.
    const receipt = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "svg",
      capturedAt: Date.now(),
      photoStorageId: svgId as Id<"_storage">,
      photoCapturedAt: Date.now(),
      ...POS,
    });
    const response = await hr.fetch(`/time-clock/photo/${receipt.punchId}`, { method: "GET" });
    expect(response.status).toBe(404);
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
    setClock("12:00");
    const now = Date.now();
    const online = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "online",
      capturedAt: now,
      ...POS,
    });
    // Marcação feita às 07:00 sem internet, enviada agora.
    const offline = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "offline",
      capturedAt: now - 5 * 60 * 60 * 1000,
      offline: true,
      ...POS,
    });
    expect(offline.punchedAt).toBe(now - 5 * 60 * 60 * 1000);
    expect(offline.kind).toBe("entrada");
    // A marcação já gravada não é reescrita: o papel vem da leitura do dia.
    const later = await t.run((ctx) => ctx.db.get("clockPunches", online.punchId));
    expect(later?.kind).toBeUndefined();
    const context = await worker.query(api.timeClockPunch.getContext, { date: DAY });
    expect(context.punches.map((punch) => punch.kind)).toEqual(["entrada", "almoco_saida"]);
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

describe("timeClockPunch: leitura do dia e horários esquecidos", () => {
  async function punchAt(
    worker: Awaited<ReturnType<typeof seed>>["worker"],
    label: string,
    extra: Record<string, unknown> = {}
  ) {
    setClock(label);
    return await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: `p-${label}`,
      capturedAt: Date.now(),
      ...POS,
      ...extra,
    });
  }

  test("esquecer a volta do almoço não empurra a saída", async () => {
    const { t, worker, userId } = await seed();
    expect((await punchAt(worker, "07:02")).kind).toBe("entrada");
    expect((await punchAt(worker, "12:05")).kind).toBe("almoco_saida");
    const exit = await punchAt(worker, "17:10");
    expect(exit.kind).toBe("saida");
    const day = await t.run((ctx) =>
      ctx.db
        .query("clockDays")
        .withIndex("by_user_and_date", (q) => q.eq("userId", userId).eq("date", DAY))
        .unique()
    );
    expect(day).toMatchObject({ lastKind: "saida", punchCount: 3, issueCount: 1 });
  });

  test("a resposta do app e o horário esquecido vão juntos e o RH aprova", async () => {
    const { worker, hr, userId } = await seed();
    await punchAt(worker, "07:02");
    await punchAt(worker, "12:05");
    const exit = await punchAt(worker, "17:10", {
      declaredRole: "saida",
      missed: [{ role: "almoco_retorno", minute: 13 * 60 + 5 }],
    });
    expect(exit.kind).toBe("saida");

    const mine = await worker.query(api.timeClockPunch.myDays, { from: DAY, to: DAY, today: DAY });
    const back = mine.days[0]!.items.find((item) => item.role === "almoco_retorno");
    expect(back).toMatchObject({ source: "request", basis: "pending", timeLabel: "13:05" });

    const pending = await hr.query(api.timeClock.listPendingMissed, {});
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      personName: "Edilson Bispo",
      role: "almoco_retorno",
      origin: "app_prompt",
    });

    const request = { requestId: pending[0]!._id, revision: pending[0]!.revision };
    await expect(
      hr.mutation(api.timeClock.reviewMissed, { ...request, approve: false })
    ).rejects.toThrow(/motivo/);
    await hr.mutation(api.timeClock.reviewMissed, { ...request, approve: true });
    const day = await hr.query(api.timeClock.getPersonDay, { userId, date: DAY, today: DAY });
    expect(day.day.items.map((item) => [item.role, item.basis])).toEqual([
      ["entrada", "auto"],
      ["almoco_saida", "auto"],
      ["almoco_retorno", "approved"],
      ["saida", "employee"],
    ]);
    expect(day.day.issues).toEqual([]);
  });

  test("horário esquecido que não confere fica de fora sem impedir a marcação", async () => {
    const { worker, hr } = await seed();
    const receipt = await punchAt(worker, "12:00", {
      missed: [
        { role: "entrada", minute: 13 * 60 },
        { role: "almoco_saida", minute: 11 * 60 },
      ],
    });
    expect(receipt.missedNotSent).toBe(1);
    // O reenvio (resposta perdida) devolve o mesmo aviso.
    const retry = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "p-12:00",
      capturedAt: Date.now(),
      ...POS,
    });
    expect(retry).toMatchObject({ duplicate: true, missedNotSent: 1 });
    const pending = await hr.query(api.timeClock.listPendingMissed, {});
    expect(pending.map((request) => request.role)).toEqual(["almoco_saida"]);
  });

  test("horário esquecido de uma marcação que passa da meia-noite fica no dia da captura", async () => {
    const { worker, hr, userId } = await seed();
    // O toque foi às 23:59:50; o servidor recebe às 00:00:10 do dia seguinte.
    const capturedAt = Date.parse(`${DAY}T23:59:50-03:00`);
    vi.setSystemTime(capturedAt + 20_000);
    const receipt = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "midnight",
      capturedAt,
      missed: [{ role: "almoco_retorno", minute: 13 * 60 }],
      ...POS,
    });
    expect(receipt).toMatchObject({ date: "2026-03-11", missedNotSent: 0 });
    const before = await hr.query(api.timeClock.getPersonDay, { userId, date: DAY, today: "2026-03-11" });
    expect(before.requests).toEqual([
      expect.objectContaining({ role: "almoco_retorno", timeLabel: "13:00", status: "pending" }),
    ]);
  });

  test("aviso de horário esquecido recusado depois da meia-noite fica no dia da captura", async () => {
    const { worker } = await seed();
    const capturedAt = Date.parse(`${DAY}T23:59:50-03:00`);
    vi.setSystemTime(capturedAt + 20_000);
    // 23:59 não é antes do toque (23:59): fica de fora.
    const receipt = await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "midnight-rejected",
      capturedAt,
      missed: [{ role: "almoco_retorno", minute: 23 * 60 + 59 }],
      ...POS,
    });
    expect(receipt).toMatchObject({ date: "2026-03-11", missedNotSent: 1 });
    const mine = await worker.query(api.timeClockPunch.myDays, {
      from: DAY,
      to: "2026-03-11",
      today: "2026-03-11",
    });
    const byDate = new Map(mine.days.map((day) => [day.date, day.missedNotSent]));
    expect(byDate.get(DAY)).toBe(1);
    expect(byDate.get("2026-03-11")).toBe(0);
    const context = await worker.query(api.timeClockPunch.getContext, { date: "2026-03-11" });
    expect(context.punches[0]?.missedNotSent).toBe(0);
  });

  test("horário esquecido não pode ser no futuro e pode ser desfeito", async () => {
    const { worker } = await seed();
    setClock("12:00");
    await expect(
      worker.mutation(api.timeClockPunch.requestMissed, { date: DAY, role: "saida", minute: 17 * 60 })
    ).rejects.toThrow(/ainda não aconteceu/);
    const id = await worker.mutation(api.timeClockPunch.requestMissed, {
      date: DAY,
      role: "entrada",
      minute: 7 * 60,
    });
    await worker.mutation(api.timeClockPunch.cancelRequest, { requestId: id });
    await expect(
      worker.mutation(api.timeClockPunch.cancelRequest, { requestId: id })
    ).rejects.toThrow(/já analisou/);
  });

  test("dia só com horário informado entra nas pendências do dia", async () => {
    const { worker, hr } = await seed();
    setClock("12:00");
    await worker.mutation(api.timeClockPunch.requestMissed, { date: DAY, role: "entrada", minute: 7 * 60 });
    const day = await hr.query(api.timeClock.getDay, { date: DAY, today: DAY });
    const person = day.people.find((p) => p.name === "Edilson Bispo");
    expect(person).toMatchObject({ present: false });
    expect(person!.issueCount).toBeGreaterThan(0);
    expect(day.summary.issues).toBeGreaterThan(0);
  });

  test("o RH decide sobre o horário que viu", async () => {
    const { worker, hr } = await seed();
    setClock("12:00");
    await worker.mutation(api.timeClockPunch.requestMissed, { date: DAY, role: "entrada", minute: 7 * 60 });
    const [seen] = await hr.query(api.timeClock.listPendingMissed, {});
    // A pessoa corrige o horário antes do RH decidir.
    await worker.mutation(api.timeClockPunch.requestMissed, { date: DAY, role: "entrada", minute: 7 * 60 + 30 });
    await expect(
      hr.mutation(api.timeClock.reviewMissed, { requestId: seen!._id, revision: seen!.revision, approve: true })
    ).rejects.toThrow(/mudou este horário/);
    const [current] = await hr.query(api.timeClock.listPendingMissed, {});
    expect(current).toMatchObject({ timeLabel: "07:30" });
    await hr.mutation(api.timeClock.reviewMissed, {
      requestId: current!._id,
      revision: current!.revision,
      approve: true,
    });
  });

  test("resposta atrasada da fila offline não substitui a correção feita à mão", async () => {
    const { worker, hr } = await seed();
    setClock("13:40");
    await worker.mutation(api.timeClockPunch.requestMissed, {
      date: DAY,
      role: "almoco_retorno",
      minute: 13 * 60 + 35,
    });
    // Marcação das 13:10 (offline) que levava a volta do almoço às 13:05.
    await worker.mutation(api.timeClockPunch.register, {
      clientPunchId: "late",
      capturedAt: Date.parse(`${DAY}T13:10:00-03:00`),
      offline: true,
      missed: [{ role: "almoco_retorno", minute: 13 * 60 + 5 }],
      ...POS,
    });
    const pending = await hr.query(api.timeClock.listPendingMissed, {});
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ origin: "app_manual", timeLabel: "13:35" });
  });

  test("RH inclui mais de uma saída extra no mesmo dia", async () => {
    const { worker, hr, userId } = await seed();
    await punchAt(worker, "07:00");
    for (const [role, label] of [
      ["saida_extra", "09:00"],
      ["entrada_extra", "09:30"],
      ["saida_extra", "15:00"],
      ["entrada_extra", "15:30"],
    ] as const) {
      await hr.mutation(api.timeClock.includeMissed, {
        userId,
        date: DAY,
        role,
        minute: parseInt(label.slice(0, 2)) * 60 + parseInt(label.slice(3)),
        reason: "Saída para o banco",
      });
    }
    const day = await hr.query(api.timeClock.getPersonDay, { userId, date: DAY, today: DAY });
    expect(day.requests.filter((request) => request.status === "approved")).toHaveLength(4);
  });

  test("voltar ao automático ignora também o que a pessoa informou", async () => {
    const { worker, hr, userId } = await seed();
    await punchAt(worker, "07:00");
    const quick = await punchAt(worker, "15:00", { declaredRole: "saida_extra" });
    await hr.mutation(api.timeClock.adjustPunch, {
      punchId: quick.punchId,
      action: "set_role",
      role: "saida",
      reason: "Encerrou o dia",
    });
    await hr.mutation(api.timeClock.adjustPunch, {
      punchId: quick.punchId,
      action: "clear",
      reason: "Tratamento por engano",
    });
    const day = await hr.query(api.timeClock.getPersonDay, { userId, date: DAY, today: DAY });
    expect(day.day.items.find((item) => item.punchId === quick.punchId)?.basis).toBe("auto");
  });

  test("RH trata marcações sem alterá-las, sempre com motivo", async () => {
    const { t, worker, hr, userId } = await seed();
    const entry = await punchAt(worker, "07:02");
    const stray = await punchAt(worker, "09:30");
    await punchAt(worker, "17:00");
    const storedBefore = await t.run((ctx) => ctx.db.get("clockPunches", stray.punchId));

    await expect(
      hr.mutation(api.timeClock.adjustPunch, {
        punchId: stray.punchId,
        action: "set_aside",
        reason: " ",
      })
    ).rejects.toThrow(/motivo/);
    await expect(
      worker.mutation(api.timeClock.adjustPunch, {
        punchId: stray.punchId,
        action: "set_aside",
        reason: "teste",
      })
    ).rejects.toThrow();

    await hr.mutation(api.timeClock.adjustPunch, {
      punchId: stray.punchId,
      action: "set_aside",
      reason: "Toque sem querer, confirmado com a pessoa",
    });
    await hr.mutation(api.timeClock.includeMissed, {
      userId,
      date: DAY,
      role: "almoco_saida",
      minute: 12 * 60,
      reason: "Avisou por telefone",
    });
    await hr.mutation(api.timeClock.includeMissed, {
      userId,
      date: DAY,
      role: "almoco_retorno",
      minute: 13 * 60,
      reason: "Avisou por telefone",
    });

    const day = await hr.query(api.timeClock.getPersonDay, { userId, date: DAY, today: DAY });
    expect(day.day.items.map((item) => item.role)).toEqual([
      "entrada",
      "desconsiderada",
      "almoco_saida",
      "almoco_retorno",
      "saida",
    ]);
    expect(day.day.issues).toEqual([]);
    expect(day.adjustments).toHaveLength(1);
    expect(day.adjustments[0]).toMatchObject({
      action: "set_aside",
      byName: "RH",
      punchTimeLabel: "09:30",
    });

    // A marcação registrada continua igual, campo por campo.
    const stored = await t.run((ctx) => ctx.db.get("clockPunches", stray.punchId));
    expect(stored).toEqual(storedBefore);
    expect(stored).toMatchObject({ timeLabel: "09:30", nsr: stray.nsr, hash: stray.hash });
    expect(entry.kind).toBe("entrada");
  });

  test("jornada da empresa e da pessoa", async () => {
    const { worker, hr, userId } = await seed();
    await expect(
      hr.mutation(api.timeClock.updateTimeClockSettings, {
        schedule: {
          startMinute: 8 * 60,
          endMinute: 7 * 60,
          lunchMinutes: 60,
          lunchWindowStartMinute: 11 * 60,
          lunchWindowEndMinute: 14 * 60,
        },
      })
    ).rejects.toThrow(/depois da entrada/);
    const own = {
      startMinute: 8 * 60,
      endMinute: 18 * 60,
      lunchMinutes: 60,
      lunchWindowStartMinute: 11 * 60,
      lunchWindowEndMinute: 15 * 60,
    };
    await hr.mutation(api.timeClock.setUserSchedule, { userId, schedule: own });
    const context = await worker.query(api.timeClockPunch.getContext, { date: DAY });
    expect(context.schedule).toEqual(own);
    const people = await hr.query(api.timeClock.listClockPeople, {});
    expect(people.find((person) => person.userId === userId)?.schedule).toEqual(own);
    await hr.mutation(api.timeClock.setUserSchedule, { userId, schedule: null });
    const after = await worker.query(api.timeClockPunch.getContext, { date: DAY });
    expect(after.schedule.startMinute).toBe(7 * 60);
  });

  test("mudar a jornada não muda a leitura dos dias anteriores", async () => {
    const { worker, hr, userId } = await seed();
    const company = {
      startMinute: 8 * 60,
      endMinute: 18 * 60,
      lunchMinutes: 60,
      lunchWindowStartMinute: 11 * 60,
      lunchWindowEndMinute: 14 * 60,
    };
    // A primeira jornada configurada vale também para trás (não havia outra).
    await hr.mutation(api.timeClock.updateTimeClockSettings, { schedule: company });
    expect((await worker.query(api.timeClockPunch.getContext, { date: "2026-03-01" })).schedule).toEqual(company);

    const own = { ...company, startMinute: 6 * 60, endMinute: 15 * 60 };
    await hr.mutation(api.timeClock.setUserSchedule, { userId, schedule: own });
    const NEXT = "2026-03-11";
    vi.setSystemTime(Date.parse(`${NEXT}T08:00:00-03:00`));
    const later = { ...company, startMinute: 9 * 60 };
    await hr.mutation(api.timeClock.updateTimeClockSettings, { schedule: later });
    await hr.mutation(api.timeClock.setUserSchedule, { userId, schedule: null });

    // No dia anterior, valem as jornadas da época.
    const before = await hr.query(api.timeClock.getPersonDay, { userId, date: DAY, today: NEXT });
    expect(before.schedule).toEqual(own);
    // De hoje em diante, as novas.
    expect((await worker.query(api.timeClockPunch.getContext, { date: NEXT })).schedule).toEqual(later);
    expect((await hr.query(api.timeClock.getTimeClockSettings, {})).schedule).toEqual(later);
    const people = await hr.query(api.timeClock.listClockPeople, {});
    expect(people.find((person) => person.userId === userId)?.schedule).toBeNull();
  });
});
