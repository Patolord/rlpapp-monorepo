import { describe, expect, test } from "vitest";
import {
  aggregateManDays,
  brtWallToInstant,
  derivePosition,
  enumerateDateKeys,
  formatDateForRhid,
  isExpiredTokenError,
  liveStatusForKind,
  monthRange,
  normalizeCheckIns,
  normalizeCpf,
  normalizeRoster,
  parseRhidDateTime,
  punchKindForSequence,
  summarizeDays,
  toBrtDateKey,
  toBrtTimeLabel,
  type RhidEmployeeCheckIn,
} from "../convex/lib/rh/rhid";

describe("RHID lib: datas", () => {
  test("datas são interpretadas no relógio de Brasília (UTC-3)", () => {
    // 23:30 em Brasília de 14/01 = 02:30Z de 15/01: o dia civil deve ser 14/01.
    const lateNight = brtWallToInstant(2026, 1, 14, 23, 30);
    expect(new Date(lateNight).toISOString()).toBe("2026-01-15T02:30:00.000Z");
    expect(toBrtDateKey(lateNight)).toBe("2026-01-14");
    expect(toBrtTimeLabel(lateNight)).toBe("23:30");
  });

  test("parseRhidDateTime aceita os formatos do RHID", () => {
    const local = parseRhidDateTime("2026-01-14T07:03:12");
    expect(local?.date).toBe("2026-01-14");
    expect(local?.timeLabel).toBe("07:03");
    expect(local?.punchedAt).toBe(brtWallToInstant(2026, 1, 14, 7, 3, 12));

    const zoned = parseRhidDateTime("2026-01-14T10:03:12Z");
    expect(zoned?.timeLabel).toBe("07:03");

    const dotnet = parseRhidDateTime("/Date(1768374192000-0300)/");
    expect(dotnet?.punchedAt).toBe(1768374192000);

    const fallback = parseRhidDateTime("not a date", "14/01/2026 17:45:00");
    expect(fallback?.date).toBe("2026-01-14");
    expect(fallback?.timeLabel).toBe("17:45");

    expect(parseRhidDateTime(undefined, null)).toBeNull();
    expect(parseRhidDateTime("", "")).toBeNull();
  });

  test("formatDateForRhid, monthRange e enumerateDateKeys", () => {
    expect(formatDateForRhid("2026-01-14")).toBe("20260114");
    expect(() => formatDateForRhid("14/01/2026")).toThrow(/inválida/);
    expect(monthRange(2024, 2)).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(() => monthRange(2024, 13)).toThrow(/Mês/);
    expect(enumerateDateKeys("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
    expect(() => enumerateDateKeys("2026-02-02", "2026-01-30")).toThrow();
  });

  test("isExpiredTokenError", () => {
    expect(isExpiredTokenError(401, "")).toBe(true);
    expect(isExpiredTokenError(400, '{"error":"DoLoginExpirTok"}')).toBe(true);
    expect(isExpiredTokenError(400, "bad request")).toBe(false);
    expect(isExpiredTokenError(500, "DoLoginExpirTok")).toBe(false);
  });
});

describe("RHID lib: normalização", () => {
  test("normalizeCpf restaura zeros à esquerda e descarta lixo", () => {
    expect(normalizeCpf(1234567890)).toBe("01234567890");
    expect(normalizeCpf("123.456.789-09")).toBe("12345678909");
    expect(normalizeCpf("000")).toBeUndefined();
    expect(normalizeCpf("123456789012")).toBeUndefined();
    expect(normalizeCpf(null)).toBeUndefined();
  });

  test("punchKindForSequence", () => {
    expect([0, 1, 2, 3, 7].map(punchKindForSequence)).toEqual([
      "entrada",
      "almoco_saida",
      "almoco_retorno",
      "saida",
      "saida",
    ]);
  });

  test("normalizeCheckIns ordena, sequencia por pessoa/dia e coleta obras", () => {
    const geofence = {
      id: 10,
      name: "Obra Centro",
      latitude: -23.55,
      longitude: -46.63,
      radius: 150,
    };
    const data: RhidEmployeeCheckIn[] = [
      {
        person: { id: 1, name: "Ana Souza", cpf: 1234567890 },
        listAfdMobilePerson: [
          // Fora de ordem de propósito.
          { id: 103, dateTime: "2026-01-14T17:02:00", geofence, latitude: -23.5501, longitude: -46.6301 },
          { id: 101, dateTime: "2026-01-14T07:00:00", geofence, latitude: -23.55, longitude: -46.63, photoURL: "https://x/1.jpg" },
          { id: 102, dateTime: "2026-01-14T12:00:00", geofence, latitude: 0, longitude: 0 },
          { id: 104, dateTime: "2026-01-15T07:10:00", geofence: null },
          { id: 105, dateTime: "2026-01-15T08:00:00", excluded: true },
          { id: 106, dateTime: "???" },
        ],
      },
      { person: null, listAfdMobilePerson: [] },
      { person: { id: 2, name: "  " }, listAfdMobilePerson: null },
    ];

    const result = normalizeCheckIns(data);
    expect(result.skipped).toBe(1);
    expect(result.people).toEqual([
      { rhidPersonId: 1, name: "Ana Souza", cpf: "01234567890" },
    ]);
    expect(result.worksites).toEqual([
      { rhidGeofenceId: 10, name: "Obra Centro", latitude: -23.55, longitude: -46.63, radius: 150 },
    ]);

    const day14 = result.punches.filter((p) => p.date === "2026-01-14");
    expect(day14.map((p) => [p.rhidRecordId, p.sequence, p.kind, p.timeLabel])).toEqual([
      [101, 0, "entrada", "07:00"],
      [102, 1, "almoco_saida", "12:00"],
      [103, 2, "almoco_retorno", "17:02"],
    ]);
    // Coordenadas 0/0 são "sem GPS".
    expect(day14[1]?.latitude).toBeUndefined();
    expect(day14[0]?.photoUrl).toBe("https://x/1.jpg");
    expect(day14[0]?.rhidGeofenceId).toBe(10);

    const day15 = result.punches.filter((p) => p.date === "2026-01-15");
    expect(day15).toHaveLength(1);
    expect(day15[0]?.sequence).toBe(0);
    expect(day15[0]?.kind).toBe("entrada");
    expect(day15[0]?.rhidGeofenceId).toBeUndefined();
  });

  test("normalizeRoster aceita envelope { data } e campos variados", () => {
    const people = normalizeRoster({
      data: [
        { id: 1, Name: "João Lima", departmentName: "Produção", CPF: "12345678909" },
        { id: 2, nome: "Maria", department: "Escritório" },
        { id: 3, name: "Excluído", excluded: true },
        { id: "x", name: "Sem id" },
        { id: 1, name: "João Lima (dup)" },
      ],
    });
    expect(people).toEqual([
      { rhidPersonId: 1, name: "João Lima (dup)", cpf: undefined, department: undefined },
      { rhidPersonId: 2, name: "Maria", cpf: undefined, department: "Escritório" },
    ]);
    expect(normalizeRoster([{ id: 7, name: "Lista direta" }])).toHaveLength(1);
    expect(normalizeRoster(null)).toEqual([]);
  });

  test("summarizeDays usa a obra da primeira marcação com geofence", () => {
    const { punches } = normalizeCheckIns([
      {
        person: { id: 1, name: "Ana" },
        listAfdMobilePerson: [
          { id: 1, dateTime: "2026-01-14T07:00:00" },
          {
            id: 2,
            dateTime: "2026-01-14T12:00:00",
            geofence: { id: 5, name: "Obra B", latitude: -1, longitude: -2, radius: 10 },
          },
          { id: 3, dateTime: "2026-01-14T17:00:00" },
        ],
      },
    ]);
    const [summary] = summarizeDays(punches);
    expect(summary).toMatchObject({
      date: "2026-01-14",
      rhidPersonId: 1,
      rhidGeofenceId: 5,
      worksiteName: "Obra B",
      punchCount: 3,
      lastKind: "almoco_retorno",
    });
    expect(summary?.firstPunchAt).toBe(brtWallToInstant(2026, 1, 14, 7));
    expect(summary?.lastPunchAt).toBe(brtWallToInstant(2026, 1, 14, 17));
  });
});

describe("RHID lib: posição atual", () => {
  test("derivePosition usa a última marcação e a última cerca conhecida", () => {
    const { punches } = normalizeCheckIns([
      {
        person: { id: 1, name: "Ana" },
        listAfdMobilePerson: [
          {
            id: 1,
            dateTime: "2026-01-14T07:00:00",
            geofence: { id: 5, name: "Obra B", latitude: -1, longitude: -2, radius: 10 },
          },
          { id: 2, dateTime: "2026-01-14T12:00:00" },
        ],
      },
    ]);
    const position = derivePosition(punches);
    expect(position.status).toBe("lunch");
    expect(position.last?.rhidRecordId).toBe(2);
    expect(position.worksiteId).toBe(5);
    expect(position.worksiteName).toBe("Obra B");
    expect(position.locationExact).toBe(false);

    expect(derivePosition([]).status).toBe("absent");
    expect(derivePosition([punches[0]!])).toMatchObject({ status: "on_site", locationExact: true });
    expect(
      ["entrada", "almoco_saida", "almoco_retorno", "saida", null].map((k) =>
        liveStatusForKind(k as never)
      )
    ).toEqual(["on_site", "lunch", "on_site", "left", "absent"]);
  });
});

describe("RHID lib: homem-dia", () => {
  test("aggregateManDays conta 1 por pessoa/dia e agrupa por obra", () => {
    const result = aggregateManDays([
      { date: "2026-01-05", rhidPersonId: 1, personName: "Ana", rhidGeofenceId: 10, worksiteName: "Centro" },
      // Duplicata do mesmo dia é ignorada.
      { date: "2026-01-05", rhidPersonId: 1, personName: "Ana", rhidGeofenceId: 11, worksiteName: "Norte" },
      { date: "2026-01-06", rhidPersonId: 1, personName: "Ana", rhidGeofenceId: 11, worksiteName: "Norte" },
      { date: "2026-01-05", rhidPersonId: 2, personName: "Bruno", rhidGeofenceId: 10, worksiteName: "Centro" },
      { date: "2026-01-07", rhidPersonId: 2, personName: "Bruno" },
    ]);

    expect(result.totalManDays).toBe(4);
    expect(result.uniquePeople).toBe(2);
    expect(result.uniqueWorksites).toBe(2);
    expect(result.byDate).toEqual([
      { date: "2026-01-05", presentCount: 2 },
      { date: "2026-01-06", presentCount: 1 },
      { date: "2026-01-07", presentCount: 1 },
    ]);

    const ana = result.byPerson.find((p) => p.rhidPersonId === 1);
    expect(ana?.totalDays).toBe(2);
    expect(ana?.worksites.map((w) => [w.rhidGeofenceId, w.days])).toEqual([
      [10, 1],
      [11, 1],
    ]);

    const centro = result.byWorksite.find((w) => w.rhidGeofenceId === 10);
    expect(centro?.totalManDays).toBe(2);
    expect(centro?.uniquePeople).toBe(2);
    const semObra = result.byWorksite.find((w) => w.rhidGeofenceId === undefined);
    expect(semObra?.people).toEqual([{ rhidPersonId: 2, personName: "Bruno", days: 1 }]);
  });
});
