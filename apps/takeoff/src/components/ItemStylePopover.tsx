import clsx from "clsx";
import { useEffect, useRef } from "react";
import { SYMBOLS } from "../lib/symbols";
import { ITEM_COLORS, type Item } from "../lib/types";
import { useStore } from "../store";
import { SymbolIcon } from "./SymbolIcon";

/** Colour and symbol of one item, plus "colour every item by discipline / group". */
export function ItemStylePopover({
  item,
  onChange,
  onClose,
}: {
  item: Item;
  onChange: (patch: Partial<Item>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const colorItemsBy = useStore((s) => s.colorItemsBy);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const section = "mb-1 text-[11px] uppercase tracking-wide text-neutral-500";
  const custom = !ITEM_COLORS.includes(item.color);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Cor e símbolo do item"
      className="absolute left-0 top-6 z-30 w-64 rounded-lg border border-neutral-700 bg-neutral-900 p-2.5 text-xs shadow-xl"
    >
      <div className={section}>Cor</div>
      <div className="flex flex-wrap items-center gap-1">
        {ITEM_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange({ color: c })}
            className={clsx(
              "h-5 w-5 rounded-full ring-2 ring-offset-1 ring-offset-neutral-900",
              item.color === c ? "ring-neutral-100" : "ring-transparent hover:ring-neutral-600",
            )}
            style={{ background: c }}
          />
        ))}
        <label
          title="Outra cor"
          className={clsx(
            "relative h-5 w-5 cursor-pointer overflow-hidden rounded-full ring-2 ring-offset-1 ring-offset-neutral-900",
            custom ? "ring-neutral-100" : "ring-transparent hover:ring-neutral-600",
          )}
          style={{
            background: custom
              ? item.color
              : "conic-gradient(#f97316,#facc15,#a3e635,#22d3ee,#60a5fa,#e879f9,#f97316)",
          }}
        >
          <input
            type="color"
            value={item.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      {item.kind === "count" && (
        <>
          <div className={clsx(section, "mt-2.5")}>Símbolo</div>
          <div className="flex flex-wrap items-center gap-0.5">
            {SYMBOLS.map((sym) => (
              <button
                key={sym.id}
                type="button"
                title={sym.label}
                onClick={() => onChange({ symbol: sym.id })}
                className={clsx(
                  "rounded p-0.5",
                  (item.symbol ?? "dot") === sym.id
                    ? "bg-orange-500/20 ring-1 ring-orange-400"
                    : "hover:bg-neutral-800",
                )}
              >
                <SymbolIcon id={sym.id} color={item.color} size={20} />
              </button>
            ))}
          </div>
        </>
      )}

      <div className={clsx(section, "mt-2.5")}>Colorir todos os itens</div>
      <div className="flex gap-1">
        <button
          type="button"
          title="Itens da mesma disciplina recebem a mesma cor"
          onClick={() => colorItemsBy("system")}
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-700"
        >
          por disciplina
        </button>
        <button
          type="button"
          title="Itens do mesmo grupo recebem a mesma cor"
          onClick={() => colorItemsBy("group")}
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-700"
        >
          por grupo
        </button>
      </div>
    </div>
  );
}
