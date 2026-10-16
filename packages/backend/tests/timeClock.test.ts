import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { brtWallToInstant, normalizeCheckIns } from "../convex/lib/rh/rhid";
import { setup, withUser } from "./helpers";

const SYNCED_AT = brtWallToInstant(2026, 1, 15, 8);

async function seed() {
  const t = setup();
  const hr = await withUser(t, {
    clerkId: "hr-ponto",
    name: "RH",
    role: "operator",
    department: "rh",
  });
  const engineer = await withUser(t, {
    clerkId: "eng-ponto",
    name: "Eng",
    role: "engenheiro",
    department: "engenharia",
  });
  return { t, hr, engineer };
}

const GEOFENCE = {
  id: 10,
  name: "Obra Centro",
  latitude: -23.55,
  longitude: -46.63,
  radius: 150,
};

/** Dia 14/01: Ana completa (4 marcações), Bruno só entrada. Carlos sem marcação. */
function checkInsFixture() {
  return normalizeCheckIns([
    {
      person: { id: 1, name: "Ana Souza", cpf: 12345678909 },
      listAfdMobilePerson: [
        { id: 101, dateTime: "2026-01-14T07:00:00", geofence: GEOFENCE, latitude: -23.55, longitude: -46.63, photoURL: "https://x/a.jpg" },
        { id: 102, dateTime: "2026-01-14T12:00:00", geofence: GEOFENCE },
        { id: 103, dateTime: "2026-01-14T13:00:00", geofence: GEOFENCE },
        { id: 104, dateTime: "2026-01-14T17:00:00", geofence: GEOFENCE },
        { id: 105, dateTime: "2026-01-15T07:05:00", geofence: GEOFENCE },
      ],
    },
    {
      person: { id: 2, name: "Bruno Lima" },
      listAfdMobilePerson: [{ id: 201, dateTime: "2026-01-14T07:30:00" }],
    },
  ]);
}

async function seedMirror(t: ReturnType<typeof setup>) {
  const data = checkInsFixture();
  await t.mutation(internal.timeClock.upsertPeopleBatch, {
    people: [
      { rhidPersonId: 1, name: "Ana Souza", cpf: "12345678909", department: "Produção" },
      { rhidPersonId: 2, name: "Bruno Lima", department: "Produção" },
      { rhidPersonId: 3, name: "Carlos Dias", department: "Escritório" },
    ],
    syncedAt: SYNCED_AT,
    fromRoster: true,
  });
  await t.mutation(internal.timeClock.upsertWorksitesBatch, {
    worksites: data.worksites,
    syncedAt: SYNCED_AT,
  });
  for (const date of ["2026-01-14", "2026-01-15"]) {
    await t.mutation(internal.timeClock.replaceDay, {
      date,
      punches: data.punches.filter((p) => p.date === date),
      syncedAt: SYNCED_AT,
    });
  }
  return data;
}

