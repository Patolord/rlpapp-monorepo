import clsx from "clsx";
import { Eye, EyeOff, Filter, SquareDashed, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { switchDrawing } from "../lib/files";
import { bbox, polygonArea } from "../lib/geom";
import {
  formatItemQty,
  type ItemTotal,
  NO_LOCATION,
  pageScale,
  totalsByLocation,
  totalsByRegion,
} from "../lib/quantities";
import type { Location, Project, Zone } from "../lib/types";
import { formatArea } from "../lib/units";
import { useStore } from "../store";
import { viewerApi } from "../viewerApi";
import { Button, Kbd } from "./ui";

interface Group {
  location: Location;
  /** Regions listed (all of them, or only the active drawing's with "só esta planta"). */
  regions: Zone[];
  /** Every region of the location, listed ones first (the header click cycles through these). */
  all: Zone[];
  /** Regions of the location on other drawings that the list leaves out. */
  elsewhere: number;
}

/** Locations of the takeoff, each with the regions that draw it (one per sheet it spans). */
export function ZonesPanel() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const zonesVisible = useStore((s) => s.zonesVisible);
  const zoneOpacity = useStore((s) => s.zoneOpacity);
  const drawingOnly = useStore((s) => s.drawingOnly);
  const { setZonesVisible, setZoneOpacity } = useStore.getState();
  const { setTool, updateZone, updateLocation, removeMeasurements, setZoneFilter } =
    useStore.getState();
  const byLocation = useMemo(() => totalsByLocation(project), [project]);
  const byRegion = useMemo(() => totalsByRegion(project), [project]);
  const groups = useMemo<Group[]>(() => {
    const order = new Map(project.drawings.map((d, i) => [d.id, i]));
    const out: Group[] = [];
    for (const location of project.locations) {
      const all = project.zones.filter((z) => z.locationId === location.id);
      const regions = (
        drawingOnly ? all.filter((z) => z.drawingId === project.activeDrawingId) : all
      ).sort(
        (a, b) => (order.get(a.drawingId) ?? 0) - (order.get(b.drawingId) ?? 0) || a.page - b.page,
      );
      if (regions.length === 0) continue;
      const listed = new Set(regions.map((z) => z.id));
      out.push({
        location,
        regions,
        all: [...regions, ...all.filter((z) => !listed.has(z.id))],
        elsewhere: all.length - regions.length,
      });
    }
    return out;
  }, [project.locations, project.zones, project.drawings, project.activeDrawingId, drawingOnly]);

  const rows = (totals: Map<string, ItemTotal> | undefined) => {
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

  /** Shows a region: its drawing and page, selected (highlighted) and centred in the view. */
  const focus = (z: Zone) => {
    const go = () => {
      const s = useStore.getState();
      s.setPage(z.page);
      s.setSelection([z.id]);
      viewerApi.current?.focusBox(bbox(z.points));
    };
    if (z.drawingId !== project.activeDrawingId) void switchDrawing(z.drawingId).then(go);
    else go();
  };
  /** Header click: the location's region on this sheet, then the next one on each click. */
  const focusLocation = (g: Group) => {
    const current = g.all.findIndex((z) => selection.includes(z.id));
    const next = current >= 0 ? g.all[(current + 1) % g.all.length] : g.all[0];
    if (next) focus(next);
  };

  return (
    <div className="flex h-full flex-col">
      {groups.length > 0 && (
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
        {groups.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-neutral-500">
            {project.locations.length > 0 ? (
              <p>Nenhum local nesta planta. Desmarque "só esta planta" para ver os demais.</p>
            ) : (
              <p>
                Nenhum local ainda. Use a ferramenta <SquareDashed size={14} className="inline" />{" "}
                <Kbd>Z</Kbd> para delimitar uma região (pavimento, apartamento, sala) e dar um nome.
                Tudo o que for medido dentro dela aparece agrupado aqui e na planilha "Por Local". O
                mesmo nome em outra planta marca o mesmo local.
              </p>
            )}
            <Button className="mt-3" variant="primary" onClick={() => setTool("zone")}>
              Delimitar local
            </Button>
          </div>
        )}
        {groups.map((g) => (
          <LocationRow
            key={g.location.id}
            location={g.location}
            regionCount={g.regions.length + g.elsewhere}
            elsewhere={g.elsewhere}
            filtered={zoneFilter === g.location.id}
            onSelect={() => focusLocation(g)}
            onFilter={() => setZoneFilter(zoneFilter === g.location.id ? null : g.location.id)}
            onRename={(name) => updateLocation(g.location.id, { name })}
          >
            {rows(byLocation.get(g.location.id))}
            {g.regions.map((z) => (
              <RegionRow
                key={z.id}
                zone={z}
                color={g.location.color}
                selected={selection.includes(z.id)}
                drawingName={
                  project.drawings.length > 1
                    ? (project.drawings.find((d) => d.id === z.drawingId)?.name ?? "")
                    : ""
                }
                areaText={areaText(project, z)}
                onSelect={() => focus(z)}
                onToggleHidden={() => updateZone(z.id, { hidden: !z.hidden })}
                onRepeat={(n) => updateZone(z.id, { repeat: n })}
                onRemove={() => removeMeasurements([z.id])}
              >
                {g.regions.length + g.elsewhere > 1 ? rows(byRegion.get(z.id)) : null}
              </RegionRow>
            ))}
          </LocationRow>
        ))}
        {groups.length > 0 && byLocation.has(NO_LOCATION) && (
          <div className="border-b border-neutral-800/70 px-2 py-1.5">
            <div className="flex items-center text-xs text-neutral-400">
              Sem local
              <button
                type="button"
                title="Mostrar só o que está fora dos locais"
                onClick={() => setZoneFilter(zoneFilter === NO_LOCATION ? null : NO_LOCATION)}
                className={clsx(
                  "ml-auto rounded p-0.5",
                  zoneFilter === NO_LOCATION
                    ? "text-orange-300"
                    : "text-neutral-500 hover:text-neutral-100",
                )}
              >
                <Filter size={14} />
              </button>
            </div>
            {rows(byLocation.get(NO_LOCATION))}
          </div>
        )}
      </div>
      {groups.length > 0 && (
        <div className="border-t border-neutral-800 p-2">
          <Button onClick={() => setTool("zone")}>
            <SquareDashed size={16} /> Novo local <Kbd>Z</Kbd>
          </Button>
          <span className="ml-2 text-[12px] text-neutral-500">
            {project.locations.length} {project.locations.length === 1 ? "local" : "locais"}
          </span>
        </div>
      )}
    </div>
  );
}

function areaText(project: Project, z: Zone): string {
  const scale = pageScale(project, z.drawingId, z.page);
  const a = polygonArea(z.points);
  return scale
    ? formatArea(a / (scale.pointsPerUnit * scale.pointsPerUnit), scale.unit)
    : `${a.toFixed(0)} pt²`;
}

/** A location: name (double click renames it on every sheet), filter, totals and its regions. */
function LocationRow({
  location,
  regionCount,
  elsewhere,
  filtered,
  onSelect,
  onFilter,
  onRename,
  children,
}: {
  location: Location;
  regionCount: number;
  elsewhere: number;
  filtered: boolean;
  onSelect: () => void;
  onFilter: () => void;
  onRename: (name: string) => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="group/loc border-b border-neutral-800/70 px-2 py-1.5">
      <div
        className="flex cursor-pointer items-center gap-2 rounded hover:bg-neutral-800/60"
        onClick={onSelect}
        title={
          regionCount > 1
            ? "Clique para localizar no desenho; cada clique vai à próxima região"
            : "Clique para localizar no desenho"
        }
      >
        <span
          className="h-3 w-3 shrink-0 rounded-sm"
          style={{ background: location.color }}
          title={regionCount > 1 ? `Local em ${regionCount} regiões` : undefined}
        />
        {editing ? (
          <input
            autoFocus
            defaultValue={location.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              onRename(e.target.value.trim() || location.name);
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
            className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-100"
            onDoubleClick={() => setEditing(true)}
            title="Duplo clique para renomear (em todas as plantas)"
          >
            {location.name}
          </span>
        )}
        {regionCount > 1 && (
          <span
            className="text-[11px] text-neutral-500"
            title={
              elsewhere > 0
                ? `${elsewhere} região(ões) em outras plantas não listada(s) aqui`
                : "Regiões deste local"
            }
          >
            {regionCount} regiões{elsewhere > 0 ? ` (${elsewhere} fora)` : ""}
          </span>
        )}
        <button
          type="button"
          title="Mostrar só este local (itens e desenho, em todas as plantas)"
          onClick={(e) => {
            e.stopPropagation();
            onFilter();
          }}
          className={clsx(
            "rounded p-0.5",
            filtered ? "text-orange-300" : "text-neutral-500 opacity-0 group-hover/loc:opacity-100",
          )}
        >
          <Filter size={15} />
        </button>
      </div>
      {children}
    </div>
  );
}

/** One region of a location: sheet, page, area, repeat, visibility and removal. */
function RegionRow({
  zone,
  color,
  selected,
  drawingName,
  areaText,
  onSelect,
  onToggleHidden,
  onRepeat,
  onRemove,
  children,
}: {
  zone: Zone;
  color: string;
  selected: boolean;
  drawingName: string;
  areaText: string;
  onSelect: () => void;
  onToggleHidden: () => void;
  onRepeat: (n: number | undefined) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      className={clsx(
        "group mt-1 cursor-pointer rounded px-1 py-0.5",
        selected ? "bg-orange-500/10" : "hover:bg-neutral-800/60",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "ml-1 h-3 w-3 shrink-0 rounded-sm border border-dashed",
            zone.hidden && "opacity-40",
          )}
          style={{ borderColor: color, background: `${color}22` }}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-400" title={drawingName}>
          {drawingName ? `${drawingName} · ` : ""}pág. {zone.page + 1}
        </span>
        <span className="font-mono text-[12px] text-neutral-300">{areaText}</span>
        <span
          className={clsx(
            "flex items-center gap-0.5 text-[11px]",
            (zone.repeat ?? 1) > 1 ? "text-orange-300" : "text-neutral-500",
          )}
          title="Multiplicador desta região: quantas vezes ela se repete (ex.: 20 apartamentos iguais)"
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
          title={zone.hidden ? "Mostrar esta região no desenho" : "Ocultar esta região no desenho"}
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
          title="Excluir esta região (as medições permanecem; o local some com a última região)"
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
