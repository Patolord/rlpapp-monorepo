/** What the report dialog chooses (kept in the store, so closing the dialog keeps it). */
import type { ReportFilter } from "./filter";

/** Everything the report dialog chooses. */
export interface ReportSettings {
  filter: ReportFilter;
  /** Locations to include; undefined = all. */
  locationIds?: string[];
  includeUnassigned: boolean;
  paper: "A4" | "A3";
  orientation: "landscape" | "portrait";
  prices: boolean;
  labels: boolean;
  washOut: boolean;
  cover: boolean;
  legibilityFloor: number;
  wholeSheet: boolean;
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  filter: {},
  includeUnassigned: false,
  paper: "A4",
  orientation: "landscape",
  prices: false,
  labels: true,
  washOut: true,
  cover: true,
  legibilityFloor: 0.5,
  wholeSheet: false,
};
