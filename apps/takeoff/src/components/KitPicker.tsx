import { Layers, Settings2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { kitMode, kitSummary } from "../lib/kits";
import { useStore } from "../store";
import { Button, Kbd } from "./ui";

/** Shown when the Kit tool is chosen: which preset will the next run use? */
export function KitPicker() {
  const open = useStore((s) => s.kitPickerOpen);
  const kits = useStore((s) => s.catalog.kits);
  const activeKitId = useStore((s) => s.activeKitId);
  const { setKitPickerOpen, setActiveKit, setKitsEditorOpen, setTool } = useStore.getState();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) first.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="absolute left-3 top-3 z-30 w-80 rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-xs shadow-xl">
      <div className="mb-2 flex items-center gap-2">
        <Layers size={16} className="text-orange-400" />
        <span className="font-semibold text-neutral-100">Kit: escolha o preset</span>
        <button
          type="button"
          onClick={() => setKitPickerOpen(false)}
          className="ml-auto rounded p-0.5 text-neutral-500 hover:text-neutral-100"
          aria-label="Fechar"
        >
          <X size={14} />
        </button>
      </div>
      {kits.length === 0 ? (
        <p className="text-neutral-400">Nenhum preset ainda. Crie um em "Gerenciar presets".</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {[...kits]
            .sort((a, b) => (kitMode(a) === kitMode(b) ? 0 : kitMode(a) === "linear" ? -1 : 1))
            .map((k, i) => (
              <li key={k.id}>
                <button
                  ref={i === 0 ? first : undefined}
                  type="button"
                  onClick={() => {
                    setActiveKit(k.id);
                    setTool("kit");
                    setKitPickerOpen(false);
                  }}
                  className={
                    k.id === activeKitId
                      ? "w-full rounded border border-orange-400 bg-orange-500/10 px-2 py-1.5 text-left"
                      : "w-full rounded border border-neutral-800 px-2 py-1.5 text-left hover:bg-neutral-800"
                  }
                >
                  <div className="flex items-center gap-1.5 font-medium text-neutral-100">
                    <span className="truncate">{k.name}</span>
                    <span className="shrink-0 rounded bg-neutral-800 px-1 text-[10px] font-normal uppercase text-neutral-500">
                      {kitMode(k) === "count" ? "clique" : "trecho"}
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-neutral-500" title={kitSummary(k)}>
                    {kitSummary(k)}
                  </div>
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[11px] text-neutral-500">
          Depois clique nos pontos como no Medir · <Kbd>Enter</Kbd> conclui
        </span>
        <Button className="ml-auto" onClick={() => setKitsEditorOpen(true)}>
          <Settings2 size={14} /> Gerenciar presets
        </Button>
      </div>
    </div>
  );
}
