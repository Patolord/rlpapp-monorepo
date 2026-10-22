import clsx from "clsx";
import { Eye, EyeOff, Filter, SquareDashed, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { switchDrawing } from "../lib/files";
import { polygonArea } from "../lib/geom";
import { formatItemQty, NO_ZONE, pageScale, totalsByZone } from "../lib/quantities";
import type { Zone } from "../lib/types";
import { formatArea } from "../lib/units";
import { useStore } from "../store";
import { Button, Kbd } from "./ui";

export function ZonesPanel() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const zonesVisible = useStore((s) => s.zonesVisible);
  const zoneOpacity = useStore((s) => s.zoneOpacity);
  const drawingOnly = useStore((s) => s.drawingOnly);
  const { setZonesVisible, setZoneOpacity } = useStore.getState();
  const { setSelection, setPage, setTool, updateZone, removeMeasurements, setZoneFilter } =
    useStore.getState();
  const byZone = useMemo(() => totalsByZone(project), [project]);
  const items = useMemo(() => new Map(project.items.map((i) => [i.id, i])), [project.items]);
  const zones = useMemo(
    () =>
      project.zones
        .filter((z) => !drawingOnly || z.drawingId === project.activeDrawingId)
        .sort((a, b) => a.page - b.page),
    [project.zones, project.activeDrawingId, drawingOnly],
  );

  const rows = (key: string) => {
    const totals = byZone.get(key);
    if (!totals) return null;
    return (
      <ul className="mt-1 space-y-0.5 pl-5 text-[12px]">
        {project.items.map((item) => {
          const t = totals.get(item.id);
          if (!t) return null;
          return (
            <li key={item.id} className="flex items-center gap-1.5 text-neutral-300">
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
              <span className="truncate">{item.name}</span>
              <span className="ml-auto font-mono text-neutral-200">
                {formatItemQty(item, t.qty, project.unit)}
              </span>
              {t.unscaled > 0 && <span className="text-amber-400">+{t.unscaled} s/ escala</span>}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {zones.length > 0 && (
        <div className="flex items-center gap-2 border-b border-neutral-800 px-2 py-1.5 text-[12px] text-neutral-400">
          <button
            type="button"
            onClick={() => setZonesVisible(!zonesVisible)}
            title="Mostrar ou ocultar os locais no desenho"
            className={clsx(
              "flex items-center gap-1 rounded px-1.5 py-0.5 ring-1",
              zonesVisible
                ? "bg-neutral-800 ring-neutral-700 hover:text-neutral-100"
                : "bg-orange-500/15 text-orange-300 ring-orange-400",
            )}
          >
            {zonesVisible ? <Eye size={15} /> : <EyeOff size={15} />}
            {zonesVisible ? "Visíveis" : "Ocultos"}
          </button>
          <label
            className="flex min-w-0 flex-1 items-center gap-2"
            title="Opacidade dos locais no desenho"
          >
            <span className="shrink-0">Opacidade</span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(zoneOpacity * 100)}
              onChange={(e) => setZoneOpacity(Number(e.target.value) / 100)}
              disabled={!zonesVisible}
              className="min-w-0 flex-1 accent-[#2b3990]"
            />
            <span className="w-8 shrink-0 text-right font-mono">
              {Math.round(zoneOpacity * 100)}%
            </span>
          </label>
        </div>
      )}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {zones.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-neutral-500">
            <p>
              Nenhum local ainda. Use a ferramenta <SquareDashed size={14} className="inline" />{" "}
              <Kbd>Z</Kbd> para delimitar uma região (pavimento, apartamento, sala) e dar um nome.
              Tudo o que for medido dentro dela aparece agrupado aqui e na planilha "Por Local".
            </p>
            <Button className="mt-3" variant="primary" onClick={() => setTool("zone")}>
              Delimitar local
            </Button>
          </div>
        )}
        {zones.map((z) => (
          <ZoneRow
            key={z.id}
            zone={z}
            selected={selection.includes(z.id)}
            filtered={zoneFilter === z.id}
            onFilter={() => setZoneFilter(zoneFilter === z.id ? null : z.id)}
            onToggleHidden={() => updateZone(z.id, { hidden: !z.hidden })}
            onRepeat={(n) => updateZone(z.id, { repeat: n })}
            areaText={areaText(project, z)}
            onSelect={() => {
              if (z.drawingId !== project.activeDrawingId) {
                void switchDrawing(z.drawingId).then(() => {
                  useStore.getState().setPage(z.page);
                  useStore.getState().setSelection([z.id]);
                });
                return;
              }
              setPage(z.page);
              setSelection([z.id]);
            }}
            drawingName={
              project.drawings.length > 1
                ? (project.drawings.find((d) => d.id === z.drawingId)?.name ?? "")
                : ""
            }
            onRename={(name) => updateZone(z.id, { name })}
            onRemove={() => removeMeasurements([z.id])}
          >
            {rows(z.id)}
          </ZoneRow>
        ))}
        {zones.length > 0 && byZone.has(NO_ZONE) && (
          <div className="border-b border-neutral-800/70 px-2 py-1.5">
            <div className="flex items-center text-xs text-neutral-400">
              Sem local
              <button
                type="button"
                title="Mostrar só o que está fora dos locais"
                onClick={() => setZoneFilter(zoneFilter === NO_ZONE ? null : NO_ZONE)}
                className={clsx(
                  "ml-auto rounded p-0.5",
                  zoneFilter === NO_ZONE
                    ? "text-orange-300"
                    : "text-neutral-500 hover:text-neutral-100",
                )}
              >
                <Filter size={14} />
              </button>
            </div>
            {rows(NO_ZONE)}
          </div>
        )}
      </div>
      {zones.length > 0 && (
        <div className="border-t border-neutral-800 p-2">
          <Button onClick={() => setTool("zone")}>
            <SquareDashed size={16} /> Novo local <Kbd>Z</Kbd>
          </Button>
          <span className="ml-2 text-[12px] text-neutral-500">{items.size} itens</span>
        </div>
      )}
    </div>
  );
}

function areaText(project: ReturnType<typeof useStore.getState>["project"], z: Zone): string {
  const scale = pageScale(project, z.drawingId, z.page);
  const a = polygonArea(z.points);
  return scale
    ? formatArea(a / (scale.pointsPerUnit * scale.pointsPerUnit), scale.unit)
    : `${a.toFixed(0)} pt²`;
}

function ZoneRow({
  zone,
  selected,
  filtered,
  onFilter,
  onToggleHidden,
  onRepeat,
  drawingName,
  areaText,
  onSelect,
  onRename,
  onRemove,
  children,
}: {
  zone: Zone;
  selected: boolean;
  filtered: boolean;
  onFilter: () => void;
  onToggleHidden: () => void;
  onRepeat: (n: number | undefined) => void;
  drawingName: string;
  areaText: string;
  onSelect: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div
      onClick={onSelect}
      className={clsx(
        "group cursor-pointer border-b border-neutral-800/70 px-2 py-1.5",
        selected ? "bg-orange-500/10" : "hover:bg-neutral-800/60",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "h-3 w-3 shrink-0 rounded-sm border border-dashed",
            zone.hidden && "opacity-40",
          )}
          style={{ borderColor: zone.color, background: `${zone.color}22` }}
        />
        {editing ? (
          <input
            autoFocus
            defaultValue={zone.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              onRename(e.target.value.trim() || zone.name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-6 min-w-0 flex-1 rounded bg-neutral-800 px-1 text-xs ring-1 ring-orange-400 outline-none"
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-xs text-neutral-100"
            onDoubleClick={() => setEditing(true)}
            title="Duplo clique para renomear"
          >
            {zone.name}
          </span>
        )}
        <span className="truncate text-[11px] text-neutral-500" title={drawingName}>
          {drawingName ? `${drawingName} · ` : ""}pág. {zone.page + 1}
        </span>
        <span className="font-mono text-[12px] text-neutral-300">{areaText}</span>
        <span
          className={clsx(
            "flex items-center gap-0.5 text-[11px]",
            (zone.repeat ?? 1) > 1 ? "text-orange-300" : "text-neutral-500",
          )}
          title="Multiplicador do local: quantas vezes ele se repete (ex.: 20 apartamentos iguais)"
        >
          ×
          <input
            type="number"
            min={1}
            step={1}
            value={zone.repeat ?? 1}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = Math.max(1, Math.round(Number(e.target.value) || 1));
              onRepeat(v === 1 ? undefined : v);
            }}
            className="h-5 w-10 rounded bg-neutral-800 px-1 text-right font-mono text-[11px] text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
          />
        </span>
        <button
          type="button"
          title={zone.hidden ? "Mostrar este local no desenho" : "Ocultar este local no desenho"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden();
          }}
          className={clsx(
            "rounded p-0.5",
            zone.hidden ? "text-orange-300" : "text-neutral-500 opacity-0 group-hover:opacity-100",
          )}
        >
          {zone.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <button
          type="button"
          title="Mostrar só este local (itens e desenho)"
          onClick={(e) => {
            e.stopPropagation();
            onFilter();
          }}
          className={clsx(
            "rounded p-0.5",
            filtered ? "text-orange-300" : "text-neutral-500 opacity-0 group-hover:opacity-100",
          )}
        >
          <Filter size={15} />
        </button>
        <button
          type="button"
          title="Excluir o local (as medições permanecem)"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-neutral-500 opacity-0 hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {children}
    </div>
  );
}
