import clsx from "clsx";
import { useMemo } from "react";
import { switchDrawing } from "../lib/files";
import { bbox } from "../lib/geom";
import type { Item } from "../lib/types";
import {
  formatHp,
  ROLE_SHORT,
  type SizedRun,
  type VrfBrand,
  type VrfRun,
  ykitModel,
} from "../lib/vrf";
import { buildVrfTree, layoutVrfTree, type VrfNode } from "../lib/vrfTree";
import { useStore } from "../store";
import { viewerApi } from "../viewerApi";

const COL = 200;
const ROW = 56;
const PAD_X = 16;
const PAD_Y = 28;
const COND_W = 132;
const COND_H = 40;
const EVAP_W = 84;
const EVAP_H = 28;

/**
 * The system as the vendor selection tools draw it: condenser on the left, Y-kits at the forks,
 * evaporators on the right, each run labelled with its length, tube pair and elbows. The tree
 * comes from the drawing (runs joined end to end), so the capacity shown at every joint and run
 * is the sum of the evaporators downstream; a typed intermediate HP that disagrees is flagged.
 * Clicking a run selects it on the plan and brings it into view.
 */
export function VrfSchematic({
  system,
  runs,
  brand,
  systemHp,
}: {
  system: Item;
  runs: SizedRun[];
  brand?: VrfBrand;
  systemHp: number;
}) {
  const selection = useStore((s) => s.selection);
  const activeDrawingId = useStore((s) => s.project.activeDrawingId);
  const tree = useMemo(() => buildVrfTree(runs), [runs]);
  const layout = useMemo(() => layoutVrfTree(tree), [tree]);
  const byId = useMemo(() => new Map(runs.map((r) => [r.id ?? "", r])), [runs]);

  const focusRun = (r: VrfRun) => {
    const id = r.id;
    if (!id) return;
    const go = () => {
      const s = useStore.getState();
      if (r.page !== undefined) s.setPage(r.page);
      s.setSelection([id]);
      if (r.points?.length) viewerApi.current?.focusBox(bbox(r.points));
    };
    if (r.drawingId && r.drawingId !== activeDrawingId) void switchDrawing(r.drawingId).then(go);
    else go();
  };

  if (!tree.root) {
    return (
      <div className="px-2 py-3 text-neutral-500">
        Nenhum trecho deste sistema está marcado como{" "}
        <span className="text-neutral-300">Saída da condensadora</span>. Marque o primeiro trecho (o
        que sai da condensadora) com esse tipo e o esquema se monta a partir dele.
        <LooseList runs={tree.loose} onPick={focusRun} />
      </div>
    );
  }

  const x = (col: number) => PAD_X + COND_W / 2 + col * COL;
  const y = (row: number) => PAD_Y + row * ROW + ROW / 2;
  const width = PAD_X * 2 + (layout.cols - 1) * COL + COND_W + EVAP_W;
  const height = PAD_Y * 2 + Math.max(1, layout.rows) * ROW;
  const rootHp = tree.nodes.get(tree.root)?.hp ?? 0;

  /** Where a node's glyph starts and ends horizontally (edges attach outside the glyph). */
  const halfW = (n: VrfNode) =>
    n.kind === "condenser" ? COND_W / 2 : n.kind === "evaporator" ? EVAP_W / 2 : 6;

  const nodes = [...tree.nodes.values()].filter((n) => layout.pos.has(n.id));

  return (
    <div className="overflow-auto">
      <svg
        width={width}
        height={height}
        className="block text-[10px]"
        role="img"
        aria-label={`Esquema do sistema ${system.name}`}
      >
        {/* runs */}
        {[...tree.edges.entries()].map(([runId, e]) => {
          const run = byId.get(runId);
          const from = tree.nodes.get(e.from);
          const to = tree.nodes.get(e.to);
          const pf = from && layout.pos.get(from.id);
          const pt = to && layout.pos.get(to.id);
          if (!run || !from || !to || !pf || !pt) return null;
          const x0 = x(pf.col) + halfW(from);
          const y0 = y(pf.row);
          const x1 = x(pt.col) - halfW(to);
          const y1 = y(pt.row);
          const xm = x0 + 28;
          const d = `M${x0} ${y0} H${xm} V${y1} H${x1}`;
          const selected = selection.includes(runId);
          const lx = (xm + x1) / 2;
          return (
            // biome-ignore lint/a11y/useSemanticElements: SVG has no button element; the group is keyboard-reachable
            <g
              key={runId}
              className="cursor-pointer"
              onClick={() => focusRun(run)}
              onKeyDown={(ev) => ev.key === "Enter" && focusRun(run)}
              tabIndex={0}
              role="button"
              aria-label={`${ROLE_SHORT[run.spec.role]} · ${run.length.toFixed(1)} m · ${run.gas}" × ${run.liquid}"`}
            >
              <title>
                {`${run.tag ?? "Trecho"} · ${ROLE_SHORT[run.spec.role]} · ${run.length.toFixed(2)} m · gás ${run.gas}" · líquido ${run.liquid}" · ${run.spec.curves} curvas · ${formatHp(e.hp)} a jusante. Clique para ver no desenho`}
              </title>
              <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
              <path
                d={d}
                fill="none"
                className={selected ? "stroke-orange-400" : "stroke-neutral-500"}
                strokeWidth={selected ? 2.5 : 1.5}
              />
              <text
                x={lx}
                y={y1 - 5}
                textAnchor="middle"
                className={clsx("font-mono", selected ? "fill-orange-300" : "fill-neutral-200")}
              >
                {run.length.toFixed(1)} m{run.spec.curves > 0 ? ` · ${run.spec.curves}c` : ""}
              </text>
              <text x={lx} y={y1 + 12} textAnchor="middle" className="fill-neutral-400 font-mono">
                {run.gas}" × {run.liquid}"{run.spec.role === "trunk" ? ` · ${formatHp(e.hp)}` : ""}
              </text>
            </g>
          );
        })}

        {/* nodes */}
        {nodes.map((n) => {
          const p = layout.pos.get(n.id);
          if (!p) return null;
          const cx = x(p.col);
          const cy = y(p.row);
          if (n.kind === "condenser") {
            // combination ratio: connected indoor capacity over the condenser's
            const ratio = systemHp > 0 ? rootHp / systemHp : 0;
            const off = ratio < 0.5 || ratio > 1.3;
            return (
              <g key={n.id}>
                <rect
                  x={cx - COND_W / 2}
                  y={cy - COND_H / 2}
                  width={COND_W}
                  height={COND_H}
                  rx={4}
                  className="fill-neutral-800 stroke-neutral-600"
                />
                <text
                  x={cx}
                  y={cy - 4}
                  textAnchor="middle"
                  className="fill-neutral-100 font-medium"
                >
                  {system.name.length > 20 ? `${system.name.slice(0, 19)}…` : system.name}
                </text>
                <text x={cx} y={cy + 9} textAnchor="middle" className="fill-neutral-400">
                  {brand?.name ?? "marca"} · {formatHp(systemHp)}
                </text>
                <text
                  x={cx}
                  y={cy + COND_H / 2 + 11}
                  textAnchor="middle"
                  className={off ? "fill-amber-400" : "fill-neutral-500"}
                >
                  <title>
                    Taxa de combinação: capacidade das evaporadoras ligadas sobre a da condensadora
                  </title>
                  evaporadoras {formatHp(rootHp)}
                  {systemHp > 0 ? ` · combinação ${Math.round(ratio * 100)}%` : ""}
                </text>
              </g>
            );
          }
          if (n.kind === "evaporator") {
            return (
              <g key={n.id}>
                <rect
                  x={cx - EVAP_W / 2}
                  y={cy - EVAP_H / 2}
                  width={EVAP_W}
                  height={EVAP_H}
                  rx={3}
                  className="fill-neutral-800 stroke-neutral-600"
                />
                <text x={cx} y={cy + 3.5} textAnchor="middle" className="fill-neutral-100">
                  Evap. {formatHp(n.hp)}
                </text>
              </g>
            );
          }
          if (n.kind === "joint") {
            const model = brand ? ykitModel(brand, n.hp) : "";
            return (
              <g key={n.id}>
                <circle cx={cx} cy={cy} r={5} className="fill-orange-400" />
                <text x={cx} y={cy - 9} textAnchor="middle" className="fill-neutral-200 font-mono">
                  {model || "Y-kit"}
                </text>
                <text x={cx} y={cy + 17} textAnchor="middle" className="fill-neutral-500">
                  {formatHp(n.hp)}
                  {n.children.length > 2 ? ` · ${n.children.length} saídas` : ""}
                </text>
              </g>
            );
          }
          if (n.kind === "open") {
            return (
              <g key={n.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  className="fill-none stroke-amber-400"
                  strokeWidth={1.5}
                />
                <text x={cx + 9} y={cy + 3.5} className="fill-amber-400">
                  em aberto
                </text>
              </g>
            );
          }
          return <circle key={n.id} cx={cx} cy={cy} r={3} className="fill-neutral-500" />;
        })}
      </svg>
      <LooseList runs={tree.loose} onPick={focusRun} />
    </div>
  );
}

/** Runs the tree could not reach from the condenser: drawn apart or not yet connected. */
function LooseList({ runs, onPick }: { runs: VrfRun[]; onPick: (r: VrfRun) => void }) {
  if (runs.length === 0) return null;
  return (
    <div className="border-t border-neutral-800 px-2 py-1.5 text-[11px]">
      <div className="mb-1 text-neutral-500">
        Sem ligação ao sistema · {runs.length}{" "}
        <span className="text-neutral-600">
          (desenhe o trecho a partir do fim do anterior, com snap, para encadeá-lo)
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {runs.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r)}
            title="Ver no desenho"
            className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300 ring-1 ring-neutral-700 hover:text-orange-300"
          >
            {ROLE_SHORT[r.spec.role]} {formatHp(r.spec.hp)} · {r.length.toFixed(1)} m
          </button>
        ))}
      </div>
    </div>
  );
}
