import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addBusinessDays,
  businessDateRange,
  fetchRhidDay,
  getBusinessDate,
  isBusinessDate,
  normalizeRhidDay,
  parseRhidTimestamp,
  RhidError,
} from "./rhid";

const date = "2026-09-08";
const person = { id: 12, name: "Pessoa de teste", companyId: 1, departmentName: "Obra" };
const roster = { data: [person] };
const record = {
  id: 91,
  idPerson: 12,
  companyId: 1,
  dateTime: "2026-09-08T08:30:00-03:00",
  excluded: false,
  Tipo: 7,
  approvalStatus: 0,
};
const attendance = [{ person, listAfdMobilePerson: [record] }];
const credentials = { email: "integration@example.invalid", password: "fixture-password", companyId: 1, date };

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RHiD timestamps and calendar days", () => {
  it("uses São Paulo at midnight while respecting explicit offsets", () => {
    expect(getBusinessDate(parseRhidTimestamp("2026-09-08T02:59:59Z"))).toBe("2026-09-07");
    expect(getBusinessDate(parseRhidTimestamp("2026-09-08T03:00:00Z"))).toBe(date);
    expect(parseRhidTimestamp("2026-09-08T00:00:00")).toBe(Date.parse("2026-09-08T03:00:00Z"));
    expect(parseRhidTimestamp("2026-09-08T00:00:00-0400")).toBe(Date.parse("2026-09-08T04:00:00Z"));
    expect(parseRhidTimestamp("2026-09-08T04:00:00+01:00")).toBe(Date.parse("2026-09-08T03:00:00Z"));
    expect(parseRhidTimestamp("2026-09-08 08:00:00.1234567")).toBe(Date.parse("2026-09-08T11:00:00.123Z"));
  });

  it("uses historical São Paulo timezone rules and rejects ambiguous/nonexistent wall times", () => {
    expect(parseRhidTimestamp("2018-12-01T08:00:00")).toBe(Date.parse("2018-12-01T10:00:00Z"));
    expect(() => parseRhidTimestamp("2018-11-04T00:30:00")).toThrow(RhidError);
    expect(() => parseRhidTimestamp("2019-02-16T23:30:00")).toThrow(RhidError);
    expect(parseRhidTimestamp("2019-02-16T23:30:00-02:00")).toBe(Date.parse("2019-02-17T01:30:00Z"));
  });

  it.each([
    "2026-02-30T08:00:00", "2026-09-08T24:00:00", "2026-09-08T12:60:00", "2026-09-08T12:00:60",
    "2026-09-08T00:00:00+15:00", "2026-09-08T00:00:00-03:99", "2026-09-08", "not a date",
  ])("rejects invalid timestamp %s instead of normalizing it", (value) => {
    expect(() => parseRhidTimestamp(value)).toThrow(RhidError);
  });

  it("makes inclusive date ranges independent of machine timezone and weekday", () => {
    expect(isBusinessDate("2024-02-29")).toBe(true);
    expect(isBusinessDate("2026-02-29")).toBe(false);
    expect(isBusinessDate("2026-9-8")).toBe(false);
    expect(addBusinessDays("2026-09-07", -89)).toBe("2026-06-10");
    expect(addBusinessDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(businessDateRange("2026-09-05", "2026-09-07")).toEqual(["2026-09-05", "2026-09-06", "2026-09-07"]);
    expect(() => businessDateRange("2026-09-08", "2026-09-07")).toThrow(RhidError);
    expect(() => businessDateRange("2025-01-01", "2026-09-07")).toThrow(RhidError);
  });
});

