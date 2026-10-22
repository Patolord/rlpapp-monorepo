import {
  type Pt,
  pointAlong,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polylineLength,
} from "./geom";
import {
  DEFAULT_GROUP,
  drawingOf,
  type Item,
  type Measurement,
  type Project,
  type Zone,
} from "./types";
import type { Kind, PageScale, Unit } from "./units";
import { formatQty, qtyUnit } from "./units";

/** Unit shown for an item: its own label (kg, gl…) or the one its kind implies. */
export const itemUnit = (item: Item, unit: Unit): string => item.unit ?? qtyUnit(item.kind, unit);

export function formatItemQty(item: Item, v: number, unit: Unit): string {
  if (!item.unit) return formatQty(item.kind, v, unit);
  const n = item.unit === "pç" ? Math.round(v) : Number.isInteger(v) ? v : v.toFixed(2);
  return `${n} ${item.unit}`;
}

export const pageScale = (
  project: Project,
  drawingId: string | null | undefined,
  page: number,
): PageScale | null => drawingOf(project, drawingId)?.pages[page]?.scale ?? null;

/** Quantity of one measurement in project units, or null when the page is not calibrated. */
export function measurementQty(m: Measurement, kind: Kind, scale: PageScale | null): number | null {
  if (kind === "count") return 1;
  if (!scale) return null;
  if (kind === "linear") return polylineLength(m.points) / scale.pointsPerUnit;
  return polygonArea(m.points) / (scale.pointsPerUnit * scale.pointsPerUnit);
}

/** The point that decides which zone a measurement belongs to. */
export function anchorOf(kind: Kind, points: readonly Pt[]): Pt {
  if (kind === "count" || points.length === 1) return points[0];
  if (kind === "linear") return pointAlong(points, 0.5);
  return polygonCentroid(points);
}

/** Smallest zone on the measurement page that contains its anchor, or null. */
export function zoneOf(project: Project, m: Measurement, kind: Kind): Zone | null {
  if (project.zones.length === 0) return null;
  const a = anchorOf(kind, m.points);
  let best: Zone | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const z of project.zones) {
    if (z.drawingId !== m.drawingId || z.page !== m.page || !pointInPolygon(a, z.points)) continue;
    const area = polygonArea(z.points);
    if (area < bestArea) {
      best = z;
      bestArea = area;
    }
  }
  return best;
}

/** Times a measurement counts: its own repeat (identical floors) × its local's (identical apartments). */
export function repeatOf(project: Project, m: Measurement, kind: Kind, zone?: Zone | null): number {
  const z = zone === undefined ? zoneOf(project, m, kind) : zone;
  return (m.repeat ?? 1) * (z?.repeat ?? 1);
}

export interface ItemTotal {
  qty: number;
  count: number;
  /** Measurements that could not be quantified because their page has no scale. */
  unscaled: number;
}

export function itemTotals(
  project: Project,
  include?: (m: Measurement, kind: Kind) => boolean,
): Map<string, ItemTotal> {
  const items = new Map(project.items.map((i) => [i.id, i]));
  const totals = new Map<string, ItemTotal>();
  for (const item of project.items) totals.set(item.id, { qty: 0, count: 0, unscaled: 0 });
  for (const m of project.measurements) {
    const item = items.get(m.itemId);
    const t = totals.get(m.itemId);
    if (!item || !t) continue;
    if (include && !include(m, item.kind)) continue;
    const q = measurementQty(m, item.kind, pageScale(project, m.drawingId, m.page));
    t.count++;
    if (q === null) t.unscaled++;
    else
      t.qty +=
        (q + (item.kind === "linear" ? (m.vertical ?? 0) : 0)) *
        (item.factor ?? 1) *
        repeatOf(project, m, item.kind);
  }
  // quantities entered directly (derived duct items) count when nothing filters by marking
  if (!include) {
    for (const item of project.items) {
      const t = totals.get(item.id);
      if (t && item.manualQty) t.qty += item.manualQty;
    }
  }
  return totals;
}

/** Key used for measurements outside every zone. */
export const NO_ZONE = "";