describe("timeClock: espelho diário", () => {
  test("getDay lista presentes, ausentes, marcações e obras", async () => {
    const { t, hr } = await seed();
    await seedMirror(t);

    const day = await hr.query(api.timeClock.getDay, { date: "2026-01-14" });
    expect(day.summary).toEqual({
      total: 3,
      present: 2,
      absent: 1,
      punches: 5,
      byKind: { entrada: 2, almoco_saida: 1, almoco_retorno: 1, saida: 1 },
    });

    const ana = day.people.find((p) => p.rhidPersonId === 1);
    expect(ana).toMatchObject({
      present: true,
      punchCount: 4,
      lastKind: "saida",
      worksiteName: "Obra Centro",
      photoUrl: "https://x/a.jpg",
      department: "Produção",
    });
    const carlos = day.people.find((p) => p.rhidPersonId === 3);
    expect(carlos).toMatchObject({ present: false, punchCount: 0, lastKind: null });

    expect(day.punches.map((p) => p.timeLabel)).toEqual([
      "07:00",
      "07:30",
      "12:00",
      "13:00",
      "17:00",
    ]);
    expect(day.worksites).toHaveLength(1);
    expect(day.worksites[0]).toMatchObject({
      rhidGeofenceId: 10,
      peopleCount: 1,
      punchCount: 4,
      projectId: null,
    });

    await expect(hr.query(api.timeClock.getDay, { date: "14/01/2026" })).rejects.toThrow(
      /inválida/
    );
  });

  test("replaceDay remove marcações que sumiram do RHID e recalcula o resumo", async () => {
    const { t, hr } = await seed();
    const data = await seedMirror(t);

    // O RHID "apagou" a saída da Ana e a entrada do Bruno.
    const remaining = data.punches.filter(
      (p) => p.date === "2026-01-14" && p.rhidRecordId !== 104 && p.rhidRecordId !== 201
    );
    const result = await t.mutation(internal.timeClock.replaceDay, {
      date: "2026-01-14",
      punches: remaining,
      syncedAt: SYNCED_AT + 1000,
    });
    expect(result).toEqual({ inserted: 0, updated: 3, deleted: 2, people: 1 });

    const day = await hr.query(api.timeClock.getDay, { date: "2026-01-14" });
    expect(day.summary.present).toBe(1);
    expect(day.summary.punches).toBe(3);
    expect(day.people.find((p) => p.rhidPersonId === 2)?.present).toBe(false);

    const days = await t.run(async (ctx) =>
      ctx.db
        .query("timeClockDays")
        .withIndex("by_date", (q) => q.eq("date", "2026-01-14"))
        .collect()
    );
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ rhidPersonId: 1, punchCount: 3, lastKind: "almoco_retorno" });
  });

  test("getLiveStatus responde onde está cada pessoa e quem está em cada obra", async () => {
    const { t, hr } = await seed();
    await seedMirror(t);
    const projectId = await t.run(async (ctx) =>
      ctx.db.insert("projects", { name: "Edifício Centro", floors: [], createdAt: Date.now() })
    );
    await hr.mutation(api.timeClock.linkWorksite, { rhidGeofenceId: 10, projectId });

    // Dia 14: Ana fechou o dia (4 marcações), Bruno só entrada fora de cerca, Carlos ausente.
    const live14 = await hr.query(api.timeClock.getLiveStatus, { date: "2026-01-14" });
    expect(live14.summary).toEqual({
      total: 3,
      onSite: 1,
      lunch: 0,
      left: 1,
      absent: 1,
      outsideFence: 1,
    });
    const byId = new Map(live14.people.map((p) => [p.rhidPersonId, p]));
    expect(byId.get(1)).toMatchObject({
      status: "left",
      lastKind: "saida",
      lastTimeLabel: "17:00",
      worksiteId: 10,
      worksiteName: "Obra Centro",
      locationExact: true,
      since: brtWallToInstant(2026, 1, 14, 17),
    });
    expect(byId.get(1)?.punches.map((p) => p.kind)).toEqual([
      "entrada",
      "almoco_saida",
      "almoco_retorno",
      "saida",
    ]);
    expect(byId.get(2)).toMatchObject({
      status: "on_site",
      worksiteId: null,
      locationExact: false,
      lastTimeLabel: "07:30",
    });
    expect(byId.get(3)).toMatchObject({ status: "absent", since: null, worksiteId: null });

    expect(live14.worksites[0]).toMatchObject({
      rhidGeofenceId: 10,
      projectName: "Edifício Centro",
      onSite: 0,
      lunch: 0,
      left: 1,
    });
    expect(live14.worksites[0]?.people).toEqual([
      { rhidPersonId: 1, name: "Ana Souza", status: "left", since: brtWallToInstant(2026, 1, 14, 17), locationExact: true },
    ]);

    // Dia 15: Ana só bateu a entrada → está na obra agora.
    const live15 = await hr.query(api.timeClock.getLiveStatus, { date: "2026-01-15" });
    expect(live15.summary).toMatchObject({ onSite: 1, absent: 2 });
    expect(live15.worksites[0]).toMatchObject({ onSite: 1, people: [{ rhidPersonId: 1, status: "on_site" }] });

    // Ana sai para almoço fora da cerca: continua referenciada à última obra conhecida.
    const data = checkInsFixture();
    const lunch = {
      ...data.punches.find((p) => p.rhidRecordId === 105)!,
      rhidRecordId: 106,
      punchedAt: brtWallToInstant(2026, 1, 15, 12),
      timeLabel: "12:00",
      sequence: 1,
      kind: "almoco_saida" as const,
      rhidGeofenceId: undefined,
      geofenceName: undefined,
    };
    await t.mutation(internal.timeClock.replaceDay, {
      date: "2026-01-15",
      punches: [...data.punches.filter((p) => p.date === "2026-01-15"), lunch],
      syncedAt: SYNCED_AT,
    });
    const live15b = await hr.query(api.timeClock.getLiveStatus, { date: "2026-01-15" });
    expect(live15b.people.find((p) => p.rhidPersonId === 1)).toMatchObject({
      status: "lunch",
      worksiteId: 10,
      locationExact: false,
    });
    expect(live15b.worksites[0]).toMatchObject({ onSite: 0, lunch: 1 });
  });

  test("departamentos acompanhados limitam quem conta como ausente", async () => {
    const { t, hr } = await seed();
    await seedMirror(t);

    await hr.mutation(api.timeClock.updateTimeClockSettings, {
      trackedDepartments: ["producao", " Produção "],
      manDayCostCents: 20_050.4,
    });
    const settings = await hr.query(api.timeClock.getTimeClockSettings, {});
    expect(settings).toEqual({
      manDayCostCents: 20_050,
      trackedDepartments: ["producao", "Produção"],
    });

    // Carlos (Escritório) deixa de aparecer como ausente.
    const day = await hr.query(api.timeClock.getDay, { date: "2026-01-14" });
    expect(day.summary).toMatchObject({ total: 2, present: 2, absent: 0 });

    const people = await hr.query(api.timeClock.listRhidPeople, {});
    expect(people.find((p) => p.rhidPersonId === 3)?.tracked).toBe(false);
    expect(people.find((p) => p.rhidPersonId === 1)?.tracked).toBe(true);

    await expect(
      hr.mutation(api.timeClock.updateTimeClockSettings, { manDayCostCents: -1 })
    ).rejects.toThrow(/inválido/);
  });

  test("getMonthStats agrega homem-dia por pessoa e obra", async () => {
    const { t, hr } = await seed();
    await seedMirror(t);

    const stats = await hr.query(api.timeClock.getMonthStats, { year: 2026, month: 1 });
    expect(stats.from).toBe("2026-01-01");
    expect(stats.to).toBe("2026-01-31");
    expect(stats.manDayCostCents).toBe(15_000);
    expect(stats.totalManDays).toBe(3); // Ana 14 e 15, Bruno 14
    expect(stats.uniquePeople).toBe(2);
    expect(stats.uniqueWorksites).toBe(1);
    expect(stats.byDate).toEqual([
      { date: "2026-01-14", presentCount: 2 },
      { date: "2026-01-15", presentCount: 1 },
    ]);
    expect(stats.byPerson[0]).toMatchObject({ rhidPersonId: 1, totalDays: 2 });
    const centro = stats.byWorksite.find((w) => w.rhidGeofenceId === 10);
    expect(centro).toMatchObject({ totalManDays: 2, uniquePeople: 1, worksiteName: "Obra Centro" });

    const empty = await hr.query(api.timeClock.getMonthStats, { year: 2026, month: 2 });
    expect(empty.totalManDays).toBe(0);
  });
});

