import { getCurrentWebview } from "@tauri-apps/api/webview";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { CalibrateDialog } from "./components/CalibrateDialog";
import { CatalogPalette } from "./components/CatalogPalette";
import { ItemsPanel } from "./components/ItemsPanel";
import { LegendDialog } from "./components/LegendDialog";
import { PageStrip } from "./components/PageStrip";
import { QuotePanel } from "./components/QuotePanel";
import { StatusBar } from "./components/StatusBar";
import { ToolRail } from "./components/ToolRail";
import { TopBar } from "./components/TopBar";
import { Button, Kbd } from "./components/ui";
import { Viewer } from "./components/Viewer";
import { ZoneDialog } from "./components/ZoneDialog";
import { ZonesPanel } from "./components/ZonesPanel";
import { useHotkeys } from "./hotkeys";
import {
  autosave,
  hasAutosave,
  openPdfFile,
  openProjectFile,
  pickAndOpenPdf,
  restoreAutosave,
} from "./lib/files";
import { useDoc } from "./lib/session";
import { checkForUpdate } from "./lib/updater";
import { useStore } from "./store";

const TABS = { items: "Itens", zones: "Locais", quote: "Orçamento" } as const;

export default function App() {
  useHotkeys();
  const numPages = useDoc((s) => s.numPages);
  const loading = useDoc((s) => s.loading);
  const error = useDoc((s) => s.error);
  const [tab, setTab] = useState<keyof typeof TABS>("items");
  const [canRestore, setCanRestore] = useState(false);

  // keep the page metadata array in sync with the opened document
  useEffect(() => {
    if (numPages) useStore.getState().ensurePages(numPages);
  }, [numPages]);

  // native file drop (Tauri delivers real paths)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (!("__TAURI_INTERNALS__" in window)) return;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const paths = event.payload.paths;
        const pdf = paths.find((p) => /\.pdf$/i.test(p));
        const proj = paths.find((p) => /\.takeoff\.json$/i.test(p));
        if (proj) void openProjectFile(proj);
        else if (pdf) void openPdfFile(pdf);
      })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  // material catalog: local cache, then the company app when a URL is configured
  useEffect(() => {
    void useStore
      .getState()
      .loadCatalog()
      .then(() => useStore.getState().refreshCatalog())
      .catch((e) => console.warn("catalog refresh failed", e));
  }, []);

  // look for a new version once, shortly after launch (no-op outside Tauri)
  useEffect(() => {
    const id = window.setTimeout(() => void checkForUpdate(), 4000);
    return () => window.clearTimeout(id);
  }, []);

  // crash-safe autosave
  useEffect(() => {
    void hasAutosave().then(setCanRestore);
    const id = window.setInterval(() => void autosave().catch(() => {}), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // clear transient status messages
  const status = useStore((s) => s.status);
  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => useStore.getState().setStatus(null), 6000);
    return () => window.clearTimeout(id);
  }, [status]);

  return (
    <div className="relative flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <ToolRail />
        <PageStrip />
        <div className="relative min-w-0 flex-1">
          <Viewer />
          {!numPages && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
              <div className="max-w-md rounded-xl border border-dashed border-neutral-600 p-8 text-center">
                <h1 className="text-lg font-semibold text-neutral-100">
                  Arraste um desenho em PDF para cá
                </h1>
                <p className="mt-1 text-xs text-neutral-400">
                  ou pressione <Kbd>Ctrl</Kbd>+<Kbd>O</Kbd>. Snap, contagens, comprimentos, áreas e
                  o orçamento pronto, tudo pelo teclado.
                </p>
                {loading && <p className="mt-3 text-xs text-orange-300">Abrindo…</p>}
                {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="primary" onClick={() => void pickAndOpenPdf()}>
                    Abrir PDF
                  </Button>
                  {canRestore && (
                    <Button
                      onClick={() => void restoreAutosave().catch(() => setCanRestore(false))}
                    >
                      Restaurar última sessão
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
          <CalibrateDialog />
          <ZoneDialog />
          <LegendDialog />
        </div>
        <div className="flex w-[27rem] shrink-0 flex-col border-l border-neutral-800 bg-neutral-900">
          <div className="flex border-b border-neutral-800 text-xs">
            {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={clsx(
                  "flex-1 py-2 font-medium",
                  tab === t
                    ? "border-b-2 border-orange-400 text-neutral-100"
                    : "text-neutral-400 hover:text-neutral-200",
                )}
              >
                {TABS[t]}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {tab === "items" ? <ItemsPanel /> : tab === "zones" ? <ZonesPanel /> : <QuotePanel />}
          </div>
        </div>
      </div>
      <StatusBar />
      <CatalogPalette />
    </div>
  );
}
