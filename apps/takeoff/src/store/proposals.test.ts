import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proposalFailure } from "../lib/account/convex";
import { emptyCatalogStore } from "../lib/catalog";
import { emptyProject } from "../lib/types";
import { useStore } from "./index";

/** The catalog is written to localStorage outside Tauri: keep it in memory here. */
const storage = new Map<string, string>();
vi.stubGlobal("window", {});
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

vi.mock("../lib/account/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/account/session")>()),
  isSignedIn: () => true,
}));

const send = vi.hoisted(() => vi.fn());
vi.mock("../lib/account/convex", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/account/convex")>()),
  sendProposalAsUser: send,
}));

describe("queued material proposals", () => {
  beforeEach(() => {
    send.mockReset();
    useStore.setState({
      catalog: emptyCatalogStore(),
      project: {
        ...emptyProject(),
        items: [
          {
            id: "i1",
            name: "Grelha 400x200",
            kind: "count",
            color: "#000",
            group: "Bocas de Ar",
            materialPrice: 120,
            laborPrice: 0,
            wastePct: 0,
          },
        ],
      },
      status: null,
    });
  });

  it("stay queued when the signed-in account has only the takeoff access", async () => {
    // the server's answer to an account without engenharia.write or compras.write
    send.mockResolvedValue(
      proposalFailure(
        new ConvexError({ code: "FORBIDDEN", message: "Acesso restrito à engenharia ou compras" }),
      ),
    );
    await useStore.getState().proposeItemToCompany("i1");
    const { catalog, status } = useStore.getState();
    expect(send).toHaveBeenCalledTimes(1);
    expect(catalog.outbox).toHaveLength(1);
    expect(catalog.outbox[0].lastError).toMatch(/permissão/);
    expect(status).toMatch(/não enviado.*permissão/);
  });

  it("leave the outbox once accepted", async () => {
    send.mockResolvedValue({
      kind: "sent",
      result: { outcome: "created", materialId: "m1", sku: "MAT-000001", mergedInto: null },
    });
    await useStore.getState().proposeItemToCompany("i1");
    expect(useStore.getState().catalog.outbox).toEqual([]);
    expect(useStore.getState().project.items[0].catalogId).toBe("m1");
  });
});