describe("timeClock: vínculos", () => {
  test("pessoas do RHID casam automaticamente por CPF e por nome único", async () => {
    const { t, hr } = await seed();
    const anaId = await hr.mutation(api.employees.create, {
      name: "Ana S.",
      code: "1",
      cpf: "123.456.789-09",
      baseSalaryCents: 100_000,
      paymentMethod: "pix",
    });
    const brunoId = await hr.mutation(api.employees.create, {
      name: "Bruno Lima",
      code: "2",
      baseSalaryCents: 100_000,
      paymentMethod: "pix",
    });
    // Funcionário arquivado com o mesmo nome não vincula.
    const carlosId = await hr.mutation(api.employees.create, {
      name: "Carlos Dias",
      code: "3",
      baseSalaryCents: 100_000,
      paymentMethod: "pix",
    });
    await hr.mutation(api.employees.archive, { employeeId: carlosId });
    await seedMirror(t);

    const people = await hr.query(api.timeClock.listRhidPeople, {});
    const byId = new Map(people.map((p) => [p.rhidPersonId, p]));
    expect(byId.get(1)?.employee?._id).toBe(anaId);
    expect(byId.get(1)?.linkSource).toBe("auto");
    expect(byId.get(2)?.employee?._id).toBe(brunoId);
    expect(byId.get(3)?.employee).toBeNull();

    // getDay e getMonthStats expõem o funcionário vinculado.
    const day = await hr.query(api.timeClock.getDay, { date: "2026-01-14" });
    expect(day.people.find((p) => p.rhidPersonId === 1)?.employee?.name).toBe("Ana S.");
    const stats = await hr.query(api.timeClock.getMonthStats, { year: 2026, month: 1 });
    expect(stats.byPerson.find((p) => p.rhidPersonId === 2)?.employee?._id).toBe(brunoId);
  });

  test("vínculo manual sobrevive à sincronização e desvincular é manual", async () => {
    const { t, hr } = await seed();
    await seedMirror(t);
    const carlosId = await hr.mutation(api.employees.create, {
      name: "Carlos D. Silva",
      code: "9",
      baseSalaryCents: 100_000,
      paymentMethod: "pix",
    });

    await hr.mutation(api.timeClock.linkPerson, { rhidPersonId: 3, employeeId: carlosId });
    let people = await hr.query(api.timeClock.listRhidPeople, {});
    expect(people.find((p) => p.rhidPersonId === 3)).toMatchObject({
      linkSource: "manual",
      employee: { _id: carlosId },
    });

    // Nova sync do cadastro: o vínculo manual permanece; quem sumiu fica inativo.
    await t.mutation(internal.timeClock.upsertPeopleBatch, {
      people: [{ rhidPersonId: 3, name: "Carlos Dias", department: "Escritório" }],
      syncedAt: SYNCED_AT + 5000,
      fromRoster: true,
    });
    people = await hr.query(api.timeClock.listRhidPeople, {});
    expect(people.find((p) => p.rhidPersonId === 3)?.employee?._id).toBe(carlosId);
    expect(people.find((p) => p.rhidPersonId === 1)?.active).toBe(false);

    await hr.mutation(api.timeClock.linkPerson, { rhidPersonId: 3, employeeId: null });
    people = await hr.query(api.timeClock.listRhidPeople, {});
    expect(people.find((p) => p.rhidPersonId === 3)).toMatchObject({
      linkSource: "manual",
      employee: null,
    });

    await expect(
      hr.mutation(api.timeClock.linkPerson, { rhidPersonId: 999, employeeId: carlosId })
    ).rejects.toThrow(/não encontrada/);

    const audit = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").collect()
    );
    expect(audit.filter((row) => row.tableName === "rhidPeople")).toHaveLength(2);
  });

  test("obras do RHID podem ser vinculadas a projetos", async () => {
    const { t, hr } = await seed();
    await seedMirror(t);
    const projectId = await t.run(async (ctx) =>
      ctx.db.insert("projects", {
        name: "Edifício Centro",
        floors: [],
        createdAt: Date.now(),
      })
    );

    const options = await hr.query(api.timeClock.listProjectOptions, {});
    expect(options.map((p) => p._id)).toContain(projectId);

    await hr.mutation(api.timeClock.linkWorksite, { rhidGeofenceId: 10, projectId });
    const worksites = await hr.query(api.timeClock.listRhidWorksites, {});
    expect(worksites[0]).toMatchObject({ projectId, projectName: "Edifício Centro" });

    const day = await hr.query(api.timeClock.getDay, { date: "2026-01-14" });
    expect(day.worksites[0]?.projectName).toBe("Edifício Centro");
    const stats = await hr.query(api.timeClock.getMonthStats, { year: 2026, month: 1 });
    expect(stats.byWorksite[0]?.projectName).toBe("Edifício Centro");

    await hr.mutation(api.timeClock.linkWorksite, { rhidGeofenceId: 10, projectId: null });
    expect((await hr.query(api.timeClock.listRhidWorksites, {}))[0]?.projectId).toBeNull();
  });
});

