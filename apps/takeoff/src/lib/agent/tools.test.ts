import { describe, expect, it } from "vitest";
import { aiStats } from "../aiReview";
import { kitMode } from "../kits";
import { emptyProject } from "../types";
import { metricScale } from "../units";
import { catalogEntry, type FakeApp, fakeApp, textRun } from "./testContext";
import { AGENT_TOOLS } from "./tools";

/** Call a tool as the protocol does; the result's JSON text parsed, or its error message. */
async function call(app: FakeApp, name: string, args: Record<string, unknown> = {}) {
  const tool = AGENT_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  const result = await tool.run(args, app.ctx);
  const text = result.content.find((c) => c.type === "text");
  return {
    data: text && text.type === "text" ? JSON.parse(text.text) : null,
    images: result.content.filter((c) => c.type === "image").length,
  };
}

const failure = async (app: FakeApp, name: string, args: Record<string, unknown> = {}) => {
  try {
    await call(app, name, args);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error(`${name} did not fail`);
};

const square = (x: number, y: number, side: number) => [
  { x, y },
  { x: x + side, y },
  { x: x + side, y: y + side },
  { x, y: y + side },
];

describe("tool definitions", () => {
  it("have unique names, descriptions and object schemas", () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of AGENT_TOOLS) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
      for (const key of t.inputSchema.required ?? []) {
        expect(t.inputSchema.properties).toHaveProperty(key);
      }
    }
  });
});

describe("reading the takeoff", () => {
  it("describes the drawings, items and review counts", async () => {
    const app = fakeApp();
    await call(app, "set_scale", { ratio: 50 });
    const item = (
      await call(app, "create_item", {
        name: "Grelha",
        kind: "count",
        discipline: "Exaustão",
        why_not_catalog: "teste",
      })
    ).data;
    await call(app, "add_markings", { item_id: item.item_id, points: [{ x: 10, y: 10 }] });
    const { data } = await call(app, "get_takeoff");
    expect(data).toMatchObject({ name: "Obra teste", client: "Tegra", length_unit: "m" });
    expect(data.drawings[0]).toMatchObject({ id: "d1", name: "planta.pdf", shown_in_app: true });
    expect(data.drawings[0].pages[0]).toMatchObject({
      page: 1,
      width: 1000,
      height: 800,
      scale: { label: "1:50", unit: "m" },
    });
    expect(data.items[0]).toMatchObject({
      name: "Grelha",
      kind: "count",
      quantity: 1,
      markings: 1,
    });
    expect(data.ai_review).toMatchObject({ pending: 1 });
  });

  it("lists a page's markings with their review state", async () => {
    const app = fakeApp();
    await call(app, "create_location", { name: "Sala", polygon: square(0, 0, 100) });
    const { data } = await call(app, "list_markings", { page: 1 });
    expect(data.locations).toHaveLength(1);
    expect(data.locations[0]).toMatchObject({ location: "Sala", ai: "suggested" });
    expect(data.measurements).toEqual([]);
  });

  it("returns a picture and where it is on the page", async () => {
    const app = fakeApp();
    const { data, images } = await call(app, "view_page", {
      region: { x: 900, y: 700, w: 400, h: 400 },
      max_px: 800,
      grid: false,
    });
    expect(images).toBe(1);
    // the region is cut to the page
    expect(data.region).toEqual({ x: 900, y: 700, w: 100, h: 100 });
    expect(data.page_size).toEqual({ width: 1000, height: 800 });
    expect(app.views[0].opts).toEqual({ maxPx: 800, grid: false, markings: true });
    expect(await failure(app, "view_page", { region: { x: 5000, y: 0, w: 10, h: 10 } })).toMatch(
      /outside the page/,
    );
  });

  it("filters the page's text by region and by content, and says when there is none", async () => {
    const app = fakeApp({
      doc: {
        text: [
          textRun("SALA 101", 100, 100),
          textRun("Copa", 600, 100),
          textRun("VE-01", 120, 300),
        ],
      },
    });
    const all = (await call(app, "read_text")).data;
    expect(all.runs.map((r: { text: string }) => r.text)).toEqual(["SALA 101", "Copa", "VE-01"]);
    const region = (await call(app, "read_text", { region: { x: 0, y: 0, w: 300, h: 200 } })).data;
    expect(region.runs).toEqual([{ text: "SALA 101", x: 100, y: 100, height: 8 }]);
    expect((await call(app, "read_text", { contains: "sala" })).data.matched).toBe(1);
    expect((await call(fakeApp(), "read_text")).data.note).toMatch(/no selectable text/);
  });

  it("measures a path in page points and in real units", async () => {
    const app = fakeApp();
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ];
    expect((await call(app, "measure", { points: pts })).data).toMatchObject({
      length_page_points: 100,
      length: null,
      scale: null,
    });
    await call(app, "set_scale", { ratio: 50 });
    // 100 pt at 1:50 = 100 / 56.69 m
    expect((await call(app, "measure", { points: pts })).data.length).toBeCloseTo(1.764, 2);
  });

  it("returns symbol matches best first", async () => {
    const app = fakeApp({
      doc: {
        hits: [
          { x: 10, y: 10, score: 0.8 },
          { x: 50, y: 50, score: 0.99 },
          { x: 90, y: 90, score: 0.6 },
        ],
      },
    });
    const { data } = await call(app, "find_similar", { box: { x: 40, y: 40, w: 20, h: 20 } });
    expect(data.hits).toEqual([
      { x: 50, y: 50, score: 0.99 },
      { x: 10, y: 10, score: 0.8 },
    ]);
    expect(await failure(app, "find_similar", { box: { x: 0, y: 0, w: 1, h: 1 } })).toMatch(
      /too small/,
    );
  });

  it("searches the catalog and lists kits", async () => {
    const app = fakeApp({
      catalog: {
        saved: [catalogEntry("Grelha 400x200", "pç"), catalogEntry("Tubo de cobre", "m")],
      },
    });
    const { data } = await call(app, "search_catalog", { query: "grelha" });
    expect(data.results).toEqual([
      expect.objectContaining({ name: "Grelha 400x200", kind: "count", material_price: 10 }),
    ]);
    const kits = (await call(app, "list_kits")).data.kits;
    expect(kits.length).toBeGreaterThan(0);
    expect(kits[0]).toHaveProperty("components");
  });
});

