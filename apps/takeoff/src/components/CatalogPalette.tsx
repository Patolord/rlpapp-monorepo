import clsx from "clsx";
import { Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type CatalogEntry, commonWordPrefix, mergeCatalog, searchCatalog } from "../lib/catalog";
import { formatMoney } from "../lib/units";
import { useStore } from "../store";
import { Kbd } from "./ui";

/**
 * Ctrl+K: a quick catalog. Search the materials and create an item from an entry; where the
 * catalog comes from and how prices derive is configured in "Catálogo e preços" (gear).
 */
export function CatalogPalette() {
  const open = useStore((s) => s.paletteOpen);
  const catalog = useStore((s) => s.catalog);
  const currency = useStore((s) => s.project.currency);
  const { setPaletteOpen, addItemFromCatalog, setCatalogSettingsOpen } = useStore.getState();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const entries = useMemo(() => mergeCatalog(catalog), [catalog]);
  const results = useMemo(() => searchCatalog(entries, query), [entries, query]);
  // what every result starts with is noise; the tail ("dim. 750x630mm") is what tells them apart
  const shared = useMemo(() => commonWordPrefix(results.map((r) => r.name)), [results]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);
  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  if (!open) return null;

  const choose = (e: CatalogEntry) => {
    addItemFromCatalog(e);
    setPaletteOpen(false);
  };
  const openSettings = () => {
    setPaletteOpen(false);
    setCatalogSettingsOpen(true);
  };
  const pending = catalog.outbox.length;
  const sourceLabel = catalog.fetchedAt
    ? `${catalog.remote.length} materiais da empresa · catálogo de ${new Date(
        catalog.remoteGeneratedAt ?? catalog.fetchedAt,
      ).toLocaleDateString("pt-BR")}`
    : `${entries.length} materiais (planilhas anteriores)`;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click closes the palette
    <div
      className="absolute inset-0 z-40 flex items-start justify-center bg-black/50 pt-16"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        className="flex max-h-[70vh] w-[36rem] flex-col rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
          <Search size={18} className="text-neutral-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(results.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (results[cursor]) choose(results[cursor]);
              } else if (e.key === "Escape") {
                setPaletteOpen(false);
              }
            }}
            placeholder="Buscar material: grelha 400, duto, cabo, split…"
            className="h-8 flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-600"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {results.map((e, i) => (
            <li key={`${e.source}-${e.catalogId ?? e.name}`}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(e)}
                title={e.description && e.description !== e.name ? e.description : undefined}
                className={clsx(
                  "flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs",
                  i === cursor ? "bg-orange-500/15 text-neutral-100" : "text-neutral-200",
                )}
              >
                <span className="line-clamp-2 min-w-0 flex-1 leading-snug">
                  {shared && e.name.startsWith(shared) ? (
                    <>
                      <span className="text-neutral-500">{shared}</span>
                      {e.name.slice(shared.length)}
                    </>
                  ) : (
                    e.name
                  )}
                </span>
                {e.status === "draft" && (
                  <span
                    className="shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[11px] text-amber-400"
                    title="Proposto de um takeoff; compras ainda não validou"
                  >
                    rascunho
                  </span>
                )}
                <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-px text-[11px] text-neutral-400">
                  {e.group}
                </span>
                <span className="w-8 shrink-0 text-center font-mono text-[11px] text-neutral-500">
                  {e.unit}
                </span>
                <span
                  className="w-24 shrink-0 text-right font-mono text-[12px] text-neutral-300"
                  title={
                    e.kgPerUnit
                      ? `Por peso: ${e.kgPerUnit} kg/${e.unit} × R$/kg do insumo`
                      : e.priceDate
                        ? `Cotação de ${new Date(e.priceDate).toLocaleDateString("pt-BR")}`
                        : e.source === "remote" && e.materialPrice === 0
                          ? "Sem preço no catálogo da empresa"
                          : undefined
                  }
                >
                  {formatMoney(e.materialPrice, currency)}
                </span>
                {e.laborPrice > 0 && (
                  <span className="w-20 shrink-0 text-right font-mono text-[11px] text-neutral-500">
                    + {formatMoney(e.laborPrice, currency)}
                  </span>
                )}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-neutral-500">
              Nada encontrado. <Kbd>Enter</Kbd> no campo "Nome do novo item" cria um item avulso.
            </li>
          )}
        </ul>
        <div className="flex items-center gap-2 border-t border-neutral-800 px-3 py-1.5 text-[12px] text-neutral-500">
          <span className="min-w-0 flex-1 truncate">{sourceLabel}</span>
          {pending > 0 && (
            <button
              type="button"
              onClick={openSettings}
              className="shrink-0 text-amber-400 hover:underline"
              title="Propostas de material ainda não entregues a compras; veja em Catálogo e preços"
            >
              {pending} {pending === 1 ? "envio pendente" : "envios pendentes"}
            </button>
          )}
          <button
            type="button"
            onClick={openSettings}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded px-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            title="Catálogo e preços: fonte do catálogo, token, R$/kg dos insumos, tabela de pesos"
          >
            <Settings2 size={14} /> Catálogo e preços
          </button>
        </div>
      </div>
    </div>
  );
}