describe("timeClock: permissões", () => {
  test("quem não é do RH não lê nem sincroniza", async () => {
    const { t, engineer } = await seed();
    await seedMirror(t);

    await expect(engineer.query(api.timeClock.getDay, { date: "2026-01-14" })).rejects.toThrow();
    await expect(engineer.query(api.timeClock.listRhidPeople, {})).rejects.toThrow();
    await expect(
      engineer.action(api.rhidSync.syncRange, { from: "2026-01-14" })
    ).rejects.toThrow(/permiss|acesso|Forbidden|Unauthorized/i);
    await expect(t.action(api.rhidSync.syncRange, {})).rejects.toThrow(/authenticated/i);
  });
});

// ---------------------------------------------------------------------------
// Action de sincronização com RHID simulado
// ---------------------------------------------------------------------------

type FetchCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RAW_CHECK_INS = [
  {
    person: { id: 1, name: "Ana Souza", cpf: 12345678909 },
    listAfdMobilePerson: [
      { id: 101, dateTime: "2026-01-14T07:00:00", geofence: GEOFENCE },
      { id: 102, dateTime: "2026-01-14T17:00:00", geofence: GEOFENCE },
    ],
  },
  {
    // Não está no cadastro de ativos (desligado), mas tem marcação.
    person: { id: 7, name: "Zé Antigo" },
    listAfdMobilePerson: [{ id: 701, dateTime: "2026-01-14T08:00:00" }],
  },
];

