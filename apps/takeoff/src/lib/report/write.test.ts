import { readFileSync } from "node:fs";
import { DEFAULT_DUCT_SPEC } from "@rlpapp/shared/engenharia/ducts";
import {
  decodePDFRawStream,
  degrees,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFNumber,
  type PDFPage,
  PDFRawStream,
  PDFRef,
  rgb,
} from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { beforeAll, describe, expect, it } from "vitest";
import { DUCT_GROUP } from "../ductItems";
import type { Pt } from "../geom";
import type { Kit } from "../kits";
import { markingShapes } from "../markingShapes";
import { emptyProject, type Item, type Measurement, type Project, type Zone } from "../types";
import { metricScale } from "../units";
import {
  applyTransform,
  fromPdfUserSpace,
  pageToFrame,
  rectToPdfUserSpace,
  type ViewportTransform,
} from "./coords";
import { withoutPages } from "./pages";
import { planReport, type ReportPlan } from "./plan";
import {
  type Block,
  flowBlocks,
  type LoadedSources,
  loadReportSources,
  nestedNote,
  pageViewport,
  type ReportFonts,
  type Row,
  scaleCaption,
  sourcePageSize,
  type WrittenPage,
  writeReport,
} from "./write";

const fonts: ReportFonts = {
  regular: new Uint8Array(readFileSync("public/fonts/LiberationSans-Regular.ttf")),
  bold: new Uint8Array(readFileSync("public/fonts/LiberationSans-Bold.ttf")),
};

/**
 * Two sheets: an upright 600 × 400 page, and a page with a CropBox offset (50, 20) turned 90°.
 * A cross marks user point (300, 200) on the second one, so its place on the report is known.
 */
const CROSS: Pt = { x: 300, y: 200 };
async function sourcePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const a = doc.addPage([600, 400]);
  for (let x = 0; x <= 600; x += 50) {
    a.drawLine({
      start: { x, y: 0 },
      end: { x, y: 400 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
  }
  a.drawText("Planta terreo", { x: 20, y: 370, size: 14 });
  const b = doc.addPage([600, 400]);
  b.setCropBox(50, 20, 450, 340); // x, y, width, height: [50 20 500 360]
  b.setRotation(degrees(90));
  b.drawLine({ start: { x: CROSS.x - 20, y: CROSS.y }, end: { x: CROSS.x + 20, y: CROSS.y } });
  b.drawLine({ start: { x: CROSS.x, y: CROSS.y - 20 }, end: { x: CROSS.x, y: CROSS.y + 20 } });
  b.drawText("Cobertura", { x: 80, y: 300, size: 14 });
  return doc.save();
}

const SCALE = metricScale(50);
const item = (id: string, extra: Partial<Item>): Item => ({
  id,
  name: id,
  kind: "count",
  color: "#f97316",
  group: "Geral",
  materialPrice: 10,
  laborPrice: 5,
  wastePct: 0,
  ...extra,
});
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Page-space point of the cross on the rotated sheet, filled in once the PDF is loaded. */
let crossPage: Pt;
let transforms: ViewportTransform[];

function project(): Project {
  const p = emptyProject();
  p.name = "Edifício São João";
  p.client = "Construtora Ação";
  p.proposalNumber = "123/26";
  p.drawings = [
    { id: "d1", path: null, name: "Planta.pdf", pages: [{ scale: SCALE }, { scale: SCALE }] },
  ];
  p.items = [
    item("grelha", { name: "Grelha de retorno", symbol: "grille" }),
    item("rede", {
      name: "Rede de dutos",
      kind: "linear",
      group: DUCT_GROUP,
      unit: "cj",
      manualQty: 1,
      derived: "duct",
    }),
    item("piso", { name: "Isolamento térmico", kind: "area", group: "Isolamento" }),
  ];
  p.locations = [
    { id: "sala", name: "Sala Técnica", color: "#22c55e" },
    { id: "copa", name: "Copa", color: "#a855f7" },
    { id: "cob", name: "Cobertura", color: "#38bdf8" },
  ];
  p.zones = [
    { id: "z1", locationId: "sala", drawingId: "d1", page: 0, points: rect(50, 50, 280, 350) },
    { id: "z2", locationId: "copa", drawingId: "d1", page: 0, points: rect(320, 50, 560, 350) },
    {
      id: "z3",
      locationId: "cob",
      drawingId: "d1",
      page: 1,
      points: rect(20, 20, 320, 430),
      repeat: 2,
    } as Zone,
  ];
  const m = (id: string, itemId: string, page: number, points: Pt[], extra = {}): Measurement => ({
    id,
    itemId,
    drawingId: "d1",
    page,
    points,
    ...extra,
  });
  p.measurements = [
    m("g1", "grelha", 0, [{ x: 120, y: 120 }]),
    m("g2", "grelha", 0, [{ x: 200, y: 260 }], { repeat: 2 }),
    m("a1", "piso", 0, rect(380, 100, 500, 220)),
    m("g3", "grelha", 1, [crossPage]),
    m("r1", "rede", 1, [crossPage, { x: crossPage.x, y: crossPage.y + 150 }], {
      duct: { ...DEFAULT_DUCT_SPEC, a: 40, b: 25 },
    }),
  ];
  return p;
}

/** Numbers of every "x y m" (moveto) in a page's content. */
function movetos(doc: PDFDocument, page: PDFPage): Pt[] {
  const contents = page.node.Contents();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((r) => doc.context.lookup(r))
      : [contents];
  let text = "";
  for (const s of streams) {
    if (s instanceof PDFRawStream) text += new TextDecoder().decode(decodePDFRawStream(s).decode());
  }
  return [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) m\b/g)].map((g) => ({
    x: Number(g[1]),
    y: Number(g[2]),
  }));
}

