import { getCurrentWebview } from "@tauri-apps/api/webview";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { CalibrateDialog } from "./components/CalibrateDialog";
import { ItemsPanel } from "./components/ItemsPanel";
import { PageStrip } from "./components/PageStrip";
import { QuotePanel } from "./components/QuotePanel";
import { StatusBar } from "./components/StatusBar";
import { ToolRail } from "./components/ToolRail";
import { TopBar } from "./components/TopBar";
import { Button, Kbd } from "./components/ui";
import { Viewer } from "./components/Viewer";
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
import { useStore } from "./store";

export default function App() {
  useHotkeys();
  const numPages = useDoc((s) => s.numPages);
  const loading = useDoc((s) => s.loading);
  const error = useDoc((s) => s.error);
  const [tab, setTab] = useState<"items" | "quote">("items");
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
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <ToolRail />
        <PageStrip />
        <div className="relative min-w-0 flex-1">
          <Viewer />
          {!numPages && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
              <div className="max-w-md rounded-xl border border-dashed border-neutral-600 p-8 text-center">
                <h1 className="text-lg font-semibold text-neutral-100">Drop a PDF drawing here</h1>
                <p className="mt-1 text-xs text-neutral-400">
                  or press <Kbd>Ctrl</Kbd>+<Kbd>O</Kbd>. Snapping, counting, lengths, areas and a
                  priced quote, all from the keyboard.
                </p>
                {loading && <p className="mt-3 text-xs text-orange-300">Opening…</p>}
                {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="primary" onClick={() => void pickAndOpenPdf()}>
                    Open PDF
                  </Button>
                  {canRestore && (
                    <Button
                      onClick={() => void restoreAutosave().catch(() => setCanRestore(false))}
                    >
                      Restore last session
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
          <CalibrateDialog />
        </div>
        <div className="flex w-[27rem] shrink-0 flex-col border-l border-neutral-800 bg-neutral-900">
          <div className="flex border-b border-neutral-800 text-xs">
            {(["items", "quote"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={clsx(
                  "flex-1 py-2 font-medium capitalize",
                  tab === t
                    ? "border-b-2 border-orange-400 text-white"
                    : "text-neutral-400 hover:text-neutral-200",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">{tab === "items" ? <ItemsPanel /> : <QuotePanel />}</div>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