const RAW_ROSTER = {
  data: [
    { id: 1, name: "Ana Souza", departmentName: "Produção", cpf: 12345678909 },
    { id: 2, name: "Bruno Lima", departmentName: "Produção" },
  ],
};

function installFakeRhid(options: { expireFirstToken?: boolean } = {}) {
  const calls: FetchCall[] = [];
  let logins = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const token = (init?.headers as Record<string, string> | undefined)?.authorization;

    if (url.endsWith("/login.svc/")) {
      const body = JSON.parse(String(init?.body)) as { email: string; password: string };
      if (body.password !== "secret") return jsonResponse({ error: "bad" }, 400);
      logins += 1;
      return jsonResponse({ accessToken: `tok-${logins}` });
    }
    if (options.expireFirstToken && token === "Bearer tok-1") {
      return new Response("DoLoginExpirTok", { status: 400 });
    }
    if (url.endsWith("/person.svc/a_status/ativo")) return jsonResponse(RAW_ROSTER);
    if (url.endsWith("/afd.svc/afd_mobile")) return jsonResponse(RAW_CHECK_INS);
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock, loginCount: () => logins };
}

describe("rhidSync.syncRange", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RHID_EMAIL = "integ@rlp.com";
    process.env.RHID_PASSWORD = "secret";
    process.env.RHID_COMPANY_ID = "3";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ["RHID_EMAIL", "RHID_PASSWORD", "RHID_COMPANY_ID"]) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  test("autentica, baixa cadastro e marcações e grava o espelho", async () => {
    const { hr } = await seed();
    const rhid = installFakeRhid();

    const summary = await hr.action(api.rhidSync.syncRange, {
      from: "2026-01-14",
      to: "2026-01-15",
    });
    expect(summary).toEqual({
      from: "2026-01-14",
      to: "2026-01-15",
      people: 3,
      worksites: 1,
      punches: 3,
      days: 2,
      inserted: 3,
      updated: 0,
      deleted: 0,
      skipped: 0,
    });

    const afd = rhid.calls.find((c) => c.url.endsWith("/afd.svc/afd_mobile"));
    expect(JSON.parse(String(afd?.init?.body))).toMatchObject({
      listCompanies: [3],
      ini: "20260114",
      fim: "20260115",
      fotos: true,
    });
    expect(afd?.init?.headers).toMatchObject({ authorization: "Bearer tok-1" });

    const day = await hr.query(api.timeClock.getDay, { date: "2026-01-14" });
    expect(day.summary).toMatchObject({ total: 3, present: 2, absent: 1 });
    const people = await hr.query(api.timeClock.listRhidPeople, {});
    expect(people.find((p) => p.rhidPersonId === 7)).toMatchObject({
      active: false,
      name: "Zé Antigo",
    });
    expect(people.find((p) => p.rhidPersonId === 2)).toMatchObject({
      active: true,
      department: "Produção",
    });

    const status = await hr.query(api.timeClock.getSyncStatus, {});
    expect(status).toMatchObject({
      configured: true,
      lastSyncStatus: "success",
      lastSyncFrom: "2026-01-14",
      lastSyncTo: "2026-01-15",
      lastSyncPunches: 3,
      lastSyncPeople: 3,
      lastSyncTrigger: "manual",
    });

    // Segunda sync reaproveita o token (sem novo login) e só atualiza.
    const again = await hr.action(api.rhidSync.syncRange, { from: "2026-01-14" });
    expect(rhid.loginCount()).toBe(1);
    expect(again).toMatchObject({ inserted: 0, updated: 3, deleted: 0 });
  });

  test("token expirado força novo login e repete a chamada", async () => {
    const { hr } = await seed();
    const rhid = installFakeRhid({ expireFirstToken: true });

    await hr.action(api.rhidSync.syncRange, { from: "2026-01-14" });
    expect(rhid.loginCount()).toBe(2);
    const rosterCalls = rhid.calls.filter((c) => c.url.endsWith("/person.svc/a_status/ativo"));
    expect(rosterCalls).toHaveLength(2);
    expect(rosterCalls[1]?.init?.headers).toMatchObject({ authorization: "Bearer tok-2" });
    const status = await hr.query(api.timeClock.getSyncStatus, {});
    expect(status.lastSyncStatus).toBe("success");
  });

  test("erro de credencial é registrado no estado da sync", async () => {
    const { hr } = await seed();
    process.env.RHID_PASSWORD = "wrong";
    installFakeRhid();

    await expect(hr.action(api.rhidSync.syncRange, { from: "2026-01-14" })).rejects.toThrow(
      /Credenciais do RHID inválidas/
    );
    const status = await hr.query(api.timeClock.getSyncStatus, {});
    expect(status.lastSyncStatus).toBe("error");
    expect(status.lastSyncError).toMatch(/Credenciais/);
  });

  test("sem credenciais configuradas a action falha com mensagem clara", async () => {
    const { hr } = await seed();
    delete process.env.RHID_EMAIL;
    installFakeRhid();
    await expect(hr.action(api.rhidSync.syncRange, { from: "2026-01-14" })).rejects.toThrow(
      /não configurada/
    );
    const status = await hr.query(api.timeClock.getSyncStatus, {});
    expect(status.configured).toBe(false);
  });

  test("período acima do limite é rejeitado antes de chamar o RHID", async () => {
    const { hr } = await seed();
    const rhid = installFakeRhid();
    await expect(
      hr.action(api.rhidSync.syncRange, { from: "2026-01-01", to: "2026-03-31" })
    ).rejects.toThrow(/Período máximo/);
    expect(rhid.fetchMock).not.toHaveBeenCalled();
  });
});