/** Item totals per zone id (NO_ZONE for unassigned). Only keys with measurements are present. */
export function totalsByZone(project: Project): Map<string, Map<string, ItemTotal>> {
  const items = new Map(project.items.map((i) => [i.id, i]));
  const out = new Map<string, Map<string, ItemTotal>>();
  for (const m of project.measurements) {
    const item = items.get(m.itemId);
    if (!item) continue;
    const zone = zoneOf(project, m, item.kind);
    const key = zone?.id ?? NO_ZONE;
    let totals = out.get(key);
    if (!totals) {
      totals = new Map();
      out.set(key, totals);
    }
    let t = totals.get(m.itemId);
    if (!t) {
      t = { qty: 0, count: 0, unscaled: 0 };
      totals.set(m.itemId, t);
    }
    const q = measurementQty(m, item.kind, pageScale(project, m.drawingId, m.page));
    t.count++;
    if (q === null) t.unscaled++;
    else
      t.qty +=
        (q + (item.kind === "linear" ? (m.vertical ?? 0) : 0)) *
        (item.factor ?? 1) *
        repeatOf(project, m, item.kind, zone);
  }
  return out;
}

export interface SheetSectionRow {
  item: Item;
  unit: string;
  qty: number;
}

export interface SheetSection {
  name: string;
  rows: SheetSectionRow[];
}

export interface SystemSheet {
  system: string;
  sections: SheetSection[];
}

/**
 * Items grouped the way the RLP budget workbook is laid out: one sheet per system, and inside
 * it one section per location (ambiente) when locations exist and `sectionsBy` is "local",
 * otherwise one section per item group. Items with zero quantity are kept in group mode
 * (the estimator may fill them by hand) but skipped per location.
 */
export function systemSheets(project: Project): SystemSheet[] {
  const bySystem = new Map<string, Item[]>();
  const fallback = project.system || "Orçamento";
  for (const item of project.items) {
    const key = (item.system || fallback).trim() || fallback;
    bySystem.set(key, [...(bySystem.get(key) ?? []), item]);
  }
  const byLocation = project.sectionsBy === "local" && project.zones.length > 0;
  const byZone = byLocation ? totalsByZone(project) : null;
  const totals = itemTotals(project);
  const unit = (item: Item) => itemUnit(item, project.unit);
  const sheets: SystemSheet[] = [];
  for (const [system, items] of bySystem) {
    const sections: SheetSection[] = [];
    if (byZone) {
      const columns = [
        ...project.zones.map((z) => ({ key: z.id, name: z.name })),
        { key: NO_ZONE, name: "Sem local" },
      ];
      for (const c of columns) {
        const t = byZone.get(c.key);
        if (!t) continue;
        const rows = items
          .map((item) => ({
            item,
            unit: unit(item),
            qty: pricedQty(item, t.get(item.id)?.qty ?? 0),
          }))
          .filter((r) => r.qty > 0);
        if (rows.length) sections.push({ name: c.name, rows });
      }
    } else {
      const groups = new Map<string, SheetSectionRow[]>();
      for (const item of items) {
        const g = item.group || DEFAULT_GROUP;
        groups.set(g, [
          ...(groups.get(g) ?? []),
          { item, unit: unit(item), qty: pricedQty(item, totals.get(item.id)?.qty ?? 0) },
        ]);
      }
      for (const [name, rows] of groups) sections.push({ name, rows });
    }
    sheets.push({ system, sections });
  }
  return sheets;
}

export interface ZoneMatrix {
  /** Column headers: zone names, plus "Sem local" last when something is unassigned. */
  columns: { key: string; name: string }[];
  rows: { item: Item; unit: string; qty: number[]; total: number }[];
}

/** Item × zone quantity table (priced quantities, with waste) for the "Por Local" sheet. */
export function zoneMatrix(project: Project): ZoneMatrix {
  const by = totalsByZone(project);
  const columns = project.zones.map((z) => ({ key: z.id, name: z.name }));
  if (by.has(NO_ZONE)) columns.push({ key: NO_ZONE, name: "Sem local" });
  const rows = project.items.map((item) => {
    const qty = columns.map((c) => pricedQty(item, by.get(c.key)?.get(item.id)?.qty ?? 0));
    return {
      item,
      unit: itemUnit(item, project.unit),
      qty,
      total: qty.reduce((s, q) => s + q, 0),
    };
  });
  return { columns, rows };
}

export const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Quantity to price: measured quantity plus waste, counts rounded up to whole units. */
export function pricedQty(item: Item, measured: number): number {
  const q = measured * (1 + item.wastePct / 100);
  return item.kind === "count" ? Math.ceil(q - 1e-9) || 0 : round2(q);
}

export interface QuoteLine {
  item: Item;
  /** Measured quantity before waste. */
  measured: number;
  /** Quantity used for pricing (with waste). */
  qty: number;
  unit: string;
  unscaled: number;
  material: number;
  labor: number;
  total: number;
}

export interface QuoteGroup {
  name: string;
  lines: QuoteLine[];
  material: number;
  labor: number;
  total: number;
}

