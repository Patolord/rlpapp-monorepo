import { describe, expect, it } from "vitest";
import {
  adjustScale,
  applyRevision,
  applySimilarity,
  defaultPageMap,
  droppedCount,
  IDENTITY,
  invertSimilarity,
  isIdentity,
  oldPageFor,
  pointTransform,
  remapPages,
  rotationOf,
  type Similarity,
  scaleOf,
  similarityFrom2Points,
  sizeDiffers,
  transformMarkings,
} from "./align";
import type { Pt } from "./geom";
import { emptyProject, type Measurement, type Project, type Zone } from "./types";
import { formatFixed, metricScale } from "./units";

const close = (p: Pt, q: Pt) => {
  expect(p.x).toBeCloseTo(q.x, 9);
  expect(p.y).toBeCloseTo(q.y, 9);
};

const square = (s: number, o = 0): Pt[] => [
  { x: o, y: o },
  { x: o + s, y: o },
  { x: o + s, y: o + s },
  { x: o, y: o + s },
];

describe("similarityFrom2Points", () => {
  it("is the identity for the same points", () => {
    const t = similarityFrom2Points(
      { x: 10, y: 20 },
      { x: 300, y: 40 },
      { x: 10, y: 20 },
      {
        x: 300,
        y: 40,
      },
    ) as Similarity;
    expect(isIdentity(t)).toBe(true);
    close(applySimilarity(t, { x: 123, y: -7 }), { x: 123, y: -7 });
  });

  it("is a pure translation when both pairs are shifted alike", () => {
    const t = similarityFrom2Points(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 15, y: -5 },
      {
        x: 115,
        y: -5,
      },
    ) as Similarity;
    expect(scaleOf(t)).toBeCloseTo(1, 12);
    expect(rotationOf(t)).toBeCloseTo(0, 12);
    close(applySimilarity(t, { x: 40, y: 60 }), { x: 55, y: 55 });
  });

  it("scales uniformly around the reference points", () => {
    // the new sheet is plotted twice as large, anchored at (10, 10)
    const t = similarityFrom2Points(
      { x: 10, y: 10 },
      { x: 20, y: 30 },
      { x: 10, y: 10 },
      {
        x: 30,
        y: 50,
      },
    ) as Similarity;
    expect(scaleOf(t)).toBeCloseTo(2, 12);
    close(applySimilarity(t, { x: 0, y: 0 }), { x: -10, y: -10 });
    close(applySimilarity(t, { x: 15, y: 10 }), { x: 20, y: 10 });
  });

  it("rotates (a sheet turned 90°)", () => {
    const t = similarityFrom2Points(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 50, y: 50 },
      {
        x: 50,
        y: 60,
      },
    ) as Similarity;
    expect(scaleOf(t)).toBeCloseTo(1, 12);
    expect(rotationOf(t)).toBeCloseTo(Math.PI / 2, 12);
    close(applySimilarity(t, { x: 0, y: 10 }), { x: 40, y: 50 });
    close(pointTransform(t)({ x: 10, y: 0 }), { x: 50, y: 60 });
  });

  it("maps both reference points exactly and round-trips through its inverse", () => {
    const a1 = { x: 12.5, y: 80 };
    const a2 = { x: 410, y: 333 };
    const b1 = { x: -3, y: 140 };
    const b2 = { x: 700, y: 222 };
    const t = similarityFrom2Points(a1, a2, b1, b2) as Similarity;
    close(applySimilarity(t, a1), b1);
    close(applySimilarity(t, a2), b2);
    const inv = invertSimilarity(t);
    for (const p of [
      { x: 0, y: 0 },
      { x: 999, y: -42 },
      { x: 3.25, y: 7.5 },
    ]) {
      close(applySimilarity(inv, applySimilarity(t, p)), p);
    }
    expect(scaleOf(inv)).toBeCloseTo(1 / scaleOf(t), 12);
  });

  it("refuses a pair made of one point", () => {
    const p = { x: 1, y: 1 };
    expect(similarityFrom2Points(p, p, p, { x: 2, y: 2 })).toBeNull();
    expect(similarityFrom2Points(p, { x: 2, y: 2 }, p, p)).toBeNull();
  });
});

