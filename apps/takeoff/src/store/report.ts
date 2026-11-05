import { DEFAULT_REPORT_SETTINGS, type ReportSettings } from "../lib/report/settings";
import type { Slice } from "./shared";

/**
 * The "Relatório de recortes" dialog's state, in the store rather than in the component so it
 * survives closing the dialog: "Ver na planta" closes it, and reopening it (Ctrl+Shift+E or the
 * menu) brings back the settings, the pages left out and the page in view. Kept while the app
 * runs, never saved with the project.
 */
export interface ReportSlice {
  reportSettings: ReportSettings;
  /** Locations unticked by the user (new locations start ticked). */
  reportExcluded: string[];
  /** Pages left out of the export, by `pageKey` (stable when unrelated settings change). */
  reportSkipped: string[];
  /** Preview page in the large view: a preview entry key (see lib/reportPreview), or null. */
  reportSelected: string | null;
  /** "Ver na planta" left the dialog: offer the way back over the viewer. */
  reportReturn: boolean;

  setReportSettings(patch: Partial<ReportSettings>): void;
  setReportExcluded(ids: string[]): void;
  setReportSkipped(keys: string[]): void;
  setReportSelected(key: string | null): void;
  setReportReturn(on: boolean): void;
}

export const createReportSlice: Slice<ReportSlice> = (set) => ({
  reportSettings: DEFAULT_REPORT_SETTINGS,
  reportExcluded: [],
  reportSkipped: [],
  reportSelected: null,
  reportReturn: false,

  setReportSettings: (patch) => set((s) => ({ reportSettings: { ...s.reportSettings, ...patch } })),
  setReportExcluded: (reportExcluded) => set({ reportExcluded }),
  setReportSkipped: (reportSkipped) => set({ reportSkipped }),
  setReportSelected: (reportSelected) => set({ reportSelected }),
  setReportReturn: (reportReturn) => set({ reportReturn }),
});
