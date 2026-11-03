import { describe, expect, it } from "vitest";
import {
  contentHash,
  copyPathFor,
  resolveDrawingPaths,
  unportableDrawings,
  withRelativePaths,
} from "./projectFile";
import { emptyProject, type Project } from "./types";

const WIN_FILE = "C:\\Users\\ana\\OneDrive - RLP\\Obras\\1234\\Orçamento\\Clima.takeoff.json";
const MAC_FILE =
  "/Users/rodrigo/Library/CloudStorage/OneDrive-RLP/Obras/1234/Orçamento/Clima.takeoff.json";

function project(): Project {
  return {
    ...emptyProject(),
    drawings: [
      {
        id: "d1",
        path: "C:\\Users\\ana\\OneDrive - RLP\\Obras\\1234\\Projetos\\ARQ-101 rev B.pdf",
        name: "ARQ-101 rev B.pdf",
        pages: [],
        revisions: [
          {
            path: "C:\\Users\\ana\\OneDrive - RLP\\Obras\\1234\\Projetos\\ARQ-101.pdf",
            name: "ARQ-101.pdf",
            replacedAt: 1,
          },
        ],
      },
      { id: "d2", path: "D:\\scans\\HID-01.pdf", name: "HID-01.pdf", pages: [] },
      { id: "d3", path: null, name: "Sem arquivo", pages: [] },
    ],
  };
}

describe("withRelativePaths", () => {
  it("adds a path relative to the takeoff file to each drawing and revision", () => {
    const out = withRelativePaths(project(), WIN_FILE);
    expect(out.drawings[0].relPath).toBe("../Projetos/ARQ-101 rev B.pdf");
    expect(out.drawings[0].revisions?.[0].relPath).toBe("../Projetos/ARQ-101.pdf");
    expect(out.drawings[0].path).toBe(project().drawings[0].path);
  });

  it("leaves out drawings on another drive or without a file", () => {
    const out = withRelativePaths(project(), WIN_FILE);
    expect("relPath" in out.drawings[1]).toBe(false);
    expect("relPath" in out.drawings[2]).toBe(false);
  });

  it("recomputes a stale relPath (save as into another folder)", () => {
    const saved = withRelativePaths(project(), WIN_FILE);
    const again = withRelativePaths(
      saved,
      "C:\\Users\\ana\\OneDrive - RLP\\Obras\\1234\\Clima.takeoff.json",
    );
    expect(again.drawings[0].relPath).toBe("Projetos/ARQ-101 rev B.pdf");
  });
});

describe("resolveDrawingPaths", () => {
  const saved = withRelativePaths(project(), WIN_FILE);

  it("finds the PDFs through the synced folder on another machine", async () => {
    const onMac = new Set([
      "/Users/rodrigo/Library/CloudStorage/OneDrive-RLP/Obras/1234/Projetos/ARQ-101 rev B.pdf",
      "/Users/rodrigo/Library/CloudStorage/OneDrive-RLP/Obras/1234/Projetos/ARQ-101.pdf",
    ]);
    const { project: out, relinked } = await resolveDrawingPaths(saved, MAC_FILE, async (p) =>
      onMac.has(p),
    );
    expect(relinked).toBe(2);
    expect(out.drawings[0].path).toBe(
      "/Users/rodrigo/Library/CloudStorage/OneDrive-RLP/Obras/1234/Projetos/ARQ-101 rev B.pdf",
    );
    expect(out.drawings[0].revisions?.[0].path).toBe(
      "/Users/rodrigo/Library/CloudStorage/OneDrive-RLP/Obras/1234/Projetos/ARQ-101.pdf",
    );
    expect(out.drawings.some((d) => "relPath" in d)).toBe(false);
  });

  it("keeps a path that exists, even when relPath points elsewhere", async () => {
    const stale = {
      ...saved,
      drawings: [{ ...saved.drawings[0], relPath: "../Outra/ARQ-999.pdf" }],
    };
    const { project: out, relinked } = await resolveDrawingPaths(stale, WIN_FILE, async () => true);
    expect(relinked).toBe(0);
    expect(out.drawings[0].path).toBe(project().drawings[0].path);
  });

  it("leaves a missing PDF as it was, for the relocate prompt", async () => {
    const { project: out, relinked } = await resolveDrawingPaths(
      saved,
      MAC_FILE,
      async () => false,
    );
    expect(relinked).toBe(0);
    expect(out.drawings[0].path).toBe(project().drawings[0].path);
  });
});

describe("unportableDrawings", () => {
  it("names drawings in local-only folders or on another drive", () => {
    const p = project();
    p.drawings.push({
      id: "d4",
      path: "C:\\Users\\ana\\Downloads\\MEC-02.pdf",
      name: "MEC-02.pdf",
      pages: [],
    });
    expect(unportableDrawings(p, WIN_FILE, ["C:\\Users\\ana\\Downloads"])).toEqual([
      "HID-01.pdf",
      "MEC-02.pdf",
    ]);
  });
});

describe("contentHash", () => {
  it("tells versions apart and is stable", () => {
    expect(contentHash('{"a":1}')).toBe(contentHash('{"a":1}'));
    expect(contentHash('{"a":1}')).not.toBe(contentHash('{"a":2}'));
  });
});

describe("copyPathFor", () => {
  it("suggests a copy beside the file", () => {
    expect(copyPathFor(WIN_FILE)).toBe(
      "C:\\Users\\ana\\OneDrive - RLP\\Obras\\1234\\Orçamento\\Clima (cópia).takeoff.json",
    );
    expect(copyPathFor("/Users/r/Obras/Clima.takeoff.json")).toBe(
      "/Users/r/Obras/Clima (cópia).takeoff.json",
    );
  });
});
