import clsx from "clsx";
import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type CatalogEntry, mergeCatalog, searchCatalog } from "../lib/catalog";
import { formatMoney } from "../lib/units";
import { useStore } from "../store";
import { Button, Kbd } from "./ui";

/** Ctrl+K: search the material catalog and create an item from an entry. */
export function CatalogPalette() {
  const open = useStore((s) => s.paletteOpen);
  const catalog = useStore((s) => s.catalog);
  const currency = useStore((s) => s.project.currency);
  const { setPaletteOpen, addItemFromCatalog, setCatalogUrl, refreshCatalog } = useStore.getState();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [url, setUrl] = useState(catalog.remoteUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const entries = useMemo(() => mergeCatalog(catalog), [catalog]);
  const results = useMemo(() => searchCatalog(entries, query), [entries, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setUrl(catalog.remoteUrl);
    }
  }, [open, catalog.remoteUrl]);
  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  if (!open) return null;

  const choose = (e: CatalogEntry) => {
    addItemFromCatalog(e);
    setPaletteOpen(false);
  };
  const refresh = async () => {
    setBusy("Buscando…");
    try {
      setCatalogUrl(url.trim());
      const n = await refreshCatalog();
      setBusy(`${n} materiais carregados`);
    } catch (e) {
      setBusy(`Falha: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

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
          <Search size={16} className="text-neutral-500" />
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
            <li key={`${e.source}-${e.name}`}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(e)}
                className={clsx(
                  "flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs",
                  i === cursor ? "bg-orange-500/15 text-white" : "text-neutral-200",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-px text-[10px] text-neutral-400">
                  {e.group}
                </span>
                <span className="w-8 shrink-0 text-center font-mono text-[10px] text-neutral-500">
                  {e.unit}
                </span>
                <span className="w-24 shrink-0 text-right font-mono text-[11px] text-neutral-300">
                  {formatMoney(e.materialPrice, currency)}
                </span>
                {e.laborPrice > 0 && (
                  <span className="w-20 shrink-0 text-right font-mono text-[10px] text-neutral-500">
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
        <div className="flex items-center gap-2 border-t border-neutral-800 px-3 py-2 text-[11px] text-neutral-400">
          <span className="shrink-0">Catálogo da empresa</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://app.rlpeng.com.br/api/materiais.json"
            className="h-7 min-w-0 flex-1 rounded bg-neutral-800 px-2 font-mono text-[11px] text-neutral-200 ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
          />
          <Button onClick={() => void refresh()} disabled={!url.trim()}>
            <RefreshCw size={12} /> Atualizar
          </Button>
          <span className="w-40 shrink-0 truncate text-right text-neutral-500">
            {busy ??
              (catalog.fetchedAt
                ? `${catalog.remote.length} materiais · ${new Date(catalog.fetchedAt).toLocaleString("pt-BR")}`
                : `${entries.length} materiais (planilhas anteriores)`)}
          </span>
        </div>
      </div>
    </div>
  );
}
