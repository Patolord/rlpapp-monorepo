import { useEffect } from "react";
import { exportXlsx, pickAndOpenPdf, saveProject } from "./lib/files";
import { useDoc } from "./lib/session";
import { type Tool, useStore } from "./store";
import { viewerApi } from "./viewerApi";

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  h: "pan",
  c: "count",
  l: "linear",
  a: "area",
  r: "rect",
  m: "magic",
  k: "calibrate",
  z: "zone",
  x: "similar",
  t: "kit",
};

export function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        if (e.key === "Escape") t.blur();
        return;
      }
      const s = useStore.getState();
      const api = viewerApi.current;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (ctrl) {
        switch (key) {
          case "z":
            e.preventDefault();
            if (e.shiftKey) s.redo();
            else s.undo();
            return;
          case "y":
            e.preventDefault();
            s.redo();
            return;
          case "s":
            e.preventDefault();
            void saveProject(e.shiftKey);
            return;
          case "o":
            e.preventDefault();
            void pickAndOpenPdf();
            return;
          case "e":
            e.preventDefault();
            void exportXlsx();
            return;
          case "a":
            e.preventDefault();
            api?.selectAllOnPage();
            return;
          case "k":
            e.preventDefault();
            s.setPaletteOpen(!s.paletteOpen);
            return;
          case "b":
            e.preventDefault();
            s.setSidebarOpen(!s.sidebarOpen);
            return;
          case "n":
            e.preventDefault();
            s.setNewProjectOpen(true);
            return;
          default:
            return;
        }
      }

      switch (key) {
        case "F1":
          e.preventDefault();
          s.setAboutOpen(!s.aboutOpen);
          return;
        case "Escape":
          if (s.aboutOpen) {
            s.setAboutOpen(false);
            return;
          }
          if (s.newProjectOpen) {
            s.setNewProjectOpen(false);
            return;
          }
          if (s.kitsEditorOpen) {
            s.setKitsEditorOpen(false);
            return;
          }
          if (s.kitPickerOpen) {
            s.setKitPickerOpen(false);
            return;
          }
          if (api?.hasDraft()) api.cancelDraft();
          else if (s.similarPreview) s.setSimilarPreview(null);
          else if (s.calibration) s.setCalibration(null);
          else if (s.pendingZone) s.setPendingZone(null);
          else if (s.paletteOpen) s.setPaletteOpen(false);
          else if (s.legendCandidates) s.setLegendCandidates(null);
          else if (s.scalePickerOpen) s.setScalePickerOpen(false);
          else if (s.selection.length) s.setSelection([]);
          else s.setTool("select");
          return;
        case "Enter":
          // stop the keypress that would otherwise submit a dialog mounted by finishDraft
          e.preventDefault();
          if (s.similarPreview) s.acceptSimilar();
          else api?.finishDraft();
          return;
        case "Backspace":
          if (api?.hasDraft()) api.popDraft();
          else api?.deleteSelection();
          return;
        case "Delete":
          api?.deleteSelection();
          return;
        case "s":
          s.toggleSnap();
          return;
        case "o":
          s.toggleOrtho();
          return;
        case "f":
          api?.fit();
          return;
        case "+":
        case "=":
          api?.zoomBy(1.25);
          return;
        case "-":
          api?.zoomBy(0.8);
          return;
        case "ArrowDown":
          e.preventDefault();
          s.stepActiveItem(1);
          return;
        case "ArrowUp":
          e.preventDefault();
          s.stepActiveItem(-1);
          return;
        case "PageDown":
        case "]":
          s.setPage(Math.min(useDoc.getState().numPages - 1, s.page + 1));
          return;
        case "PageUp":
        case "[":
          s.setPage(Math.max(0, s.page - 1));
          return;
        case "n": {
          const kind = s.project.items.find((i) => i.id === s.activeItemId)?.kind ?? "count";
          s.addItem({ kind });
          return;
        }
        default:
          break;
      }
      if (key === "z" && e.shiftKey) {
        s.setFillsVisible(!s.fillsVisible);
        return;
      }
      if (TOOL_KEYS[key]) {
        s.setTool(TOOL_KEYS[key]);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