const nums = (doc: PDFDocument, a: unknown): number[] =>
  (doc.context.lookup(a as PDFRef, PDFArray) as PDFArray)
    .asArray()
    .map((n) => (doc.context.lookup(n) as PDFNumber).asNumber());

/** The cutout wrappers drawn on a page: their dict and the embedded page they point at. */
function wrappersOf(doc: PDFDocument, page: PDFPage) {
  const resources = page.node.Resources();
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xobjects) return [];
  return xobjects
    .keys()
    .filter((k) => k.asString().startsWith("/Cut"))
    .map((k) => {
      const ref = xobjects.get(k) as PDFRef;
      const form = doc.context.lookup(ref) as PDFRawStream;
      const inner = form.dict
        .lookup(PDFName.of("Resources"), PDFDict)
        .lookup(PDFName.of("XObject"), PDFDict);
      return {
        ref,
        bbox: nums(doc, form.dict.get(PDFName.of("BBox"))),
        matrix: nums(doc, form.dict.get(PDFName.of("Matrix"))),
        target: inner.get(PDFName.of("P")) as PDFRef,
      };
    });
}

let bytes: Uint8Array;
let loaded: LoadedSources;
let plan: ReportPlan;
let out: PDFDocument;

beforeAll(async () => {
  bytes = await sourcePdf();
  loaded = await loadReportSources({ d1: { bytes } });
  transforms = loaded.get("d1")?.transforms ?? [];
  crossPage = fromPdfUserSpace(CROSS, transforms[1]);
  const p = project();
  plan = planReport(p, {}, { pageSize: sourcePageSize(loaded) });
  const report = await writeReport(plan, loaded, {
    project: p,
    fonts,
    prices: true,
    date: "31/10/2026",
  });
  out = await PDFDocument.load(report);
});

describe("pageViewport", () => {
  it("matches pdf.js's PageViewport.transform for upright, cropped and rotated pages", async () => {
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    const src = await PDFDocument.load(bytes);
    try {
      for (let i = 0; i < doc.numPages; i++) {
        const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
        const mine = pageViewport(src.getPage(i));
        mine.transform.forEach((v, k) => {
          expect(v).toBeCloseTo(vp.transform[k], 9);
        });
        expect(mine.width).toBeCloseTo(vp.width, 9);
        expect(mine.height).toBeCloseTo(vp.height, 9);
      }
    } finally {
      await task.destroy();
    }
  });

  it("gives the rotated sheet its turned size", () => {
    expect(loaded.get("d1")?.sizes).toEqual([
      { width: 600, height: 400 },
      { width: 340, height: 450 },
    ]);
  });
});