export interface Quote {
  groups: QuoteGroup[];
  /** Sum over all item lines. */
  material: number;
  labor: number;
  subtotal: number;
  /** Diversos (material), Transportes (labour), Supervisão (labour): each extrasPct / 3 of subtotal. */
  extraEach: number;
  totalMaterial: number;
  totalLabor: number;
  totalGeral: number;
  /** TOTAL GERAL × BDI. */
  proposal: number;
}

export function buildQuote(project: Project): Quote {
  const totals = itemTotals(project);
  const groups = new Map<string, QuoteGroup>();
  for (const item of project.items) {
    const t = totals.get(item.id) ?? { qty: 0, count: 0, unscaled: 0 };
    const qty = pricedQty(item, t.qty);
    const material = round2(item.materialPrice * qty);
    const labor = round2(item.laborPrice * qty);
    const line: QuoteLine = {
      item,
      measured: t.qty,
      qty,
      unit: itemUnit(item, project.unit),
      unscaled: t.unscaled,
      material,
      labor,
      total: round2(material + labor),
    };
    const name = item.group || DEFAULT_GROUP;
    let g = groups.get(name);
    if (!g) {
      g = { name, lines: [], material: 0, labor: 0, total: 0 };
      groups.set(name, g);
    }
    g.lines.push(line);
    g.material += material;
    g.labor += labor;
    g.total += line.total;
  }
  const list = [...groups.values()];
  const material = list.reduce((s, g) => s + g.material, 0);
  const labor = list.reduce((s, g) => s + g.labor, 0);
  const subtotal = material + labor;
  const extraEach = round2((subtotal * (project.extrasPct / 100)) / 3);
  const totalMaterial = material + extraEach;
  const totalLabor = labor + extraEach * 2;
  const totalGeral = totalMaterial + totalLabor;
  return {
    groups: list,
    material,
    labor,
    subtotal,
    extraEach,
    totalMaterial,
    totalLabor,
    totalGeral,
    proposal: round2(totalGeral * project.bdi),
  };
}

export function quoteCsv(project: Project, quote: Quote): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    [
      "ITEM",
      "DESCRIÇÃO",
      "UNID.",
      "QUANT.",
      "MATERIAL",
      "M. DE OBRA",
      "TOTAL UNIT.",
      "TOTAL MATERIAL",
      "TOTAL M.O.",
      "TOTAL",
    ].join(";"),
  ];
  quote.groups.forEach((g, gi) => {
    rows.push(
      [
        gi + 1,
        esc(g.name),
        "",
        "",
        "",
        "",
        "",
        g.material.toFixed(2),
        g.labor.toFixed(2),
        g.total.toFixed(2),
      ].join(";"),
    );
    g.lines.forEach((l, li) => {
      rows.push(
        [
          `${gi + 1}.${li + 1}`,
          esc(l.item.name),
          l.unit,
          l.qty.toFixed(2),
          l.item.materialPrice.toFixed(2),
          l.item.laborPrice.toFixed(2),
          (l.item.materialPrice + l.item.laborPrice).toFixed(2),
          l.material.toFixed(2),
          l.labor.toFixed(2),
          l.total.toFixed(2),
        ].join(";"),
      );
    });
  });
  const n = quote.groups.length;
  rows.push(
    [
      n + 1,
      "Diversos",
      "vb",
      1,
      quote.extraEach.toFixed(2),
      "",
      "",
      quote.extraEach.toFixed(2),
      "",
      quote.extraEach.toFixed(2),
    ].join(";"),
  );
  rows.push(
    [
      n + 2,
      "Transportes",
      "vb",
      1,
      "",
      quote.extraEach.toFixed(2),
      "",
      "",
      quote.extraEach.toFixed(2),
      quote.extraEach.toFixed(2),
    ].join(";"),
  );
  rows.push(
    [
      n + 3,
      "Supervisão e Projeto As Built",
      "vb",
      1,
      "",
      quote.extraEach.toFixed(2),
      "",
      "",
      quote.extraEach.toFixed(2),
      quote.extraEach.toFixed(2),
    ].join(";"),
  );
  rows.push(
    [
      "",
      "TOTAL GERAL",
      "",
      "",
      "",
      "",
      "",
      quote.totalMaterial.toFixed(2),
      quote.totalLabor.toFixed(2),
      quote.totalGeral.toFixed(2),
    ].join(";"),
  );
  rows.push(
    ["", `BDI ${project.bdi}`, "", "", "", "", "", "", "", quote.proposal.toFixed(2)].join(";"),
  );
  return rows.join("\n");
}
