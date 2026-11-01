import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { emptyProject, type Item, type Project } from "../types";
import type { PublishArgs, PublishObra, PublishOptions, PublishResult } from "./convex";
import {
  defaultObraId,
  describePublishError,
  FORBIDDEN_MESSAGE,
  loadPublishOptions,
  type PublishClient,
  publishArgs,
  resultCounts,
  sendApprovedBudget,
} from "./publish";
import { SignedOutError } from "./session";

// session.ts reaches for Tauri at call time only; nothing here signs in
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const obraId = (s: string) => s as Id<"projects">;

const obra = (id: string, name = id): PublishObra => ({
  _id: obraId(id),
  name,
  slug: `${id}-slug`,
  legacyNumber: null,
  status: null,
  archived: false,
});

const item = (over: Partial<Item> & { id: string }): Item => ({
  name: over.id,
  kind: "count",
  color: "#fff",
  group: "Bocas de Ar",
  materialPrice: 100,
  laborPrice: 10,
  wastePct: 0,
  manualQty: 2,
  ...over,
});

function project(over: Partial<Project> = {}): Project {
  return {
    ...emptyProject(),
    id: "desk-1",
    name: "Edifício Centro",
    proposalNumber: "123/26",
    client: "Construtora X",
    sectionsBy: "grupo",
    items: [item({ id: "grelha", name: "Grelha 300x200" })],
    ...over,
  };
}

const okResult = (over: Partial<PublishResult> = {}): PublishResult => ({
  takeoffId: "t1" as PublishResult["takeoffId"],
  created: true,
  inserted: 1,
  updated: 0,
  unchanged: 0,
  removed: 0,
  kept: [],
  unknownMaterialIds: [],
  ...over,
});

/** A fake company app: records what it was sent, answers or throws as told. */
function fakeClient(answer: {
  options?: () => Promise<PublishOptions>;
  publish?: (args: PublishArgs) => Promise<PublishResult>;
}) {
  const sent: PublishArgs[] = [];
  const asked: (string | undefined)[] = [];
  const client: PublishClient = {
    options: async (externalId) => {
      asked.push(externalId);
      return (
        answer.options?.() ??
        Promise.resolve({ canPublish: true, projects: [obra("o1")], current: null })
      );
    },
    publish: async (args) => {
      sent.push(args);
      return answer.publish?.(args) ?? okResult();
    },
  };
  return { client, sent, asked };
}

describe("payload", () => {
  it("uses the project's id as externalId and the chosen obra as projectId", () => {
    const args = publishArgs(project(), obra("o1"));
    expect(args.externalId).toBe("desk-1");
    expect(args.projectId).toBe("o1");
    expect(args.meta).toMatchObject({ proposalNumber: "123/26", client: "Construtora X" });
    expect(args.lines).toHaveLength(1);
  });

  it("refuses a project without an id", () => {
    expect(() => publishArgs(project({ id: undefined }), obra("o1"))).toThrow("id");
  });
});

describe("sendApprovedBudget", () => {
  it("publishes and returns what to record in the file", async () => {
    const { client, sent } = fakeClient({});
    const out = await sendApprovedBudget({
      client,
      signedIn: true,
      project: project(),
      obra: obra("o1", "Edifício Centro"),
      userName: "Ana",
      now: () => 1234,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ externalId: "desk-1", projectId: "o1" });
    expect(out).toEqual({
      ok: true,
      value: {
        result: okResult(),
        sentToApp: {
          obraId: "o1",
          obraName: "Edifício Centro",
          obraSlug: "o1-slug",
          sentAt: 1234,
          sentBy: "Ana",
        },
      },
    });
  });

  it("does not call the app when signed out", async () => {
    const { client, sent } = fakeClient({});
    const out = await sendApprovedBudget({
      client,
      signedIn: false,
      project: project(),
      obra: obra("o1"),
    });
    expect(sent).toHaveLength(0);
    expect(out).toMatchObject({ ok: false, error: { code: "SIGNED_OUT" } });
  });

  it("stops a budget in another currency before sending", async () => {
    const { client, sent } = fakeClient({});
    const out = await sendApprovedBudget({
      client,
      signedIn: true,
      project: project({ currency: "USD" }),
      obra: obra("o1"),
    });
    expect(sent).toHaveLength(0);
    expect(out).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_CURRENCY" } });
    if (!out.ok) expect(out.error.message).toContain("reais");
  });

  it("shows the backend's coded refusals as they are", async () => {
    const { client } = fakeClient({
      publish: () =>
        Promise.reject(
          new ConvexError({ code: "PROJECT_NOT_FOUND", message: "Obra não encontrada no app" }),
        ),
    });
    const out = await sendApprovedBudget({
      client,
      signedIn: true,
      project: project(),
      obra: obra("o1"),
    });
    expect(out).toEqual({
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "Obra não encontrada no app" },
    });
  });

  it("flags a revoked session so the app can drop it", async () => {
    const { client } = fakeClient({ publish: () => Promise.reject(new SignedOutError()) });
    const out = await sendApprovedBudget({
      client,
      signedIn: true,
      project: project(),
      obra: obra("o1"),
    });
    expect(out).toMatchObject({ ok: false, error: { code: "SIGNED_OUT", revoked: true } });
  });
});