describe("page scales and sizes", () => {
  it("keeps the real-world scale of a re-plotted sheet", () => {
    const s = metricScale(100);
    const t: Similarity = { a: 0.5, b: 0, tx: 3, ty: 4 }; // A0 re-plotted at half size
    const adjusted = adjustScale(s, t);
    expect(adjusted?.pointsPerUnit).toBeCloseTo(s.pointsPerUnit / 2, 9);
    expect(adjusted?.label).toBe("1:200 (ajustada)");
    // a length measured on the old sheet is the same real length on the new one
    const old = 283.46; // points
    expect((old * 0.5) / (adjusted?.pointsPerUnit ?? 1)).toBeCloseTo(old / s.pointsPerUnit, 9);
    expect(adjustScale(s, IDENTITY)).toBe(s);
    expect(adjustScale(s, { a: 1, b: 0, tx: 50, ty: 0 })).toBe(s);
    expect(adjustScale(null, t)).toBeNull();
  });

  it("tells a re-plot from rounding", () => {
    expect(sizeDiffers({ w: 2384, h: 1684 }, { w: 2384.4, h: 1684 })).toBe(false);
    expect(sizeDiffers({ w: 2384, h: 1684 }, { w: 1191, h: 842 })).toBe(true);
  });

  it("maps pages 1:1 by default and drops the extra old ones", () => {
    expect(defaultPageMap(3, 2)).toEqual([0, 1, null]);
    expect(defaultPageMap(2, 4)).toEqual([0, 1]);
  });

  it("carries page scales to the pages they map to", () => {
    const s = metricScale(50);
    const pages = [{ scale: s }, { scale: null }, { scale: metricScale(100) }];
    const t: Similarity = { a: 2, b: 0, tx: 0, ty: 0 };
    const out = remapPages(pages, [1, null, 0], [t, null, null], 3);
    expect(out[0].scale).toBe(pages[2].scale);
    expect(out[1].scale?.pointsPerUnit).toBeCloseTo(s.pointsPerUnit * 2, 9);
    expect(out[2]).toEqual({ scale: null });
  });

  it("finds the old page shown under a new page", () => {
    const rev = { path: "a.pdf", name: "a.pdf", replacedAt: 0 };
    expect(oldPageFor(rev, 3)).toBe(3);
    expect(oldPageFor({ ...rev, pageMap: [1, null, 0] }, 0)).toBe(2);
    expect(oldPageFor({ ...rev, pageMap: [1, null, 0] }, 2)).toBeNull();
  });
});

const m = (id: string, drawingId: string, page: number, points: Pt[]): Measurement => ({
  id,
  itemId: "i",
  drawingId,
  page,
  points,
});
const z = (id: string, locationId: string, drawingId: string, page: number): Zone => ({
  id,
  locationId,
  drawingId,
  page,
  points: square(100),
});