describe("writeReport", () => {
  it("writes a cover plus one page per cutout, all on the plan's paper", () => {
    expect(plan.pages.map((p) => p.heading)).toEqual(["Sala Técnica", "Copa", "Cobertura ×2"]);
    expect(out.getPageCount()).toBe(1 + plan.pages.length);
    for (const page of out.getPages()) {
      expect(page.getWidth()).toBeCloseTo(plan.layout.page.width, 2);
      expect(page.getHeight()).toBeCloseTo(plan.layout.page.height, 2);
    }
    expect(out.getTitle()).toBe("Relatório de recortes · Edifício São João");
  });

  it("embeds each source page once and reuses it for every cutout of that page", () => {
    const pages = out.getPages();
    expect(wrappersOf(out, pages[0])).toEqual([]); // the cover has no drawing
    const wrappers = pages.slice(1).flatMap((p) => wrappersOf(out, p));
    expect(wrappers).toHaveLength(3);
    const targets = new Set(wrappers.map((w) => w.target.toString()));
    expect(targets.size).toBe(2);
    // Sala and Copa (same sheet) point at the same embedded page
    expect(wrappers[0].target.toString()).toBe(wrappers[1].target.toString());
    for (const t of targets) {
      const form = out.context.lookup(PDFRef.of(Number(t.split(" ")[0]))) as PDFRawStream;
      expect(form.dict.get(PDFName.of("Subtype"))?.toString()).toBe("/Form");
    }
  });

  it("copies a sheet's single content stream as it is, still encoded", async () => {
    const src = await PDFDocument.load(bytes);
    const contents = src.getPage(0).node.Contents();
    const original = (
      contents instanceof PDFArray ? src.context.lookup(contents.get(0)) : contents
    ) as PDFRawStream;
    const target = wrappersOf(out, out.getPage(1))[0].target;
    const form = out.context.lookup(target) as PDFRawStream;
    expect(form.dict.get(PDFName.of("Filter"))?.toString()).toBe(
      original.dict.get(PDFName.of("Filter"))?.toString(),
    );
    expect(form.contents).toEqual(original.contents);
    expect(nums(out, form.dict.get(PDFName.of("BBox")))).toEqual([0, 0, 600, 400]);
  });

  it("joins a sheet's several content streams into one form", async () => {
    const two = await PDFDocument.create();
    const page = two.addPage([300, 200]);
    page.drawLine({ start: { x: 10, y: 10 }, end: { x: 290, y: 10 } });
    page.node.addContentStream(two.context.register(two.context.flateStream("0 0 m 7 9 l S")));
    const twoBytes = await two.save();
    const src = await loadReportSources({ d1: { bytes: twoBytes } });
    const p = project();
    p.drawings[0].pages = [{ scale: SCALE }];
    p.zones = [p.zones[0]];
    p.measurements = [p.measurements[0]];
    const one = planReport(p, {}, { pageSize: sourcePageSize(src) });
    const doc = await PDFDocument.load(
      await writeReport(one, src, { project: p, fonts, cover: false }),
    );
    const [w] = wrappersOf(doc, doc.getPage(0));
    const form = doc.context.lookup(w.target) as PDFRawStream;
    const text = new TextDecoder().decode(decodePDFRawStream(form).decode());
    expect(text).toContain("0 0 m 7 9 l S");
    expect(text).toMatch(/290 10 l/);
  });

  it("clips each cutout to its crop in user space, rotated with the sheet", () => {
    const wrappers = out
      .getPages()
      .slice(1)
      .flatMap((p) => wrappersOf(out, p));
    plan.pages.forEach((p, i) => {
      const box = rectToPdfUserSpace(p.crop, transforms[p.page]);
      const [x0, y0, x1, y1] = wrappers[i].bbox;
      expect(x0).toBeCloseTo(box.minX, 3);
      expect(y0).toBeCloseTo(box.minY, 3);
      expect(x1).toBeCloseTo(box.maxX, 3);
      expect(y1).toBeCloseTo(box.maxY, 3);
    });
  });

  it("draws markings exactly where the drawing under them lands (rotated, cropped sheet)", () => {
    const i = plan.pages.findIndex((p) => p.locationId === "cob");
    const p = plan.pages[i];
    const page = out.getPage(1 + i);
    const [w] = wrappersOf(out, page);
    const frame = plan.layout.frame;
    // where the cross of the source drawing lands on the report page
    const m = w.matrix as unknown as ViewportTransform;
    const drawn = applyTransform(CROSS, m);
    const crossOnReport = { x: frame.x + drawn.x, y: frame.y + drawn.y };
    // where the marking placed on the cross is expected, and where the writer put it
    const f = pageToFrame(crossPage, p.crop, p.zoom);
    expect(crossOnReport.x).toBeCloseTo(frame.x + f.x, 2);
    expect(crossOnReport.y).toBeCloseTo(frame.y + f.y, 2);
    const starts = movetos(out, page);
    expect(
      starts.some((s) => Math.hypot(s.x - crossOnReport.x, s.y - crossOnReport.y) < 0.01),
    ).toBe(true);
  });

  it("lists every planned page and its markings", () => {
    expect(plan.pages[0].measurementIds).toEqual(["g1", "g2"]);
    expect(plan.pages[2].ducts.map((d) => d.section)).toEqual(["40×25"]);
  });

  it("reports progress per planned page", async () => {
    const seen: [number, number][] = [];
    await writeReport(plan, loaded, {
      project: project(),
      fonts,
      cover: false,
      onProgress: (d, t) => {
        seen.push([d, t]);
      },
    });
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("flows a long item list onto continuation pages", async () => {
    const p = project();
    for (let k = 0; k < 120; k++) {
      p.items.push(item(`x${k}`, { name: `Item extra número ${k}` }));
      p.measurements.push({
        id: `xm${k}`,
        itemId: `x${k}`,
        drawingId: "d1",
        page: 0,
        points: [{ x: 60 + (k % 10) * 20, y: 60 + Math.floor(k / 10) * 20 }],
      });
    }
    const big = planReport(
      p,
      { itemIds: p.items.filter((x) => x.id.startsWith("x")).map((x) => x.id) },
      {
        pageSize: sourcePageSize(loaded),
      },
    );
    expect(big.pages).toHaveLength(1);
    const doc = await PDFDocument.load(
      await writeReport(big, loaded, { project: p, fonts, cover: false }),
    );
    expect(doc.getPageCount()).toBeGreaterThan(1);
    // the continuation page carries no drawing
    expect(wrappersOf(doc, doc.getPage(1))).toEqual([]);
  });

  it("draws whole sheets (no polygon) on A3 portrait", async () => {
    const p = project();
    const sheets = planReport(
      p,
      {},
      {
        wholeSheet: true,
        paper: "A3",
        orientation: "portrait",
        pageSize: sourcePageSize(loaded),
      },
    );
    expect(sheets.pages.map((x) => x.kind)).toEqual(["sheet", "sheet"]);
    const doc = await PDFDocument.load(await writeReport(sheets, loaded, { project: p, fonts }));
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(1).getWidth()).toBeCloseTo(841.89, 2);
    expect(doc.getPage(1).getHeight()).toBeCloseTo(1190.55, 2);
    const wrappers = doc.getPages().flatMap((pg) => wrappersOf(doc, pg));
    expect(wrappers).toHaveLength(2);
    expect(new Set(wrappers.map((w) => w.target.toString())).size).toBe(2);
  });

  it("leaves an empty frame when a source PDF is missing", async () => {
    const p = project();
    const report = await writeReport(plan, new Map(), { project: p, fonts, cover: false });
    const doc = await PDFDocument.load(report);
    expect(doc.getPageCount()).toBe(plan.pages.length);
    expect(doc.getPages().flatMap((pg) => wrappersOf(doc, pg))).toEqual([]);
  });
});

/** Text of a PDF page as pdf.js reads it, runs joined by spaces. */
async function pageText(bytes: Uint8Array, page: number): Promise<string> {
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  try {
    const content = await (await doc.getPage(page + 1)).getTextContent();
    return content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ");
  } finally {
    await task.destroy();
  }
}

describe("cover", () => {
  /** A floor ("Pavimento") drawn around Sala Técnica and Copa. */
  function nested(): Project {
    const p = project();
    p.locations.push({ id: "pav", name: "Pavimento", color: "#f43f5e" });
    p.zones.push({
      id: "zp",
      locationId: "pav",
      drawingId: "d1",
      page: 0,
      points: rect(10, 10, 590, 390),
    });
    return p;
  }

  it("notes nested locations, counts singular and plural right", async () => {
    const p = nested();
    const nplan = planReport(p, {}, { pageSize: sourcePageSize(loaded) });
    expect(nplan.cover.nested).toBe(true);
    const note = nestedNote(nplan, true);
    expect(note).toBe(
      "O local “Pavimento” inclui os itens dos locais dentro dele (Sala Técnica e Copa); o TOTAL GERAL conta cada item uma vez.",
    );
    expect(nestedNote(planReport(project(), {}, {}), true)).toBeUndefined();
    const text = await pageText(await writeReport(nplan, loaded, { project: p, fonts }), 0);
    expect(text).toContain("Observação");
    expect(text).toContain("o TOTAL GERAL conta cada item uma vez.");
    // Copa: one region, one marking; Pavimento: three markings
    expect(text).toContain("1 região · 1 marcação");
    expect(text).toContain("1 região · 3 marcações");
    expect(text).not.toContain("1 marcações");
  });
});

describe("pages option", () => {
  it("writes only the chosen pages, numbered as in the whole report", async () => {
    const p = project();
    const seen: WrittenPage[][] = [];
    const progress: [number, number][] = [];
    const report = await writeReport(plan, loaded, {
      project: p,
      fonts,
      pages: [2],
      onPages: (pages) => seen.push([...pages]),
      onProgress: (d, t) => {
        progress.push([d, t]);
      },
    });
    const doc = await PDFDocument.load(report);
    expect(doc.getPageCount()).toBe(1);
    // cover + 3 cutouts: plan page 2 is page 4 of 4
    expect(seen).toEqual([[{ number: 4, total: 4, planIndex: 2, continuation: 0 }]]);
    expect(progress).toEqual([[1, 1]]);
    const text = await pageText(report, 0);
    expect(text).toContain("página 4 de 4");
    expect(text).toContain("Cobertura");
    // only the sheet that page shows is embedded
    const targets = new Set(wrappersOf(doc, doc.getPage(0)).map((w) => w.target.toString()));
    expect(targets.size).toBe(1);
  });

  it("writes the cover alone, its index pointing at the whole report's pages", async () => {
    const seen: WrittenPage[] = [];
    const report = await writeReport(plan, loaded, {
      project: project(),
      fonts,
      pages: ["cover"],
      onPages: (pages) => seen.push(...pages),
    });
    expect((await PDFDocument.load(report)).getPageCount()).toBe(1);
    expect(seen).toEqual([{ number: 1, total: 4, planIndex: undefined, continuation: 0 }]);
    const text = await pageText(report, 0);
    expect(text).toContain("página 1 de 4");
    expect(text).toContain("Índice");
  });

  it("describes every page when all are written", async () => {
    const seen: WrittenPage[] = [];
    await writeReport(plan, loaded, {
      project: project(),
      fonts,
      onPages: (pages) => seen.push(...pages),
    });
    expect(seen.map((w) => [w.number, w.planIndex ?? "capa"])).toEqual([
      [1, "capa"],
      [2, 0],
      [3, 1],
      [4, 2],
    ]);
  });
});

describe("omitted pages", () => {
  it("renumbers the footers and notes the omission on the cover, totals unchanged", async () => {
    const p = project();
    const printed = withoutPages(plan, [0]);
    const report = await writeReport(printed, loaded, { project: p, fonts });
    expect((await PDFDocument.load(report)).getPageCount()).toBe(3);
    const cover = await pageText(report, 0);
    expect(cover).toContain("1 página omitida; os totais da capa incluem os itens dela.");
    expect(cover).toContain("Sala Técnica");
    expect(cover).toContain("omitido");
    expect(await pageText(report, 1)).toContain("página 2 de 3");
    expect(await pageText(report, 2)).toContain("página 3 de 3");
    expect(await pageText(await writeReport(plan, loaded, { project: p, fonts }), 0)).not.toContain(
      "omitida",
    );
  });
});

describe("flowBlocks", () => {
  const row = (h: number, tag: string): Row & { tag: string } => ({ h, tag, draw: () => {} });
  const col = { x: 0, y: 0, width: 100, height: 100 };
  const tagOf = (r: Row) => (r as Row & { tag?: string }).tag;
  const titled = (tag: string, rows: Row[], extra: Partial<Block> = {}): Block => ({
    title: (cont) => row(10, cont ? `${tag} (cont.)` : tag),
    rows,
    ...extra,
  });

  it("moves a location that fits a column to the next one instead of splitting it", () => {
    const g = { heading: (cont: boolean) => row(10, cont ? "SALA (cont.)" : "SALA") };
    const blocks: Block[] = [
      titled("first", [row(10, "a"), row(10, "b"), row(10, "c"), row(10, "d")]),
      { title: g.heading, rows: [], group: g },
      titled("Itens", [row(10, "x"), row(10, "y")], { group: g }),
      titled("Dutos", [row(10, "z")], { group: g }),
    ];
    const { placed, regions } = flowBlocks(blocks, () => col);
    expect(regions).toBe(2);
    const second = placed.filter((p) => p.region === 1).map((p) => tagOf(p.row));
    expect(second).toEqual(["SALA", "Itens", "x", "y", "Dutos", "z"]);
  });

  it("repeats the location's heading atop a column it continues in", () => {
    const g = { heading: (cont: boolean) => row(10, cont ? "SALA (cont.)" : "SALA") };
    const blocks: Block[] = [
      { title: g.heading, rows: [], group: g },
      titled(
        "Itens",
        Array.from({ length: 6 }, (_, i) => row(10, `i${i}`)),
        { group: g },
      ),
      titled(
        "Dutos",
        Array.from({ length: 4 }, (_, i) => row(10, `d${i}`)),
        { group: g },
      ),
    ];
    const { placed } = flowBlocks(blocks, () => col);
    const firstOf = (region: number) => tagOf(placed.find((p) => p.region === region)!.row);
    expect(firstOf(0)).toBe("SALA");
    expect(firstOf(1)).toBe("SALA (cont.)");
    expect(placed.filter((p) => tagOf(p.row) === "SALA (cont.)")).toHaveLength(1);
  });
});

describe("scale caption", () => {
  it("prints the scale with a decimal comma, whole from 1:20 up", () => {
    const ppu = (ratio: number) => (1000 / ratio) * (72 / 25.4);
    expect(scaleCaption(ppu(31.3), "m")).toBe("1:31");
    expect(scaleCaption(ppu(104.5), "m")).toBe("1:105");
    expect(scaleCaption(ppu(7.46), "m")).toBe("1:7,5");
    expect(scaleCaption(ppu(5), "m")).toBe("1:5");
  });
});

describe("kit labels", () => {
  const kits: Kit[] = [{ id: "ls", name: "12.000 Inverter", label: '1/4" · 3/8"', components: [] }];
  /** A line-set kit run of two members across Copa, saved with an older label. */
  function withKit(extra: Partial<Measurement> = {}): Project {
    const p = project();
    p.items.push(
      item("cobre", { name: "Cobre", kind: "linear" }),
      item("cabo", { name: "Cabo PP", kind: "linear" }),
    );
    const pts = [
      { x: 340, y: 300 },
      { x: 540, y: 300 },
    ];
    for (const itemId of ["cobre", "cabo"]) {
      p.measurements.push({
        id: `k-${itemId}`,
        itemId,
        drawingId: "d1",
        page: 0,
        points: pts,
        linkId: "L",
        kitId: "ls",
        kitLabel: "antigo",
        ...extra,
      });
    }
    return p;
  }

  async function copaText(p: Project, opts: { kits?: Kit[] } = {}) {
    const kplan = planReport(p, {}, { pageSize: sourcePageSize(loaded) });
    const i = kplan.pages.findIndex((pg) => pg.locationId === "copa");
    const report = await writeReport(kplan, loaded, { project: p, fonts, ...opts });
    return pageText(report, 1 + i);
  }

  const count = (text: string, part: string) => text.split(part).length - 1;

  it("prints a kit run's label once, the same text as on screen", async () => {
    const p = withKit();
    const m = p.measurements.find((x) => x.id === "k-cobre");
    const cobre = p.items.find((x) => x.id === "cobre");
    if (!m || !cobre) throw new Error("fixture");
    const screen = markingShapes(m, cobre, SCALE, { kits }).label?.text ?? "";
    expect(screen).toMatch(/^1\/4" · 3\/8" · \d+\.\d\d m$/);
    const text = await copaText(p, { kits });
    expect(count(text, screen)).toBe(1);
    expect(text).not.toContain("antigo");
  });

  it("falls back to the label saved with the run, and shows the run's own label first", async () => {
    expect(count(await copaText(withKit()), "antigo · ")).toBe(1);
    const own = await copaText(withKit({ label: "LS-01" }), { kits });
    expect(count(own, "LS-01 · ")).toBe(1);
    expect(own).not.toContain('1/4" · 3/8"');
  });
});