describe("loadPublishOptions", () => {
  it("asks about this takeoff's id and returns the obras", async () => {
    const { client, asked } = fakeClient({});
    const out = await loadPublishOptions(client, true, "desk-1");
    expect(asked).toEqual(["desk-1"]);
    expect(out).toMatchObject({ ok: true, value: { projects: [{ _id: "o1" }] } });
  });

  it("explains a missing permission instead of an empty list", async () => {
    const { client } = fakeClient({
      options: async () => ({ canPublish: false, projects: [], current: null }),
    });
    expect(await loadPublishOptions(client, true, undefined)).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: FORBIDDEN_MESSAGE },
    });
  });

  it("needs a signed-in account", async () => {
    const { client, asked } = fakeClient({});
    const out = await loadPublishOptions(client, false, "desk-1");
    expect(asked).toEqual([]);
    expect(out).toMatchObject({ ok: false, error: { code: "SIGNED_OUT" } });
  });

  it("reports a network failure as offline", async () => {
    const { client } = fakeClient({ options: () => Promise.reject(new TypeError("fetch failed")) });
    expect(await loadPublishOptions(client, true, "x")).toMatchObject({
      ok: false,
      error: { code: "OFFLINE" },
    });
  });
});

describe("defaultObraId", () => {
  const options = (current: string | null): PublishOptions => ({
    canPublish: true,
    projects: [obra("o1"), obra("o2")],
    current: current
      ? {
          takeoffId: "t1" as PublishResult["takeoffId"],
          projectId: obraId(current),
          projectName: current,
          projectSlug: current,
          publishedAt: 1,
          publishedByName: null,
        }
      : null,
  });
  const sentTo = (id: string): Project =>
    project({ sentToApp: { obraId: id, obraName: id, sentAt: 1 } });

  it("starts on the obra the file was sent to", () => {
    expect(defaultObraId(sentTo("o2"), options("o1"))).toBe("o2");
  });

  it("falls back to where the app has this takeoff", () => {
    expect(defaultObraId(project(), options("o1"))).toBe("o1");
  });

  it("chooses nothing when that obra is no longer listed, or there is none", () => {
    expect(defaultObraId(sentTo("gone"), options(null))).toBeNull();
    expect(defaultObraId(project(), options(null))).toBeNull();
    expect(defaultObraId(project(), null)).toBeNull();
  });
});

describe("describePublishError", () => {
  it("maps permission refusals (readable in development) to FORBIDDEN", () => {
    expect(describePublishError(new Error("Acesso restrito à área de engenharia"))).toEqual({
      code: "FORBIDDEN",
      message: FORBIDDEN_MESSAGE,
    });
    expect(describePublishError(new ConvexError({ code: "FORBIDDEN" })).code).toBe("FORBIDDEN");
  });

  it("explains a redacted production error with its request id", () => {
    const e = describePublishError(new Error("[Request ID: abc123] Server Error"));
    expect(e.code).toBe("UNKNOWN");
    expect(e.message).toContain("abc123");
  });

  it("keeps the message of a validation refusal", () => {
    expect(
      describePublishError(
        new ConvexError({ code: "INVALID_BUDGET", message: "Linha repetida: x" }),
      ),
    ).toEqual({ code: "INVALID_BUDGET", message: "Linha repetida: x" });
  });
});

describe("resultCounts", () => {
  it("counts the lines in pt-BR", () => {
    expect(resultCounts(okResult({ inserted: 1, updated: 2, removed: 0, unchanged: 3 }))).toBe(
      "1 nova · 2 atualizadas · 0 removidas · 3 sem mudança",
    );
  });
});
