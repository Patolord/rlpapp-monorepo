import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { AboutDialog } from "./components/AboutDialog";
import { CalibrateDialog } from "./components/CalibrateDialog";
import { CatalogPalette } from "./components/CatalogPalette";
import { CatalogSettingsDialog } from "./components/CatalogSettingsDialog";
import { DrawingTabs } from "./components/DrawingTabs";
import { DuctDialog } from "./components/DuctDialog";
import { DuctsPanel } from "./components/DuctsPanel";
import { ItemsPanel } from "./components/ItemsPanel";
import { KitPicker } from "./components/KitPicker";
import { KitsDialog } from "./components/KitsDialog";
import { LegendDialog } from "./components/LegendDialog";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { PageStrip } from "./components/PageStrip";
import { PanelDivider } from "./components/PanelDivider";
import { QuotePanel } from "./components/QuotePanel";
import { SelectionBar } from "./components/SelectionBar";
import { SimilarPreviewBar } from "./components/SimilarPreviewBar";
import { StatusBar } from "./components/StatusBar";
import { ToolRail } from "./components/ToolRail";
import { TopBar } from "./components/TopBar";
import { Viewer } from "./components/Viewer";
import { WeightsDialog } from "./components/WeightsDialog";
import { Welcome } from "./components/Welcome";
import { ZoneDialog } from "./components/ZoneDialog";
import { ZonesPanel } from "./components/ZonesPanel";
import { useHotkeys } from "./hotkeys";
import { autosave, confirmDiscard, openPdfFile, openProjectFile } from "./lib/files";
import { useDoc } from "./lib/session";
import { checkForUpdate } from "./lib/updater";
import { useStore } from "./store";

const TABS = { items: "Itens", zones: "Locais", ducts: "Dutos", quote: "Orçamento" } as const;

export default function App() {
  useHotkeys();
  const numPages = useDoc((s) => s.numPages);
  const [tab, setTab] = useState<keyof typeof TABS>("items");

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
      .then(() => {
        // without a token the company app answers 401: wait for the user to configure it (Ctrl+K)
        const { catalog, refreshCatalog } = useStore.getState();
        return catalog.remoteToken ? refreshCatalog() : 0;
      })
      .catch((e) => console.warn("catalog refresh failed", e));
  }, []);

  // look for a new version once, shortly after launch (no-op outside Tauri)
  useEffect(() => {
    const id = window.setTimeout(() => void checkForUpdate(), 4000);
    return () => window.clearTimeout(id);
  }, []);

  // ask before closing the window with unsaved changes
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (!(await confirmDiscard())) event.preventDefault();
      })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  // crash-safe autosave
  useEffect(() => {
    const id = window.setInterval(() => void autosave().catch(() => {}), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // clear transient status messages
  const status = useStore((s) => s.status);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => useStore.getState().setStatus(null), 6000);
    return () => window.clearTimeout(id);
  }, [status]);

  return (
    <div className="relative flex h-full flex-col">
      <TopBar />
      <DrawingTabs />
      <div className="flex min-h-0 flex-1">
        <ToolRail />
        <PageStrip />
        <div className="relative min-w-0 flex-1">
          <Viewer />
          {!numPages && <Welcome />}
          <SimilarPreviewBar />
          <KitPicker />
          <SelectionBar />
          <CalibrateDialog />
          <ZoneDialog />
          <LegendDialog />
        </div>
        <PanelDivider />
        {sidebarOpen && (
          <div
            className="flex shrink-0 flex-col border-l border-neutral-800 bg-neutral-900"
            style={{ width: sidebarWidth }}
          >
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
              {tab === "items" ? (
                <ItemsPanel />
              ) : tab === "zones" ? (
                <ZonesPanel />
              ) : tab === "ducts" ? (
                <DuctsPanel />
              ) : (
                <QuotePanel />
              )}
            </div>
          </div>
        )}
      </div>
      <StatusBar />
      <CatalogPalette />
      <AboutDialog />
      <NewProjectDialog />
      <KitsDialog />
      <WeightsDialog />
      <CatalogSettingsDialog />
      <DuctDialog />
    </div>
  );
}
