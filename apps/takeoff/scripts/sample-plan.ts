/**
 * Writes a small made-up floor plan (samples/planta-sintetica.pdf, A3 at 1:50) to try the AI
 * agent tools and the eval on, without a client's drawing: three closed rooms and one that does
 * not close, named in text, grilles and exhaust fans as repeated symbols, a dimension line and
 * a title block with the scale. Beside it goes its takeoff as a person would close it
 * (planta-sintetica.referencia.takeoff.json): the reference `pnpm eval` scores an agent's
 * takeoff of this plan against. Run from apps/takeoff: `pnpm sample-plan`.
 *
 * It is a well-behaved PDF (real text, clean vectors), so it checks the plumbing; how the agent
 * copes with scans and exploded text has to be measured on real drawings.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import { emptyProject, type Project } from "../src/lib/types";
import { metricScale } from "../src/lib/units";

/** Page points per metre at 1:50. */
const M = (1000 / 50) * (72 / 25.4);
const W = 1190.55;
const H = 841.89;
const INK = rgb(0, 0, 0);

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../samples/planta-sintetica.pdf");

/** Top-left coordinates (as the app uses) to pdf-lib's bottom-left ones. */
const y = (top: number) => H - top;

function line(page: PDFPage, x1: number, y1: number, x2: number, y2: number, thickness = 1.5) {
  page.drawLine({ start: { x: x1, y: y(y1) }, end: { x: x2, y: y(y2) }, thickness, color: INK });
}

function room(page: PDFPage, x: number, top: number, w: number, h: number, gap?: [number, number]) {
  line(page, x, top, x + w, top);
  line(page, x + w, top, x + w, top + h);
  line(page, x, top, x, top + h);
  if (gap) {
    // a doorway left open in the bottom wall
    line(page, x, top + h, x + gap[0], top + h);
    line(page, x + gap[1], top + h, x + w, top + h);
  } else {
    line(page, x, top + h, x + w, top + h);
  }
}

/** A grille: a small square with its diagonals. */
function grille(page: PDFPage, cx: number, cy: number) {
  const r = 7;
  line(page, cx - r, cy - r, cx + r, cy - r, 0.8);
  line(page, cx + r, cy - r, cx + r, cy + r, 0.8);
  line(page, cx + r, cy + r, cx - r, cy + r, 0.8);
  line(page, cx - r, cy + r, cx - r, cy - r, 0.8);
  line(page, cx - r, cy - r, cx + r, cy + r, 0.8);
  line(page, cx - r, cy + r, cx + r, cy - r, 0.8);
}

/** An exhaust fan: a circle with a cross. */
function fan(page: PDFPage, cx: number, cy: number) {
  page.drawCircle({ x: cx, y: y(cy), size: 9, borderWidth: 0.8, borderColor: INK });
  line(page, cx - 9, cy, cx + 9, cy, 0.8);
  line(page, cx, cy - 9, cx, cy + 9, 0.8);
}

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([W, H]);
const text = (s: string, x: number, top: number, size = 9) =>
  page.drawText(s, { x, y: y(top), size, font, color: INK });

const left = 90;
const top = 110;
const w = 5 * M;
const h = 4 * M;

// three closed rooms in a row and, below the first, a hall whose doorway is open
room(page, left, top, w, h);
room(page, left + w, top, w, h);
room(page, left + 2 * w, top, 3 * M, h);
room(page, left, top + h, w, 3 * M, [2 * M, 3 * M]);

text("SALA 101", left + 0.4 * M, top + 0.6 * M);
text("SALA 102", left + w + 0.4 * M, top + 0.6 * M);
text("COPA", left + 2 * w + 0.4 * M, top + 0.6 * M);
text("HALL", left + 0.4 * M, top + h + 0.6 * M);

// grilles: two per room; fans: one in the copa and one in the hall
const grilles = [
  [left + 1.5 * M, top + 2 * M],
  [left + 3.5 * M, top + 2 * M],
  [left + w + 1.5 * M, top + 2 * M],
  [left + w + 3.5 * M, top + 2 * M],
  [left + 2 * w + 1.5 * M, top + 1.2 * M],
  [left + 1.2 * M, top + h + 1.5 * M],
];
const fans = [
  [left + 2 * w + 1.5 * M, top + 2.8 * M],
  [left + 3.8 * M, top + h + 1.5 * M],
];
for (const [gx, gy] of grilles) grille(page, gx, gy);
fans.forEach(([fx, fy], i) => {
  fan(page, fx, fy);
  text(`VE-0${i + 1}`, fx + 14, fy + 3, 7);
});

