import clsx from "clsx";
import { ArrowLeft, GitFork } from "lucide-react";
import type { ComponentType } from "react";
import { type PanelTab, type SystemPanel, useStore } from "../store";
import { DuctsPanel } from "./DuctsPanel";
import { ItemsPanel } from "./ItemsPanel";
import { DuctIcon } from "./icons";
import { QuotePanel } from "./QuotePanel";
import { VrfPanel } from "./VrfPanel";
import { ZonesPanel } from "./ZonesPanel";

const TABS: { tab: PanelTab; label: string; title: string }[] = [
  { tab: "items", label: "Itens", title: "O que foi medido: itens, quantidades e preços" },
  { tab: "zones", label: "Locais", title: "Onde: ambientes e regiões delimitadas nas plantas" },
  {
    tab: "quote",
    label: "Orçamento",
    title: "Quanto custa: a planilha orçamentária por disciplina",
  },
];

const SYSTEMS: {
  system: SystemPanel;
  label: string;
  icon: ComponentType<{ size?: number }>;
  title: string;
}[] = [
  {
    system: "duct",
    label: "Dutos",
    icon: DuctIcon,
    title:
      "Cálculo de dutos: chapa, isolamento, flanges, suportes e mão de obra de cada rede medida com a ferramenta Duto (D)",
  },
  {
    system: "vrf",
    label: "VRF",
    icon: GitFork,
    title:
      "Cálculo VRF: bitolas, Y-kits e materiais de cada sistema medido com a ferramenta VRF (Y)",
  },
];

/**
 * The side panel. Its views are the take-off itself (Itens · Locais · Orçamento); the per-system
 * calculators (Dutos, VRF) are a drill-in over them: opened from the "Cálculos" group or from a
 * network/system item, left with the back button. The open view lives in the store so tools and
 * items can open a calculator.
 */
export function Sidebar() {
  const width = useStore((s) => s.sidebarWidth);
  const tab = useStore((s) => s.panelTab);
  const system = useStore((s) => s.systemPanel);
  const { setPanelTab, openSystemPanel, closeSystemPanel } = useStore.getState();
  const tabLabel = TABS.find((t) => t.tab === tab)?.label ?? "Itens";

  return (
    <div
      className="flex shrink-0 flex-col border-l border-neutral-800 bg-neutral-900"
      style={{ width }}
    >
      {system ? (
        <div className="flex h-9 items-center gap-1 border-b border-neutral-800 bg-neutral-800/50 px-1.5 text-xs">
          <button
            type="button"
            onClick={closeSystemPanel}
            title={`Voltar ao levantamento (${tabLabel})`}
            className="flex h-7 items-center gap-1 rounded px-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
          >
            <ArrowLeft size={14} />
            {tabLabel}
          </button>
          <span className="mx-1 h-4 w-px bg-neutral-700" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
            Cálculo
          </span>
          {SYSTEMS.map(({ system: s, label, icon: Icon, title }) => (
            <button
              key={s}
              type="button"
              onClick={() => openSystemPanel(s)}
              title={title}
              aria-pressed={s === system}
              className={clsx(
                "flex h-7 items-center gap-1 rounded px-2 font-medium",
                s === system
                  ? "bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/60"
                  : "text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100",
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex h-9 items-stretch border-b border-neutral-800 text-xs">
          {TABS.map(({ tab: t, label, title }) => (
            <button
              key={t}
              type="button"
              onClick={() => setPanelTab(t)}
              title={title}
              className={clsx(
                "flex-1 font-medium",
                tab === t
                  ? "border-b-2 border-orange-400 text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-200",
              )}
            >
              {label}
            </button>
          ))}
          <span className="my-2 w-px bg-neutral-800" />
          <div className="flex items-center gap-0.5 px-1.5" title="Cálculos por sistema">
            {SYSTEMS.map(({ system: s, label, icon: Icon, title }) => (
              <button
                key={s}
                type="button"
                onClick={() => openSystemPanel(s)}
                title={title}
                className="flex h-7 items-center gap-1 rounded px-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {system === "duct" ? (
          <DuctsPanel />
        ) : system === "vrf" ? (
          <VrfPanel />
        ) : tab === "items" ? (
          <ItemsPanel />
        ) : tab === "zones" ? (
          <ZonesPanel />
        ) : (
          <QuotePanel />
        )}
      </div>
    </div>
  );
}
