import { describe, expect, it } from "vitest";
import {
  asksSameBudget,
  asSeparateBudget,
  budgetSummary,
  identityForSave,
  newProjectUid,
  obraBudgetUrl,
  obrasUrl,
  sentToAppLabel,
  withIdentityOf,
  withProjectId,
} from "./appLink";
import { emptyProject, migrateProject, type Project, type SentToApp } from "./types";

const sent: SentToApp = {
  obraId: "obra_1",
  obraName: "Edifício Centro",
  obraSlug: "edificio-centro",
  sentAt: Date.UTC(2026, 10, 1, 17, 3),
  sentBy: "Ana",
};

let n = 0;
const uid = () => `uid-${++n}`;

const linked = (): Project => ({ ...emptyProject(), id: "original", sentToApp: sent });

describe("project id", () => {
  it("is random and long enough not to collide", () => {
    const ids = new Set(Array.from({ length: 200 }, newProjectUid));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.length).toBeGreaterThanOrEqual(32);
  });

  it("is generated once and then kept", () => {
    const p = emptyProject();
    expect(p.id).toBeUndefined();
    const withId = withProjectId(p, uid);
    expect(withId.id).toMatch(/^uid-/);
    expect(withProjectId(withId, uid)).toBe(withId);
  });

  it("survives saving and reopening the file", () => {
    const saved = JSON.parse(JSON.stringify(linked()));
    const reopened = migrateProject(saved);
    expect(reopened.id).toBe("original");
    expect(reopened.sentToApp).toEqual(sent);
  });
});

describe("identity on save", () => {
  it("adds an id to an older file on its first save and keeps it afterwards", () => {
    const old = migrateProject({ ...emptyProject(), id: undefined });
    expect(old.id).toBeUndefined();
    const first = identityForSave(old, "save", false, uid);
    expect(first.id).toBeDefined();
    expect(identityForSave(first, "save", false, uid)).toBe(first);
  });

  it("gives the conflict copy a new id and no link to the sent budget", () => {
    const copy = identityForSave(linked(), "conflictCopy", true, uid);
    expect(copy.id).not.toBe("original");
    expect(copy.id).toBeDefined();
    expect(copy.sentToApp).toBeUndefined();
  });

  it("asks on Save as only when the budget was already sent", () => {
    expect(asksSameBudget(linked(), "saveAs")).toBe(true);
    expect(asksSameBudget(linked(), "save")).toBe(false);
    expect(asksSameBudget(linked(), "conflictCopy")).toBe(false);
    expect(asksSameBudget({ ...emptyProject(), id: "x" }, "saveAs")).toBe(false);
  });

  it("keeps the link when the copy is the same approved budget, drops it otherwise", () => {
    const same = identityForSave(linked(), "saveAs", true, uid);
    expect(same).toMatchObject({ id: "original", sentToApp: sent });
    const other = identityForSave(linked(), "saveAs", false, uid);
    expect(other.id).not.toBe("original");
    expect(other.sentToApp).toBeUndefined();
  });

  it("gives an unsent copy its own id, so the two files never share a budget", () => {
    const copy = identityForSave({ ...emptyProject(), id: "original" }, "saveAs", false, uid);
    expect(copy.id).not.toBe("original");
  });

  it("asSeparateBudget leaves the original untouched", () => {
    const p = linked();
    asSeparateBudget(p, uid);
    expect(p).toMatchObject({ id: "original", sentToApp: sent });
  });
});

describe("withIdentityOf", () => {
  it("carries the identity onto an older snapshot (undo) and drops what the source lacks", () => {
    const before: Project = { ...emptyProject(), name: "antes" };
    const after = withIdentityOf(before, linked());
    expect(after).toMatchObject({ name: "antes", id: "original", sentToApp: sent });
    const unlinked = withIdentityOf(linked(), { ...emptyProject(), id: "novo" });
    expect(unlinked.id).toBe("novo");
    expect("sentToApp" in unlinked).toBe(false);
  });

  it("returns the same object when nothing changes", () => {
    const p = linked();
    expect(withIdentityOf(p, { ...p, name: "outro" })).toBe(p);
  });
});

describe("links and labels", () => {
  it("points at the obra's Orçamento page and the obras list", () => {
    expect(obraBudgetUrl("https://app.rlpeng.com.br", "edificio-centro")).toBe(
      "https://app.rlpeng.com.br/engenharia/obras/edificio-centro/orcamento",
    );
    expect(obraBudgetUrl("http://localhost:3001", "a b")).toBe(
      "http://localhost:3001/engenharia/obras/a%20b/orcamento",
    );
    expect(obrasUrl("https://app.rlpeng.com.br")).toBe(
      "https://app.rlpeng.com.br/engenharia/obras",
    );
  });

  it("says when and where the budget was sent", () => {
    const label = sentToAppLabel(sent);
    expect(label).toMatch(/^Enviado ao app em \d{2}\/\d{2}\/\d{4}/);
    expect(label).toContain("para a obra Edifício Centro (por Ana)");
  });

  it("sums the tabs for the confirmation", () => {
    const sheet = {
      bdi: 1.42,
      extrasPct: 5,
      materialCents: 0,
      laborCents: 0,
      extrasEachCents: 0,
    };
    expect(
      budgetSummary({
        externalId: "x",
        name: "x",
        meta: {
          sheets: [
            { ...sheet, name: "A", totalCents: 1000, proposalCents: 1420 },
            { ...sheet, name: "B", totalCents: 500, proposalCents: 710 },
          ],
        },
        lines: [{ externalLineId: "a", rawDescription: "a", quantity: 1 }],
      }),
    ).toEqual({ tabs: 2, lines: 1, totalCents: 1500, proposalCents: 2130 });
  });
});