// a dimension line over the first room: 5,00 m
const dimTop = top - 22;
line(page, left, dimTop, left + w, dimTop, 0.6);
line(page, left, dimTop - 5, left, dimTop + 5, 0.6);
line(page, left + w, dimTop - 5, left + w, dimTop + 5, 0.6);
text("5,00", left + w / 2 - 9, dimTop - 4, 8);

// legend
const lx = 830;
const ly = 560;
text("LEGENDA", lx, ly, 10);
grille(page, lx + 8, ly + 22);
text("GRELHA DE INSUFLAMENTO 400x200", lx + 26, ly + 25, 8);
fan(page, lx + 8, ly + 48);
text("VE - VENTILADOR DE EXAUSTAO", lx + 26, ly + 51, 8);

// title block
const bx = 820;
const by = 700;
room(page, bx, by, 320, 100);
text("OBRA EXEMPLO - PAVIMENTO TIPO", bx + 10, by + 22, 10);
text("EXAUSTAO E INSUFLAMENTO", bx + 10, by + 40, 9);
text("ESC. 1:50", bx + 10, by + 62, 9);
text("FOLHA 01/01 - A3", bx + 10, by + 80, 8);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await doc.save());
console.log(`Planta de exemplo: ${out}`);

// the same plan as a closed takeoff: the reference an agent's takeoff is scored against
const box = (x: number, t: number, bw: number, bh: number) => [
  { x, y: t },
  { x: x + bw, y: t },
  { x: x + bw, y: t + bh },
  { x, y: t + bh },
];
const rooms: [string, ReturnType<typeof box>][] = [
  ["Sala 101", box(left, top, w, h)],
  ["Sala 102", box(left + w, top, w, h)],
  ["Copa", box(left + 2 * w, top, 3 * M, h)],
  ["Hall", box(left, top + h, w, 3 * M)],
];
const mark = (itemId: string, [x, y]: number[], i: number) => ({
  id: `${itemId}-${i + 1}`,
  itemId,
  drawingId: "planta",
  page: 0,
  points: [{ x, y }],
});
const reference: Project = {
  ...emptyProject(),
  name: "Planta sintética (referência)",
  system: "Exaustão",
  drawings: [
    {
      id: "planta",
      path: out,
      relPath: "planta-sintetica.pdf",
      name: "planta-sintetica.pdf",
      pages: [{ scale: metricScale(50) }],
    },
  ],
  activeDrawingId: "planta",
  items: [
    {
      id: "grelha",
      name: "Grelha de insuflamento 400x200",
      kind: "count",
      color: "#f97316",
      group: "Bocas de Ar",
      materialPrice: 180,
      laborPrice: 45,
      wastePct: 0,
      symbol: "grille",
    },
    {
      id: "ventilador",
      name: "Ventilador de exaustão",
      kind: "count",
      color: "#22d3ee",
      group: "Equipamentos",
      materialPrice: 2400,
      laborPrice: 350,
      wastePct: 0,
      symbol: "exhaust",
    },
  ],
  measurements: [
    ...grilles.map((g, i) => mark("grelha", g, i)),
    ...fans.map((f, i) => mark("ventilador", f, i)),
  ],
  locations: rooms.map(([name], i) => ({
    id: `local-${i + 1}`,
    name,
    color: ["#38bdf8", "#fb923c", "#a78bfa", "#4ade80"][i],
  })),
  zones: rooms.map(([, points], i) => ({
    id: `regiao-${i + 1}`,
    locationId: `local-${i + 1}`,
    drawingId: "planta",
    page: 0,
    points,
  })),
};
const referenceOut = resolve(here, "../samples/planta-sintetica.referencia.takeoff.json");
writeFileSync(referenceOut, JSON.stringify(reference, null, 2));
console.log(`Levantamento de referência: ${referenceOut}`);
