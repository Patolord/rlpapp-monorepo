import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Saving keeps the takeoff's identity in the company app (its id and where its approved budget
 * was sent): the first save writes an id, later saves and undo keep it, and a copy that is another
 * budget gets a new one. Files and native dialogs are fakes.
 */

const disk = new Map<string, string>();
const savePicks: (string | null)[] = [];
const answers: string[] = [];
const questions: string[] = [];
/** Paths whose write fails (disk full, no permission). */
const failWrites = new Set<string>();

vi.mock("./platform", () => ({
  isTauri: () => true,
  IS_MAC: false,
  MOD: "Ctrl",
  ALT: "Alt",
  mod: (k: string) => `Ctrl+${k}`,
  isEditableTarget: () => false,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown> = {}) => {
    const path = String(args.path);
    switch (cmd) {
      case "write_text":
        if (failWrites.has(path)) throw new Error("permissão negada");
        disk.set(path, String(args.contents));
        return null;
      case "read_text":
        if (!disk.has(path)) throw new Error(`no file ${path}`);
        return disk.get(path);
      case "file_exists":
        return disk.has(path);
      default:
        return null;
    }
  }),
}));
vi.mock("@tauri-apps/api/path", () => ({
  downloadDir: async () => "/downloads",
  tempDir: async () => "/tmp",
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => savePicks.shift() ?? null),
  ask: vi.fn(async () => true),
  message: vi.fn(async (text: string) => {
    questions.push(text);
    return answers.shift() ?? "Cancelar";
  }),
}));

const { useStore } = await import("../store");
const { saveProject } = await import("./files");
const { emptyProject } = await import("./types");

const read = (path: string) => JSON.parse(disk.get(path) ?? "null");
const sentToApp = { obraId: "o1", obraName: "Edifício Centro", obraSlug: "centro", sentAt: 1 };

beforeEach(() => {
  disk.clear();
  savePicks.length = 0;
  answers.length = 0;
  questions.length = 0;
  failWrites.clear();
  useStore.getState().resetProject({ ...emptyProject(), name: "Obra A" }, null);
});

describe("saving the project identity", () => {
  it("writes an id on the first save and keeps it on the next ones", async () => {
    savePicks.push("/obra/a.takeoff.json");
    expect(await saveProject(false)).toBe(true);
    const id = read("/obra/a.takeoff.json").id;
    expect(typeof id).toBe("string");
    expect(useStore.getState().project.id).toBe(id);
    expect(useStore.getState().dirty).toBe(false);

    useStore.getState().setProjectMeta({ name: "Obra A revisada" });
    expect(await saveProject(false)).toBe(true);
    expect(read("/obra/a.takeoff.json")).toMatchObject({ id, name: "Obra A revisada" });
  });

  it("gives a file saved by an older version an id on its next save", async () => {
    const old = { ...emptyProject(), name: "Antiga" };
    disk.set("/obra/antiga.takeoff.json", JSON.stringify(old));
    useStore.getState().resetProject(old, "/obra/antiga.takeoff.json");
    expect(useStore.getState().project.id).toBeUndefined();
    await saveProject(false);
    expect(read("/obra/antiga.takeoff.json").id).toEqual(expect.any(String));
  });

  it("keeps the identity through undo and redo", async () => {
    const s = useStore.getState();
    s.setProjectMeta({ client: "Construtora X" });
    s.setIdentity({ id: "desk-1", sentToApp });
    useStore.getState().undo();
    expect(useStore.getState().project).toMatchObject({ client: "", id: "desk-1", sentToApp });
    useStore.getState().redo();
    expect(useStore.getState().project).toMatchObject({
      client: "Construtora X",
      id: "desk-1",
      sentToApp,
    });
    // setting the identity is not an edit of its own
    expect(useStore.getState().past).toHaveLength(1);
  });

  it("gives the conflict copy ('Salvar como cópia') a new id and no link", async () => {
    useStore.getState().setIdentity({ id: "desk-1", sentToApp });
    savePicks.push("/obra/a.takeoff.json");
    await saveProject(false);
    // another machine saves a newer version of the same file
    disk.set("/obra/a.takeoff.json", JSON.stringify({ ...read("/obra/a.takeoff.json"), x: 1 }));
    useStore.getState().setProjectMeta({ name: "Minha versão" });
    answers.push("Salvar como cópia…");
    savePicks.push("/obra/a (cópia).takeoff.json");
    expect(await saveProject(false)).toBe(true);

    const copy = read("/obra/a (cópia).takeoff.json");
    expect(copy.name).toBe("Minha versão");
    expect(copy.id).toEqual(expect.any(String));
    expect(copy.id).not.toBe("desk-1");
    expect(copy.sentToApp).toBeUndefined();
    expect(read("/obra/a.takeoff.json")).toMatchObject({ id: "desk-1", sentToApp });
    expect(useStore.getState().status).toContain("não está ligada ao orçamento já enviado");
  });

  it("on Save as of a sent budget, asks whether the copy is the same budget", async () => {
    useStore.getState().setIdentity({ id: "desk-1", sentToApp });
    savePicks.push("/obra/a.takeoff.json");
    await saveProject(false);

    answers.push("Mesmo orçamento");
    savePicks.push("/obra/a rev1.takeoff.json");
    await saveProject(true);
    expect(questions.at(-1)).toContain("Edifício Centro");
    expect(read("/obra/a rev1.takeoff.json")).toMatchObject({ id: "desk-1", sentToApp });

    answers.push("Outro orçamento");
    savePicks.push("/obra/b.takeoff.json");
    await saveProject(true);
    const other = read("/obra/b.takeoff.json");
    expect(other.id).not.toBe("desk-1");
    expect(other.sentToApp).toBeUndefined();

    // cancelling writes nothing
    useStore.getState().setIdentity({ id: "desk-1", sentToApp });
    answers.push("Cancelar");
    savePicks.push("/obra/c.takeoff.json");
    expect(await saveProject(true)).toBe(false);
    expect(disk.has("/obra/c.takeoff.json")).toBe(false);
  });

  it("a failed Save as keeps the open takeoff linked to its budget", async () => {
    useStore.getState().setIdentity({ id: "desk-1", sentToApp });
    savePicks.push("/obra/a.takeoff.json");
    await saveProject(false);

    answers.push("Outro orçamento");
    savePicks.push("/protegida/b.takeoff.json");
    failWrites.add("/protegida/b.takeoff.json");
    await expect(saveProject(true)).rejects.toThrow("permissão negada");
    expect(useStore.getState().project).toMatchObject({ id: "desk-1", sentToApp });

    // the next plain save still writes the original file with its link
    useStore.getState().setProjectMeta({ name: "Obra A revisada" });
    await saveProject(false);
    expect(read("/obra/a.takeoff.json")).toMatchObject({ id: "desk-1", sentToApp });
  });

  it("gives an unsent copy its own id without asking", async () => {
    savePicks.push("/obra/a.takeoff.json");
    await saveProject(false);
    const id = read("/obra/a.takeoff.json").id;
    savePicks.push("/obra/b.takeoff.json");
    await saveProject(true);
    expect(questions).toHaveLength(0);
    expect(read("/obra/b.takeoff.json").id).not.toBe(id);
    expect(read("/obra/a.takeoff.json").id).toBe(id);
  });
});
