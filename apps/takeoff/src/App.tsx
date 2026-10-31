import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { lazy, Suspense, useEffect } from "react";
import { AboutDialog } from "./components/AboutDialog";
import { CalibrateDialog } from "./components/CalibrateDialog";
import { CatalogPalette } from "./components/CatalogPalette";
import { CatalogSettingsDialog } from "./components/CatalogSettingsDialog";
import { DrawingTabs } from "./components/DrawingTabs";
import { DuctDialog } from "./components/DuctDialog";
import { KitPicker } from "./components/KitPicker";
import { KitsDialog } from "./components/KitsDialog";
import { LegendDialog } from "./components/LegendDialog";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { PageStrip } from "./components/PageStrip";
import { PanelDivider } from "./components/PanelDivider";
import { RevisionDialog } from "./components/RevisionDialog";
import { SelectionBar } from "./components/SelectionBar";
import { Sidebar } from "./components/Sidebar";
import { SimilarPreviewBar } from "./components/SimilarPreviewBar";
import { SpecialtyDrawer } from "./components/SpecialtyDrawer";
import { StatusBar } from "./components/StatusBar";
import { ToolRail } from "./components/ToolRail";
import { TopBar } from "./components/TopBar";
import { Viewer } from "./components/Viewer";
import { VrfBrandsDialog } from "./components/VrfBrandsDialog";
import { VrfDialog } from "./components/VrfDialog";
import { WeightsDialog } from "./components/WeightsDialog";
import { Welcome } from "./components/Welcome";
import { ZoneDialog } from "./components/ZoneDialog";
import { useHotkeys } from "./hotkeys";
import {
  autosave,
  confirmDiscard,
  noticeExternalChange,
  openPdfFiles,
  openProjectFile,
  syncViewerWithDrawing,
} from "./lib/files";
import { isTauri } from "./lib/platform";
import { useDoc } from "./lib/session";
import { checkForUpdate } from "./lib/updater";
import { useStore } from "./store";

/** The cutout report dialog and its planner load in a chunk of their own. */
const ReportDialog = lazy(() =>
  import("./components/ReportDialog").then((m) => ({ default: m.ReportDialog })),
);

export default function App() {
  useHotkeys();
  const numPages = useDoc((s) => s.numPages);

  // keep the page metadata array in sync with the opened document
  useEffect(() => {
    if (numPages) useStore.getState().ensurePages(numPages);
  }, [numPages]);

  // undo/redo of a revision replacement changes the active drawing's PDF: follow it
  useEffect(() => syncViewerWithDrawing(), []);

  // the takeoff file may live in a synced folder: say so when another machine changed it
  useEffect(() => {
    const onFocus = () => void noticeExternalChange();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // native file drop (Tauri delivers real paths)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (!isTauri()) return;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const paths = event.payload.paths;
        const pdfs = paths.filter((p) => /\.pdf$/i.test(p));
        const proj = paths.find((p) => /\.takeoff\.json$/i.test(p));
        if (proj) void openProjectFile(proj);
        else if (pdfs.length > 0) void openPdfFiles(pdfs);
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
    if (!isTauri()) return;
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
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <Viewer />
            {!numPages && <Welcome />}
            <SimilarPreviewBar />
            <KitPicker />
            <SelectionBar />
            <CalibrateDialog />
            <ZoneDialog />
            <LegendDialog />
            <RevisionDialog />
          </div>
          <SpecialtyDrawer />
        </div>
        <PanelDivider />
        {sidebarOpen && <Sidebar />}
      </div>
      <StatusBar />
      <CatalogPalette />
      <AboutDialog />
      <NewProjectDialog />
      <KitsDialog />
      <WeightsDialog />
      <CatalogSettingsDialog />
      <DuctDialog />
      <VrfDialog />
      <VrfBrandsDialog />
      <Suspense fallback={null}>
        <ReportDialog />
      </Suspense>
    </div>
  );
}