describe("RHiD normalization", () => {
  it("keeps raw punch type and approval status, including zero GPS", () => {
    const normalized = normalizeRhidDay(roster, [{ person, listAfdMobilePerson: [{
      ...record, latitude: 0, longitude: 0,
      geofence: { id: 3, name: "Local de teste", latitude: 0, longitude: 0, radius: 100, excluded: false },
      idGeofence: 3,
      photoURL: "https://rhid.com.br/example-test-image.jpg",
    }] }], 1, date);
    expect(normalized.punches).toEqual([{
      sourceId: "12-91", rhidEmployeeId: 12, sourceName: person.name,
      occurredAt: Date.parse(record.dateTime), sourceTimestamp: record.dateTime, businessDate: date,
      latitude: 0, longitude: 0, geofenceSourceId: "3", excluded: false,
      approvalStatus: 0, rawType: 7, photoUrl: "https://rhid.com.br/example-test-image.jpg",
    }]);
    expect(normalized.geofences[0]).toEqual({ sourceId: "3", sourceName: "Local de teste", latitude: 0, longitude: 0, radius: 100, excluded: false });
    expect(normalized.coverage).toBe("unverified");
  });

  it("preserves historical punches for people missing from the current active roster", () => {
    const normalized = normalizeRhidDay({ data: [] }, attendance, 1, date);
    expect(normalized.employees[0]).toMatchObject({ rhidEmployeeId: 12, sourceName: person.name, active: false });
    expect(normalized.punches).toHaveLength(1);
    expect(normalized.punches[0]).not.toHaveProperty("latitude");
    expect(normalized.punches[0]).not.toHaveProperty("geofenceSourceId");
    expect(normalized.punches[0]).not.toHaveProperty("photoUrl");
  });

  it("never imports unrelated roster identities without company scope", () => {
    const unscopedRoster = { data: [
      { id: 12, name: person.name, department: "Obra" },
      { id: 13, name: "Funcionário sem empresa", department: "Obra" },
    ] };
    const normalized = normalizeRhidDay(unscopedRoster, attendance, 1, date);
    expect(normalized.employees).toEqual([{
      sourceId: "12", rhidEmployeeId: 12, sourceName: person.name, department: "Obra", active: true,
    }]);
    expect(normalized.warnings).toHaveLength(1);
    expect(normalizeRhidDay(unscopedRoster, [], 1, date).employees).toEqual([]);
  });

  it("keeps all extra punches and explicit exclusions without inferring lunch or exit", () => {
    const records = [6, 2, 4, 1, 3, 5].map((hour) => ({
      ...record, id: hour, dateTime: `2026-09-08T0${hour}:00:00-03:00`, excluded: hour === 3, Tipo: undefined,
    }));
    const normalized = normalizeRhidDay(roster, [{ person, listAfdMobilePerson: records }], 1, date);
    expect(normalized.punches.map((punch) => punch.sourceId)).toEqual(["12-1", "12-2", "12-3", "12-4", "12-5", "12-6"]);
    expect(normalized.punches[2].excluded).toBe(true);
    expect(normalized.punches.every((punch) => !("rawType" in punch))).toBe(true);
  });

  it.each([
    {}, { data: null }, { data: [{}] }, { data: [{ id: 12 }] },
  ])("rejects a malformed employee roster instead of returning an empty one", (badRoster) => {
    expect(() => normalizeRhidDay(badRoster, attendance, 1, date)).toThrow(RhidError);
  });

  it.each([
    {}, [{}], [{ person }], [{ listAfdMobilePerson: [] }], [{ person, listAfdMobilePerson: null }],
    [{ person, listAfdMobilePerson: [{ ...record, excluded: undefined }] }],
    [{ person, listAfdMobilePerson: [{ ...record, idPerson: 999 }] }],
    [{ person, listAfdMobilePerson: [{ ...record, dateTime: "2026-02-31T08:00:00" }] }],
  ])("rejects malformed attendance without silently losing records", (badAttendance) => {
    expect(() => normalizeRhidDay(roster, badAttendance, 1, date)).toThrow(RhidError);
  });

  it("deduplicates identical source IDs and rejects conflicting versions", () => {
    expect(normalizeRhidDay(roster, [...attendance, ...attendance], 1, date).punches).toHaveLength(1);
    expect(() => normalizeRhidDay(roster, [...attendance, { person, listAfdMobilePerson: [{ ...record, excluded: true }] }], 1, date)).toThrow(RhidError);
  });

  it("flags out-of-day and foreign-company records without importing them into this day", () => {
    const normalized = normalizeRhidDay({ data: [person, { id: 13, name: "Outra empresa", companyId: 2 }] }, [{ person, listAfdMobilePerson: [
      record, { ...record, id: 92, dateTime: "2026-09-08T02:59:59Z" }, { ...record, id: 93, companyId: 2 },
    ] }], 1, date);
    expect(normalized.punches).toHaveLength(1);
    expect(normalized.employees).toHaveLength(1);
    expect(normalized.coverage).toBe("partial");
    expect(normalized.warnings).toHaveLength(2);
  });

  it("omits an invalid optional photo without losing the attendance record", () => {
    const normalized = normalizeRhidDay(roster, [{ person, listAfdMobilePerson: [{ ...record, photoURL: "file:///private/image.jpg" }] }], 1, date);
    expect(normalized.punches).toHaveLength(1);
    expect(normalized.punches[0]).not.toHaveProperty("photoUrl");
    expect(normalized.warnings).toHaveLength(1);
  });

  it("accepts zero geofence sentinels without discarding valid coordinates", () => {
    const normalized = normalizeRhidDay(roster, [{ person, listAfdMobilePerson: [{
      ...record, idGeofence: "0", latitude: 0, longitude: 0,
    }] }], 1, date);
    expect(normalized.punches[0]).not.toHaveProperty("geofenceSourceId");
    expect(normalized.punches[0]).toMatchObject({ latitude: 0, longitude: 0 });
  });

  it("accepts empty responses as unverified, never as verified complete", () => {
    expect(normalizeRhidDay({ data: [] }, [], 1, date)).toEqual({
      employees: [], geofences: [], punches: [], coverage: "unverified", warnings: [],
    });
  });
});

