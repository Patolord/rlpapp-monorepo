/**
 * The comparison of compare.ts as a takeoff file, to look at in the app itself: on the
 * reference's drawings, what the candidate got right, what it missed and what it marked that is
 * not there, each as its own item or location. Open it like any takeoff; it is a picture of the
 * differences, not a budget (nothing is priced).
 */
import {
  type Item,
  type Location,
  type Measurement,
  newId,
  type Project,
  type Zone,
} from "../types";
import type { CountMark, EvalReport } from "./compare";

const RIGHT = "#22c55e";
const MISSED = "#ef4444";
const EXTRA = "#f59e0b";

export function diffProject(reference: Project, report: EvalReport): Project {
  const items: Item[] = [];
  const measurements: Measurement[] = [];
  const locations: Location[] = [];
  const zones: Zone[] = [];

  const itemFor = new Map<string, string>();
  const mark = (group: string, color: string, m: CountMark) => {
    const key = `${group}|${m.item}`;
    let id = itemFor.get(key);
    if (!id) {
      id = newId();
      itemFor.set(key, id);
      items.push({
        id,
        name: `${group}: ${m.item}`,
        kind: "count",
        color,
        group,
        materialPrice: 0,
        laborPrice: 0,
        wastePct: 0,
        system: "Avaliação",
      });
    }
    measurements.push({
      id: newId(),
      itemId: id,
      drawingId: m.drawingId,
      page: m.page - 1,
      points: [m.at],
    });
  };
  for (const m of report.counts.matched) mark("Certo", RIGHT, m);
  for (const m of report.counts.missed) mark("Faltou", MISSED, m);
  for (const m of report.counts.extra) mark("Sobrou", EXTRA, m);

  const region = (
    name: string,
    color: string,
    place: { drawingId: string; page: number },
    points: Zone["points"],
  ) => {
    const location: Location = { id: newId(), name, color };
    locations.push(location);
    zones.push({
      id: newId(),
      locationId: location.id,
      drawingId: place.drawingId,
      page: place.page - 1,
      points,
    });
  };
  for (const m of report.locations.matched) {
    const renamed = m.nameMatches ? "" : ` (IA: ${m.candidateName || "sem nome"})`;
    region(`Certo: ${m.name}${renamed} · ${(m.iou * 100).toFixed(0)}%`, RIGHT, m, m.candidate);
  }
  for (const m of report.locations.missed) region(`Faltou: ${m.name}`, MISSED, m, m.points);
  for (const m of report.locations.extra) region(`Sobrou: ${m.name}`, EXTRA, m, m.points);

  return {
    ...reference,
    // a picture of the differences: its own file, never linked to the reference's budget
    id: undefined,
    sentToApp: undefined,
    name: `Diferenças: ${report.candidate || "candidato"} × ${report.reference || "referência"}`,
    system: "Avaliação",
    items,
    measurements,
    locations,
    zones,
    aiRejected: undefined,
  };
}