describe("marking", () => {
  it("sets a scale by ratio or by calibration and reports the previous one", async () => {
    const app = fakeApp();
    expect((await call(app, "set_scale", { ratio: 50 })).data.scale.label).toBe("1:50");
    const cal = await call(app, "set_scale", {
      calibrate: { a: { x: 0, y: 0 }, b: { x: 0, y: 283.46 }, length: 10 },
    });
    // 283.46 pt for 10 m is 1:100
    expect(cal.data).toMatchObject({ scale: { label: "1:100" }, previous: "1:50" });
    expect(app.project().drawings[0].pages[0].scale?.label).toBe("1:100");
    expect(await failure(app, "set_scale", {})).toMatch(/ratio.*calibrate/);
  });

  it("creates a budget line from the catalog, once", async () => {
    const app = fakeApp({ catalog: { saved: [catalogEntry("Grelha 400x200", "pç")] } });
    const first = (
      await call(app, "create_item", { name: "grelha 400x200", discipline: "Exaustão" })
    ).data;
    expect(first).toMatchObject({
      name: "Grelha 400x200",
      kind: "count",
      created: true,
      from_catalog: true,
      material_price: 10,
    });
    const again = (
      await call(app, "create_item", { name: "Grelha 400x200", discipline: "Exaustão" })
    ).data;
    expect(again).toMatchObject({ item_id: first.item_id, created: false });
    expect(app.project().items).toHaveLength(1);
    // the catalog's unit decides how a catalog material is measured, whatever kind is passed
    const forced = fakeApp({ catalog: { saved: [catalogEntry("Tubo de cobre", "m")] } });
    expect(
      (
        await call(forced, "create_item", {
          name: "Tubo de cobre",
          kind: "count",
          discipline: "Infra AC",
        })
      ).data.kind,
    ).toBe("linear");
    expect(await failure(app, "create_item", { name: "Coisa nova" })).toMatch(/not in the catalog/);
    expect(
      (
        await call(app, "create_item", {
          name: "Coisa nova",
          kind: "linear",
          discipline: "Exaustão",
        })
      ).data,
    ).toMatchObject({ created: true, from_catalog: false, kind: "linear" });
  });

  it("traces a location from a point, and asks for a polygon when the room does not close", async () => {
    const outline = square(100, 100, 200);
    const closed = fakeApp({ doc: { room: { polygon: outline, unbounded: false } } });
    await call(closed, "set_scale", { ratio: 50 });
    const made = (
      await call(closed, "create_location", { name: "Sala 101", point: { x: 200, y: 200 } })
    ).data;
    expect(made).toMatchObject({
      location: "Sala 101",
      new_location: true,
      traced_from_drawing: true,
      vertices: 4,
      area_unit: "m²",
    });
    expect(closed.project().zones[0]).toMatchObject({ points: outline, ai: "suggested", page: 0 });

    const open = fakeApp({ doc: { room: { polygon: outline, unbounded: true } } });
    expect(await failure(open, "create_location", { name: "Hall", point: { x: 1, y: 1 } })).toMatch(
      /does not close/,
    );
    expect(
      await failure(fakeApp(), "create_location", { name: "Hall", point: { x: 1, y: 1 } }),
    ).toMatch(/No enclosed space/);
    expect(open.project().zones).toEqual([]);
    const drawn = (
      await call(open, "create_location", { name: "Hall", polygon: outline, repeat: 4 })
    ).data;
    expect(drawn.traced_from_drawing).toBe(false);
    expect(open.project().zones[0].repeat).toBe(4);
  });

  it("marks nothing when another takeoff was opened while the room was being traced", async () => {
    const other = {
      ...emptyProject(),
      name: "Outra obra",
      drawings: [{ id: "x9", path: "C:/outra/planta.pdf", name: "planta.pdf", pages: [] }],
      activeDrawingId: "x9",
    };
    const app: FakeApp = fakeApp({
      doc: {
        room: { polygon: square(100, 100, 200), unbounded: false },
        whileTracing: () => app.open(other),
      },
    });
    expect(
      await failure(app, "create_location", { name: "Sala 101", point: { x: 200, y: 200 } }),
    ).toMatch(/takeoff changed/);
    expect(app.project()).toBe(other);
    expect(app.project().zones).toEqual([]);
    expect(app.commits).toBe(0);
  });

  it("refuses an outline or a kit run outside the page", async () => {
    const app = fakeApp();
    expect(
      await failure(app, "create_location", { name: "Hall", polygon: square(900, 700, 200) }),
    ).toMatch(/off the page/);
    const kit = app.ctx.catalog().kits.find((k) => kitMode(k) === "linear");
    if (!kit) throw new Error("no linear factory kit");
    expect(
      await failure(app, "add_kit_run", {
        kit_id: kit.id,
        points: [
          { x: -10, y: 10 },
          { x: 100, y: 10 },
        ],
      }),
    ).toMatch(/off the page/);
    expect(app.commits).toBe(0);
  });

  it("joins a location of the same name instead of creating another", async () => {
    const app = fakeApp();
    await call(app, "create_location", { name: "Térreo", polygon: square(0, 0, 50) });
    const second = (
      await call(app, "create_location", { name: " térreo ", polygon: square(60, 0, 50) })
    ).data;
    expect(second.new_location).toBe(false);
    expect(app.project().locations).toHaveLength(1);
    expect(app.project().zones).toHaveLength(2);
  });

  it("adds count marks as suggestions and skips marks placed twice", async () => {
    const app = fakeApp();
    const item = (
      await call(app, "create_item", {
        name: "Grelha",
        kind: "count",
        discipline: "Exaustão",
        why_not_catalog: "teste",
      })
    ).data;
    const pts = [
      { x: 10, y: 10 },
      { x: 200, y: 10 },
    ];
    const first = (
      await call(app, "add_markings", { item_id: item.item_id, points: pts, label: "G1" })
    ).data;
    expect(first).toMatchObject({ created: 2 });
    const again = (
      await call(app, "add_markings", {
        item_id: item.item_id,
        points: [...pts, { x: 400, y: 10 }],
      })
    ).data;
    expect(again).toMatchObject({ created: 1, skipped_duplicates: 2 });
    expect(app.project().measurements.every((m) => m.ai === "suggested")).toBe(true);
    expect(app.project().measurements[0].label).toBe("G1");
    expect(aiStats(app.project()).pending).toBe(3);
  });

  it("checks the shape against the item's kind and the page", async () => {
    const app = fakeApp();
    const tubo = (
      await call(app, "create_item", {
        name: "Tubo",
        kind: "linear",
        discipline: "Exaustão",
        why_not_catalog: "teste",
      })
    ).data;
    const grelha = (
      await call(app, "create_item", {
        name: "Grelha",
        kind: "count",
        discipline: "Exaustão",
        why_not_catalog: "teste",
      })
    ).data;
    expect(
      await failure(app, "add_markings", { item_id: tubo.item_id, points: [{ x: 1, y: 1 }] }),
    ).toMatch(/linear item/);
    expect(
      await failure(app, "add_markings", { item_id: grelha.item_id, paths: [[{ x: 1, y: 1 }]] }),
    ).toMatch(/count item/);
    expect(
      await failure(app, "add_markings", { item_id: tubo.item_id, paths: [[{ x: 1, y: 1 }]] }),
    ).toMatch(/at least 2 points/);
    expect(
      await failure(app, "add_markings", { item_id: grelha.item_id, points: [{ x: 5000, y: 1 }] }),
    ).toMatch(/off the page/);
    expect(
      await failure(app, "add_markings", { item_id: "nope", points: [{ x: 1, y: 1 }] }),
    ).toMatch(/No item/);
    const run = (
      await call(app, "add_markings", {
        item_id: tubo.item_id,
        paths: [
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        ],
      })
    ).data;
    expect(run.warning).toMatch(/no scale/);
  });

  it("draws a kit run as one group of suggestions", async () => {
    const app = fakeApp();
    const kit = app.ctx
      .catalog()
      .kits.find((k) => kitMode(k) === "linear" && k.components.length > 1);
    if (!kit) throw new Error("no linear factory kit");
    const { data } = await call(app, "add_kit_run", {
      kit_id: kit.id,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    expect(data.created).toBe(kit.components.length);
    const made = app.project().measurements;
    expect(new Set(made.map((m) => m.linkId)).size).toBe(1);
    expect(made.every((m) => m.ai === "suggested" && m.kitId === kit.id)).toBe(true);
    expect(app.commits).toBe(1);
    expect(await failure(app, "add_kit_run", { kit_id: kit.id, points: [{ x: 0, y: 0 }] })).toMatch(
      /at least 2/,
    );
  });

  it("takes back its own pending suggestions and nothing else", async () => {
    const app = fakeApp({
      project: {
        items: [
          {
            id: "i1",
            name: "Grelha",
            kind: "count",
            color: "#fff",
            group: "Geral",
            materialPrice: 0,
            laborPrice: 0,
            wastePct: 0,
          },
        ],
        measurements: [
          { id: "humano", itemId: "i1", drawingId: "d1", page: 0, points: [{ x: 1, y: 1 }] },
          {
            id: "aceita",
            itemId: "i1",
            drawingId: "d1",
            page: 0,
            points: [{ x: 9, y: 9 }],
            ai: "accepted",
          },
        ],
      },
    });
    const added = (await call(app, "add_markings", { item_id: "i1", points: [{ x: 300, y: 300 }] }))
      .data;
    const { data } = await call(app, "remove_suggestions", {
      ids: [...added.ids, "humano", "aceita"],
    });
    expect(data).toEqual({ removed: added.ids, kept: ["humano", "aceita"] });
    expect(app.project().measurements.map((m) => m.id)).toEqual(["humano", "aceita"]);
    // the agent correcting itself is not the user's verdict
    expect(aiStats(app.project()).rejected).toBe(0);
  });
});

describe("memory", () => {
  it("stores what the agent proposes as a proposal, hidden until approved", async () => {
    const app = fakeApp();
    const { data } = await call(app, "propose_memory", {
      kind: "termo",
      text: "VE-01",
      target: "Exaustor",
      scope: "Tegra",
    });
    expect(data.status).toBe("proposta");
    expect(app.memory().entries[0]).toMatchObject({
      status: "proposta",
      origin: "agente",
      source: "Obra teste",
    });
    expect((await call(app, "get_memory")).data.terms).toEqual([]);
    // proposing the same lesson again does not pile it up
    const again = await call(app, "propose_memory", {
      kind: "termo",
      text: "ve-01",
      target: "exaustor",
      scope: "tegra",
    });
    expect(again.data.note).toMatch(/already been proposed/);
    expect(app.memory().entries).toHaveLength(1);
    expect(await failure(app, "propose_memory", { kind: "termo", text: "VE-02" })).toMatch(
      /target/,
    );
  });

  it("hands back the approved entries of the takeoff's client and of an extra scope", async () => {
    const app = fakeApp();
    for (const entry of [
      { kind: "nota" as const, text: "dreno não é escopo" },
      { kind: "termo" as const, text: "VE-01", target: "Exaustor", scope: "Tegra" },
      { kind: "nota" as const, text: "só do projetista", scope: "Projetista X" },
      { kind: "simbolo" as const, text: "Cassete", target: "Cassete 4 vias", image: "AAAA" },
    ]) {
      app.teach(entry);
    }
    const own = await call(app, "get_memory");
    expect(own.data.scopes).toEqual(["Tegra"]);
    expect(own.data.notes).toEqual([{ text: "dreno não é escopo" }]);
    expect(own.data.terms).toEqual([
      { on_drawing: "VE-01", stands_for: "Exaustor", scope: "Tegra" },
    ]);
    expect(own.data.symbols).toEqual([{ picture: 1, shows: "Cassete", item: "Cassete 4 vias" }]);
    expect(own.images).toBe(1);
    const extra = await call(app, "get_memory", { scope: "projetista x" });
    expect(extra.data.notes).toHaveLength(2);
  });
});

describe("pages and drawings", () => {
  it("refuses a page the PDF does not have and a drawing the takeoff does not have", async () => {
    const app = fakeApp();
    expect(await failure(app, "read_text", { page: 3 })).toMatch(/has 1 page/);
    expect(await failure(app, "read_text", { page: 1.5 })).toMatch(/whole number/);
    expect(await failure(app, "read_text", { drawing: "zzz" })).toMatch(/No drawing with id/);
    const closed = fakeApp({ project: { drawings: [], activeDrawingId: null } });
    expect(await failure(closed, "read_text")).toMatch(/No drawing is open/);
  });

  it("sizes a drawing's page list from its PDF when setting a scale on all pages", async () => {
    const app = fakeApp({
      doc: {
        sizes: [
          { w: 10, h: 10 },
          { w: 10, h: 10 },
          { w: 10, h: 10 },
        ],
      },
    });
    await call(app, "set_scale", { page: 2, ratio: 100, all_pages: true });
    expect(app.project().drawings[0].pages.map((p) => p.scale?.label)).toEqual([
      "1:100",
      "1:100",
      "1:100",
    ]);
    expect(app.project().drawings[0].pages[0].scale).toEqual(metricScale(100));
  });
});

describe("keeping the budget straight", () => {
  const catalog = {
    saved: [
      catalogEntry("Ar Condicionado Hi-Wall — Midea 9.000 BTU/h", "pç", {
        group: "Ar Condicionado",
      }),
      catalogEntry("Exaustor — Sicflux SONORA 11", "pç", {
        group: "Ventilação e Exaustão",
        system: "exaustao",
      }),
      catalogEntry('Tubo de Cobre — 1/4"', "m", { group: "Tubulações" }),
    ],
  };

  it("puts every line on a discipline tab", async () => {
    const app = fakeApp({ catalog });
    // no tab asked for, none from the catalog, none for the takeoff: refused, with the options
    expect(
      await failure(app, "create_item", { name: "Ar Condicionado Hi-Wall — Midea 9.000 BTU/h" }),
    ).toMatch(/Pass "discipline".*Exaustão.*Detecção de Incêndio/);
    // the catalog material's own tab, in its canonical name
    expect(
      (await call(app, "create_item", { name: "Exaustor — Sicflux SONORA 11" })).data,
    ).toMatchObject({ discipline: "Exaustão" });
    // the tab asked for, spelled as the takeoff spells it
    expect(
      (
        await call(app, "create_item", {
          name: "Ar Condicionado Hi-Wall — Midea 9.000 BTU/h",
          discipline: "exaustao",
        })
      ).data,
    ).toMatchObject({ discipline: "Exaustão" });
    // a takeoff of one system lends its own to the lines
    const single = fakeApp({ catalog, project: { system: "Pressurização de Escadas" } });
    expect(
      (await call(single, "create_item", { name: 'Tubo de Cobre — 1/4"' })).data,
    ).toMatchObject({ discipline: "Pressurização de Escadas" });
  });

  it("shows the catalog's equivalents before creating an off-catalog line", async () => {
    const app = fakeApp({ catalog });
    const name = "Evaporadora Split Hi-Wall Daikin FTH09 9.000 BTU/h";
    const refused = await failure(app, "create_item", {
      name,
      kind: "count",
      discipline: "AC Áreas Comuns",
    });
    expect(refused).toMatch(/similar materials/);
    expect(refused.split("\n")[1]).toContain("Ar Condicionado Hi-Wall — Midea 9.000 BTU/h");
    const made = (
      await call(app, "create_item", {
        name,
        kind: "count",
        discipline: "AC Áreas Comuns",
        why_not_catalog: "O catálogo só tem split só frio.",
      })
    ).data;
    expect(made).toMatchObject({ created: true, from_catalog: false });
    // the line exists now: calling again needs neither kind nor reason, and keeps its tab
    expect((await call(app, "create_item", { name })).data).toMatchObject({
      item_id: made.item_id,
      created: false,
      discipline: "AC Áreas Comuns",
    });
    // nothing alike in the catalog: no reason asked for
    expect(
      (
        await call(app, "create_item", {
          name: "Coisa nova",
          kind: "count",
          discipline: "Exaustão",
        })
      ).data,
    ).toMatchObject({ created: true });
  });

  it("searches by function, listing partial matches after the exact ones", async () => {
    const app = fakeApp({ catalog });
    const { data } = await call(app, "search_catalog", { query: "hi-wall daikin 9.000" });
    expect(data.results[0]).toMatchObject({
      name: "Ar Condicionado Hi-Wall — Midea 9.000 BTU/h",
      match: "3/4 words",
    });
    const vrv = await call(app, "search_catalog", { query: "exaustor sonora" });
    expect(vrv.data.results[0]).toMatchObject({ match: "all" });
  });

  it("reviews the takeoff for equipment with no run, off-catalog lines and missing tabs", async () => {
    const app = fakeApp({ catalog });
    await call(app, "set_scale", { ratio: 50 });
    const fan = (await call(app, "create_item", { name: "Exaustor — Sicflux SONORA 11" })).data;
    const pipe = (
      await call(app, "create_item", { name: 'Tubo de Cobre — 1/4"', discipline: "Infra AC" })
    ).data;
    await call(app, "add_markings", {
      item_id: fan.item_id,
      points: [
        { x: 100, y: 100 },
        { x: 500, y: 500 },
      ],
      label: "E-01",
    });
    // a run ending 20 pt (0.35 m at 1:50) from the first fan only
    await call(app, "add_markings", {
      item_id: pipe.item_id,
      paths: [
        [
          { x: 120, y: 100 },
          { x: 300, y: 100 },
        ],
      ],
    });
    app.ctx.commit((p) => ({
      ...p,
      items: [
        ...p.items,
        { ...p.items[0], id: "loose", name: "Item solto", catalogId: undefined, system: undefined },
      ],
    }));
    const { data } = await call(app, "review_takeoff");
    const kinds = data.gaps.map((g: { kind: string }) => g.kind);
    expect(data.gaps.filter((g: { kind: string }) => g.kind === "equipment_without_run")).toEqual([
      expect.objectContaining({ item: "Exaustor — Sicflux SONORA 11", at: { x: 500, y: 500 } }),
    ]);
    expect(kinds).toContain("no_discipline");
    expect(data.disciplines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ discipline: "Exaustão", pieces: 2 }),
        expect.objectContaining({ discipline: "Infra AC", lines: 1 }),
      ]),
    );
    expect(data.pending_suggestions).toBe(3);
  });
});
