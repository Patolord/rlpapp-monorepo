import { describe, expect, it } from "vitest";
import { CATALOG_STALE_MS, catalogSyncState, sinceLabel } from "./catalogSync";

const now = Date.UTC(2026, 10, 5, 12);
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const base = { signedIn: true, error: null, pending: 0, now };

describe("catalogSyncState", () => {
  it("is current for a catalog refreshed today while signed in", () => {
    const s = catalogSyncState({ ...base, fetchedAt: iso(5 * 60_000) });
    expect(s).toMatchObject({ label: "há 5 min", stale: false });
    expect(s.title).toContain("Clique para atualizar");
  });

  it("is out of date when old, never fetched, failed or signed out", () => {
    expect(catalogSyncState({ ...base, fetchedAt: iso(CATALOG_STALE_MS + 1) }).stale).toBe(true);
    expect(catalogSyncState({ ...base, fetchedAt: null })).toMatchObject({
      label: "nunca",
      stale: true,
    });
    const failed = catalogSyncState({ ...base, fetchedAt: iso(60_000), error: "sem conexão" });
    expect(failed.stale).toBe(true);
    expect(failed.title).toContain("sem conexão");
    expect(catalogSyncState({ ...base, signedIn: false, fetchedAt: iso(60_000) }).stale).toBe(true);
  });

  it("mentions proposals waiting to be sent", () => {
    expect(catalogSyncState({ ...base, fetchedAt: iso(0), pending: 2 }).title).toContain(
      "2 propostas aguardando envio",
    );
  });
});

describe("sinceLabel", () => {
  it("reads minutes, hours and days", () => {
    expect(sinceLabel(10_000)).toBe("agora");
    expect(sinceLabel(3 * 3_600_000)).toBe("há 3 h");
    expect(sinceLabel(26 * 3_600_000)).toBe("há 1 dia");
    expect(sinceLabel(72 * 3_600_000)).toBe("há 3 dias");
  });
});
