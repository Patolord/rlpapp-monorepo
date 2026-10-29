import clsx from "clsx";
import { type PanelTab, useStore } from "../store";
import { ItemsPanel } from "./ItemsPanel";
import { QuotePanel } from "./QuotePanel";
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

/**
 * The side panel: the take-off itself (Itens · Locais · Orçamento). The specialty calculators
 * live in the drawer under the drawing, not here.
 */
export function Sidebar() {
  const width = useStore((s) => s.sidebarWidth);
  const tab = useStore((s) => s.panelTab);
  const { setPanelTab } = useStore.getState();

  return (
    <div
      className="flex shrink-0 flex-col border-l border-neutral-800 bg-neutral-900"
      style={{ width }}
    >
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
      </div>
      <div className="min-h-0 flex-1">
        {tab === "items" ? <ItemsPanel /> : tab === "zones" ? <ZonesPanel /> : <QuotePanel />}
      </div>
    </div>
  );
}
