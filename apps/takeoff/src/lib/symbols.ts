/**
 * Schematic symbols for count items. Each symbol is a set of SVG path strings in a 24×24 box,
 * usable both as `<path d>` in the UI and as `Path2D` on the viewer canvas.
 */
export interface SymbolDef {
  id: string;
  label: string;
  /** Paths stroked in the item colour. The first one is also filled white to occlude the drawing. */
  paths: string[];
  /** Paths filled with the item colour (drawn after the strokes). */
  fills?: string[];
}

const CIRCLE = "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18";
const SQUARE = "M4 4h16v16H4z";

export const SYMBOLS: SymbolDef[] = [
  {
    id: "dot",
    label: "Ponto",
    paths: ["M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14"],
    fills: ["M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14"],
  },
  {
    id: "fan",
    label: "Ventilador",
    paths: [CIRCLE, "M12 12V5", "M12 12l6.1 3.5", "M12 12l-6.1 3.5"],
    fills: ["M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4"],
  },
  {
    id: "exhaust",
    label: "Exaustor",
    paths: [CIRCLE, "M12 12q6-6 8 0", "M12 12q-6 6-8 0", "M12 12q6 6 0 8", "M12 12q-6-6 0-8"],
    fills: ["M12 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3"],
  },
  {
    id: "smoke",
    label: "Detector de fumaça",
    paths: [CIRCLE, "M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9"],
    fills: ["M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4"],
  },
  {
    id: "evap",
    label: "Evaporadora (unidade interna)",
    paths: ["M3 7h18v10H3z", "M6 12q1.5-2 3 0t3 0t3 0t3 0"],
  },
  {
    id: "cond",
    label: "Condensadora (unidade externa)",
    paths: [SQUARE, "M12 6.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11", "M12 12V8", "M12 12l3.5 2"],
    fills: ["M12 10.8a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4"],
  },
  { id: "diffuser", label: "Difusor", paths: [SQUARE, "M4 4l16 16", "M20 4L4 20"] },
  { id: "grille", label: "Grelha", paths: [SQUARE, "M7 9h10", "M7 12h10", "M7 15h10"] },
  {
    id: "louver",
    label: "Veneziana",
    paths: [SQUARE, "M6 8l6 2 6-2", "M6 12l6 2 6-2", "M6 16l6 2 6-2"],
  },
  {
    id: "damper",
    label: "Damper",
    paths: ["M4 6h16v12H4z", "M5.5 16.5L18.5 7.5"],
    fills: ["M12 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3"],
  },
  { id: "thermostat", label: "Termostato", paths: [CIRCLE, "M8 9h8", "M12 9v7"] },
  {
    id: "panel",
    label: "Quadro elétrico",
    paths: ["M5 3h14v18H5z"],
    fills: ["M13 5l-4.5 7.5H13l-2 6.5 5.5-8.5h-4.5z"],
  },
  {
    id: "valve",
    label: "Válvula / registro",
    paths: ["M4 7l8 5-8 5z", "M20 7l-8 5 8 5z", "M12 12V6", "M9 6h6"],
  },
  {
    id: "sensor",
    label: "Sensor",
    paths: ["M12 4l8 15H4z"],
    fills: ["M12 13.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3"],
  },
];

export const SYMBOL_BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));
export const DEFAULT_SYMBOL = "dot";

export const symbolDef = (id: string | undefined): SymbolDef =>
  SYMBOL_BY_ID.get(id ?? DEFAULT_SYMBOL) ?? SYMBOLS[0];

const RULES: [RegExp, string][] = [
  [/detector|fuma[cç]a|smoke/i, "smoke"],
  [/quadro|painel|\bqe\b|\bqd\b/i, "panel"],
  [/exaust|extra[cç][aã]o/i, "exhaust"],
  [/ventilador|\bfan\b|insuflador|ventoinha/i, "fan"],
  [/condensador|unidade externa|\bcond\b|outdoor|\bcu\b/i, "cond"],
  [
    /evaporador|unidade interna|cassete|hi-?wall|piso.?teto|split|fan ?coil|\bfc\b|indoor|\bvrf\b/i,
    "evap",
  ],
  [/difusor|diffuser/i, "diffuser"],
  [/grelha|grille/i, "grille"],
  [/veneziana|louver/i, "louver"],
  [/damper|registro de (vaz|ar)|corta.?fogo|sobre ?press/i, "damper"],
  [/termostato|thermostat|controle remoto|controlador/i, "thermostat"],
  [/v[aá]lvula|valve|registro/i, "valve"],
  [/sensor|acionador|sirene|pressostato|bot[oã]o/i, "sensor"],
];

/** Symbol id suggested by an item name ("dot" when nothing matches). */
export function guessSymbol(name: string): string {
  for (const [re, id] of RULES) if (re.test(name)) return id;
  return DEFAULT_SYMBOL;
}

const pathCache = new Map<string, Path2D>();
const path2d = (d: string): Path2D => {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  return p;
};

/** Draw a symbol centred at (cx, cy) with the given screen size, on a canvas. */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  id: string | undefined,
  cx: number,
  cy: number,
  size: number,
  color: string,
  emphasis: boolean,
): void {
  const def = symbolDef(id);
  const k = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(k, k);
  ctx.lineWidth = (emphasis ? 2.6 : 2) / k;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (def.id === "dot") {
    ctx.fillStyle = color;
    ctx.fill(path2d(def.paths[0]));
    ctx.strokeStyle = emphasis ? "#101a30" : "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1.5 / k;
    ctx.stroke(path2d(def.paths[0]));
    ctx.restore();
    return;
  }
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill(path2d(def.paths[0]));
  ctx.strokeStyle = color;
  for (const d of def.paths) ctx.stroke(path2d(d));
  if (def.fills) {
    ctx.fillStyle = color;
    for (const d of def.fills) ctx.fill(path2d(d));
  }
  ctx.restore();
}
