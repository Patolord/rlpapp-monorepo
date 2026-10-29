import clsx from "clsx";
import { AirVent, ChevronDown, Cuboid } from "lucide-react";
import type { ComponentType } from "react";
import { type SystemPanel, useStore } from "../store";
import { DuctsPanel } from "./DuctsPanel";
import { VrfPanel } from "./VrfPanel";

const SPECIALTIES: {
  system: SystemPanel;
  label: string;
  icon: ComponentType<{ size?: number }>;
  title: string;
}[] = [
  {
    system: "duct",
    label: "Dutos",
    icon: Cuboid,
    title:
      "Cálculo de dutos: chapa, isolamento, flanges, suportes e mão de obra de cada rede medida com a ferramenta Duto (D)",
  },
  {
    system: "vrf",
    label: "VRF",
    icon: AirVent,
    title:
      "Cálculo VRF: bitolas, Y-kits e materiais de cada sistema medido com a ferramenta VRF (Y)",
  },
];

/**
 * The specialty calculators (Dutos, VRF) in a drawer under the drawing, where their run tables
 * have the width of the viewer and the side panel stays the take-off. It opens when a specialty
 * tool is picked or from the badge on a network/system item; the top edge drags to resize.
 */
export function SpecialtyDrawer() {
  const system = useStore((s) => s.systemPanel);
  const height = useStore((s) => s.drawerHeight);
  const { openSystemPanel, closeSystemPanel, setDrawerHeight } = useStore.getState();
  if (!system) return null;

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = useStore.getState().drawerHeight;
    const move = (ev: PointerEvent) => setDrawerHeight(startH + (startY - ev.clientY));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "row-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className="flex shrink-0 flex-col border-t border-neutral-800 bg-neutral-900"
      style={{ height }}
    >
      <div
        onPointerDown={startResize}
        className="h-1.5 shrink-0 cursor-row-resize bg-neutral-800 hover:bg-orange-400/50"
      />
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-neutral-800 px-2 text-xs">
        <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
          Cálculo
        </span>
        {SPECIALTIES.map(({ system: s, label, icon: Icon, title }) => (
          <button
            key={s}
            type="button"
            onClick={() => openSystemPanel(s)}
            title={title}
            aria-pressed={s === system}
            className={clsx(
              "flex h-6 items-center gap-1 rounded px-2 font-medium",
              s === system
                ? "bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/60"
                : "text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100",
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={closeSystemPanel}
          title="Recolher o cálculo (a ferramenta Duto ou VRF abre de novo)"
          aria-label="Recolher o cálculo"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
        >
          <ChevronDown size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1">{system === "duct" ? <DuctsPanel /> : <VrfPanel />}</div>
    </div>
  );
}