describe("RHiD transport and authentication", () => {
  it("logs in then requests the active roster and an unfiltered company day", async () => {
    const fetchMock = mockFetch(json({ accessToken: "fixture-token" }), json(roster), json(attendance));
    const result = await fetchRhidDay({ ...credentials, domain: "tenant-example" });
    expect(result.token).toBe("fixture-token");
    expect(result.punches).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://rhid.com.br/v2/login.svc/");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ email: credentials.email, password: credentials.password, domain: "tenant-example" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://rhid.com.br/v2/customerdb/person.svc/a_status/ativo");
    expect(fetchMock.mock.calls[2][0]).toBe("https://rhid.com.br/v2/customerdb/afd.svc/afd_mobile");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      listPeople: [], listCompanies: [1], listDepartments: [], ini: "20260908", fim: "20260908", status: 0, fotos: true,
    });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ cache: "no-store", redirect: "error", headers: { authorization: "Bearer fixture-token" } });
  });

  it("reuses a supplied token without login", async () => {
    const fetchMock = mockFetch(json(roster), json(attendance));
    expect((await fetchRhidDay({ ...credentials, token: "existing-token" })).token).toBe("existing-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 400])("renews once for vendor expiration status %s", async (status) => {
    const fetchMock = mockFetch(
      new Response(status === 400 ? "DoLoginExpirTok" : "Unauthorized", { status }),
      json({ accessToken: "renewed-token" }), json(roster), json(attendance),
    );
    expect((await fetchRhidDay({ ...credentials, token: "expired-token" })).token).toBe("renewed-token");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ headers: { authorization: "Bearer renewed-token" } });
  });

  it("renews an expired token on the punch request as well", async () => {
    const fetchMock = mockFetch(json(roster), new Response("DoLoginExpirTok", { status: 400 }), json({ accessToken: "new-token" }), json(attendance));
    expect((await fetchRhidDay({ ...credentials, token: "old-token" })).token).toBe("new-token");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][0]).toBe(fetchMock.mock.calls[1][0]);
  });

  it("shares a single renewal budget across both source endpoints", async () => {
    const fetchMock = mockFetch(new Response("Unauthorized", { status: 401 }), json({ accessToken: "new-token" }), json(roster), new Response("Unauthorized", { status: 401 }));
    await expect(fetchRhidDay({ ...credentials, token: "old-token" })).rejects.toMatchObject({ kind: "authentication" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("stops when the renewed token is rejected", async () => {
    const fetchMock = mockFetch(new Response("Unauthorized", { status: 401 }), json({ accessToken: "new-token" }), new Response("Unauthorized", { status: 401 }));
    await expect(fetchRhidDay({ ...credentials, token: "old-token" })).rejects.toMatchObject({ kind: "authentication" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([429, 500, 503])("classifies HTTP %s as transient without stacking retries", async (status) => {
    const fetchMock = mockFetch(new Response("Private vendor error body", { status }));
    await expect(fetchRhidDay({ ...credentials, token: "old-token" })).rejects.toMatchObject({ kind: "transient" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifies login rejection and expired passwords as authentication failures", async () => {
    mockFetch(new Response("private failure", { status: 400 }));
    await expect(fetchRhidDay(credentials)).rejects.toMatchObject({ kind: "authentication" });
    mockFetch(json({ accessToken: "token", expiredPassword: true }));
    await expect(fetchRhidDay(credentials)).rejects.toMatchObject({ kind: "authentication" });
  });

  it("rejects a malformed login or HTTP-success response", async () => {
    mockFetch(json({ token: "wrong-field" }));
    await expect(fetchRhidDay(credentials)).rejects.toMatchObject({ kind: "invalid_response" });
    mockFetch(new Response("<html>login</html>", { status: 200 }));
    await expect(fetchRhidDay({ ...credentials, token: "token" })).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("fails invalid inputs before any network request", async () => {
    const fetchMock = mockFetch();
    await expect(fetchRhidDay({ ...credentials, date: "2026-02-30" })).rejects.toMatchObject({ kind: "invalid_response" });
    await expect(fetchRhidDay({ ...credentials, companyId: 0 })).rejects.toMatchObject({ kind: "invalid_response" });
    await expect(fetchRhidDay({ ...credentials, password: "" })).rejects.toMatchObject({ kind: "authentication" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts hung requests and classifies the timeout as transient", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const request = fetchRhidDay({ ...credentials, token: "token" });
    const assertion = expect(request).rejects.toMatchObject({ kind: "transient" });
    await vi.advanceTimersByTimeAsync(25_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