function project(): Project {
  return {
    ...emptyProject(),
    drawings: [
      {
        id: "d",
        path: "/obra/rev0.pdf",
        name: "rev0.pdf",
        pages: [{ scale: metricScale(100) }, { scale: metricScale(50) }],
      },
      { id: "o", path: "/obra/outra.pdf", name: "outra.pdf", pages: [{ scale: null }] },
    ],
    activeDrawingId: "d",
    measurements: [
      m("m1", "d", 0, [{ x: 10, y: 10 }]),
      m("m2", "d", 1, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
      m("m3", "o", 1, [{ x: 5, y: 5 }]),
    ],
    locations: [
      { id: "L1", name: "Térreo", color: "#fff" },
      { id: "L2", name: "Cobertura", color: "#000" },
    ],
    zones: [z("z1", "L1", "d", 0), z("z2", "L2", "d", 1), z("z3", "L1", "o", 0)],
  };
}

describe("transformMarkings", () => {
  it("leaves everything in place for an identity map", () => {
    const p = project();
    const out = transformMarkings(p.measurements, p.zones, "d", [0, 1], [null, IDENTITY]);
    expect(out.dropped).toBe(0);
    out.measurements.forEach((x, i) => {
      expect(x).toBe(p.measurements[i]);
    });
    out.zones.forEach((x, i) => {
      expect(x).toBe(p.zones[i]);
    });
  });

  it("moves pages, applies transforms and drops unmapped pages without mutating", () => {
    const p = project();
    const before = JSON.stringify(p);
    const t: Similarity = { a: 2, b: 0, tx: 1, ty: 0 };
    const out = transformMarkings(p.measurements, p.zones, "d", [null, 0], [null, t]);
    expect(out.dropped).toBe(2); // m1 and z1 were on old page 0
    expect(out.measurements.map((x) => x.id)).toEqual(["m2", "m3"]);
    expect(out.measurements[0]).toMatchObject({ page: 0 });
    expect(out.measurements[0].points).toEqual([
      { x: 1, y: 0 },
      { x: 201, y: 0 },
    ]);
    expect(out.measurements[1]).toBe(p.measurements[2]); // other drawing
    expect(out.zones.map((x) => [x.id, x.page])).toEqual([
      ["z2", 0],
      ["z3", 0],
    ]);
    expect(out.zones[0].points[2]).toEqual({ x: 201, y: 200 });
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("applyRevision", () => {
  it("keeps a same-size revision's markings in place and records the old PDF", () => {
    const p = project();
    const q = applyRevision(p, "d", {
      path: "/obra/rev1.pdf",
      name: "rev1.pdf",
      pageMap: [0, 1],
      transforms: [null, null],
      pageCount: 2,
      now: 42,
    });
    const d = q.drawings[0];
    expect(d).toMatchObject({ path: "/obra/rev1.pdf", name: "rev1.pdf" });
    expect(d.revisions).toEqual([
      { path: "/obra/rev0.pdf", name: "rev0.pdf", replacedAt: 42, pageMap: [0, 1] },
    ]);
    expect(d.pages.map((pg) => pg.scale)).toEqual(p.drawings[0].pages.map((pg) => pg.scale));
    expect(q.measurements).toEqual(p.measurements);
    expect(q.zones).toEqual(p.zones);
    expect(q.locations).toBe(p.locations);
    expect(q.drawings[1]).toBe(p.drawings[1]);
  });

  it("aligns, adds pages, drops unmapped ones and prunes empty locations", () => {
    const p = project();
    const t = similarityFrom2Points(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 10, y: 10 },
      {
        x: 60,
        y: 10,
      },
    ) as Similarity; // the new sheet is half the size, shifted
    expect(droppedCount(p, "d", [2, null])).toBe(2);
    const q = applyRevision(p, "d", {
      path: "/obra/rev1.pdf",
      name: "rev1.pdf",
      pageMap: [null, 2],
      transforms: [null, t],
      pageCount: 3,
      now: 7,
    });
    const d = q.drawings[0];
    expect(d.pages).toHaveLength(3);
    expect(d.pages[0].scale).toBeNull();
    expect(d.pages[2].scale?.pointsPerUnit).toBeCloseTo(metricScale(50).pointsPerUnit / 2, 9);
    expect(d.revisions?.[0]).toMatchObject({ pageMap: [null, 2], transforms: [null, t] });
    expect(q.measurements.map((x) => x.id)).toEqual(["m2", "m3"]);
    expect(q.measurements[0].page).toBe(2);
    expect(q.measurements[0].points).toEqual([
      { x: 10, y: 10 },
      { x: 60, y: 10 },
    ]);
    // the measured length in real units does not change
    const len = (pts: Pt[], ppu: number) =>
      Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / ppu;
    expect(len(q.measurements[0].points, d.pages[2].scale?.pointsPerUnit ?? 1)).toBeCloseTo(
      len(p.measurements[1].points, metricScale(50).pointsPerUnit),
      9,
    );
    // Térreo keeps its region on the other drawing; Cobertura's region moved
    expect(q.zones.map((x) => x.id)).toEqual(["z2", "z3"]);
    expect(q.locations.map((l) => l.id)).toEqual(["L1", "L2"]);
    // dropping Cobertura's only region removes the location
    const r = applyRevision(p, "d", {
      path: "/obra/rev1.pdf",
      name: "rev1.pdf",
      pageMap: [0, null],
      transforms: [],
      pageCount: 1,
      now: 7,
    });
    expect(r.locations.map((l) => l.id)).toEqual(["L1"]);
  });

  it("is a no-op for an unknown drawing", () => {
    const p = project();
    expect(
      applyRevision(p, "x", {
        path: "a",
        name: "a",
        pageMap: [],
        transforms: [],
        pageCount: 0,
        now: 0,
      }),
    ).toBe(p);
  });
});

describe("alignment readout", () => {
  it("never shows a negative zero", () => {
    // a pure shift and scale between two re-plotted sheets: atan2 gives -0 or a tiny negative
    const t = similarityFrom2Points(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 38, y: 52 },
      {
        x: 118,
        y: -1e-12 + 52,
      },
    );
    expect(t).not.toBeNull();
    const deg = ((t ? rotationOf(t) : 0) * 180) / Math.PI;
    expect(formatFixed(deg, 2)).toBe("0,00");
    expect(formatFixed(-0, 1)).toBe("0,0");
    expect(formatFixed(-0.004, 2)).toBe("0,00");
    expect(formatFixed(-0.04, 1)).toBe("0,0");
  });

  it("keeps real negatives and the pt-BR decimal comma", () => {
    expect(formatFixed(-0.006, 2)).toBe("-0,01");
    expect(formatFixed(0.8, 4)).toBe("0,8000");
    expect(formatFixed(1234.5, 1)).toBe("1.234,5");
  });
});
