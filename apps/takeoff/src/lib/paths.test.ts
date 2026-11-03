import { describe, expect, it } from "vitest";
import { dirname, isInside, relativePath, resolveRelative } from "./paths";

describe("dirname", () => {
  it("handles Windows, POSIX and drive roots", () => {
    expect(dirname("C:\\Obras\\1234\\x.takeoff.json")).toBe("C:\\Obras\\1234");
    expect(dirname("/Users/r/Obras/x.takeoff.json")).toBe("/Users/r/Obras");
    expect(dirname("C:\\x.takeoff.json")).toBe("C:\\");
    expect(dirname("/x.takeoff.json")).toBe("/");
  });
});

describe("relativePath", () => {
  it("goes up to the common folder and down to the PDF", () => {
    expect(
      relativePath(
        "C:\\Users\\ana\\OneDrive - RLP\\Obras\\1234\\Orçamento",
        "C:\\Users\\ana\\OneDrive - RLP\\Obras\\1234\\Projetos\\ARQ-101.pdf",
      ),
    ).toBe("../Projetos/ARQ-101.pdf");
  });

  it("points into a subfolder", () => {
    expect(relativePath("/Users/r/Obras/1234", "/Users/r/Obras/1234/plantas/ARQ.pdf")).toBe(
      "plantas/ARQ.pdf",
    );
  });

  it("ignores case and separators on Windows", () => {
    expect(relativePath("c:/Obras/1234", "C:\\OBRAS\\1234\\Projetos\\a.pdf")).toBe(
      "Projetos/a.pdf",
    );
  });

  it("works on UNC shares", () => {
    expect(relativePath("\\\\srv\\dados\\Obras\\1", "\\\\srv\\dados\\Obras\\2\\a.pdf")).toBe(
      "../2/a.pdf",
    );
  });

  it("gives up across drives, shares or path styles", () => {
    expect(relativePath("C:\\Obras", "D:\\Obras\\a.pdf")).toBeNull();
    expect(relativePath("\\\\srv\\a\\x", "\\\\srv\\b\\x\\a.pdf")).toBeNull();
    expect(relativePath("C:\\Obras", "/Users/r/a.pdf")).toBeNull();
    expect(relativePath("Obras", "C:\\Obras\\a.pdf")).toBeNull();
  });
});

describe("resolveRelative", () => {
  it("opens a Windows-saved takeoff on a Mac", () => {
    const rel = relativePath(
      "C:\\Users\\ana\\OneDrive - RLP\\Obras\\1234\\Orçamento",
      "C:\\Users\\ana\\OneDrive - RLP\\Obras\\1234\\Projetos\\ARQ-101.pdf",
    );
    expect(rel).not.toBeNull();
    expect(
      resolveRelative(
        "/Users/rodrigo/Library/CloudStorage/OneDrive-RLP/Obras/1234/Orçamento",
        rel as string,
      ),
    ).toBe("/Users/rodrigo/Library/CloudStorage/OneDrive-RLP/Obras/1234/Projetos/ARQ-101.pdf");
  });

  it("writes with the folder's separators", () => {
    expect(resolveRelative("C:\\Users\\bia\\RLP\\Obras\\1234", "../Projetos/a.pdf")).toBe(
      "C:\\Users\\bia\\RLP\\Obras\\Projetos\\a.pdf",
    );
    expect(resolveRelative("\\\\srv\\dados\\Obras\\1", "../2/a.pdf")).toBe(
      "\\\\srv\\dados\\Obras\\2\\a.pdf",
    );
  });

  it("refuses to climb above the root", () => {
    expect(resolveRelative("C:\\Obras", "../../a.pdf")).toBeNull();
    expect(resolveRelative("relative/dir", "a.pdf")).toBeNull();
  });
});

describe("isInside", () => {
  it("tells whether a file is under a folder", () => {
    expect(isInside("C:\\Users\\ana\\Downloads\\a.pdf", "C:\\Users\\ana\\Downloads")).toBe(true);
    expect(isInside("c:\\users\\ana\\downloads\\x\\a.pdf", "C:\\Users\\ana\\Downloads\\")).toBe(
      true,
    );
    expect(isInside("C:\\Users\\ana\\Downloads2\\a.pdf", "C:\\Users\\ana\\Downloads")).toBe(false);
    expect(isInside("/tmp/a.pdf", "/tmp")).toBe(true);
    expect(isInside("/tmp", "/tmp")).toBe(false);
  });
});
