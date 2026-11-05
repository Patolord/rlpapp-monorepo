import { readPref, type Slice, writePref } from "./shared";

export interface SimilarMatch {
  /** Centre in page points. */
  x: number;
  y: number;
  /** 0..1 similarity to the boxed symbol. */
  score: number;
}

export interface SimilarPreview {
  drawingId: string | null;
  page: number;
  /** Count item that receives the marks. */
  itemId: string;
  matches: SimilarMatch[];
  /** Indexes into `matches` the user clicked away. */
  excluded: number[];
  /** Size of the boxed symbol in page points (drawn as a ghost frame). */
  w: number;
  h: number;
}

/** "Localizar semelhantes": image-search results waiting for the user to confirm. */
export interface SimilarSlice {
  /** Results of the last search (see Viewer.runSimilar), null when none is being reviewed. */
  similarPreview: SimilarPreview | null;
  /** Smallest similarity score shown in the preview (0.5..0.95, remembered). */
  similarThreshold: number;

  setSimilarPreview(preview: SimilarPreview | null): void;
  setSimilarThreshold(threshold: number): void;
  /** Exclude (or re-include) one preview match by its index. */
  toggleSimilarMatch(index: number): void;
  /** Turn the visible, non-excluded preview matches into count marks. */
  acceptSimilar(): void;
}

export const createSimilarSlice: Slice<SimilarSlice> = (set, get) => ({
  similarPreview: null,
  similarThreshold: readPref("similarThreshold", 0.75),

  setSimilarPreview: (similarPreview) => set({ similarPreview }),
  setSimilarThreshold: (similarThreshold) => {
    writePref("similarThreshold", similarThreshold);
    set({ similarThreshold });
  },

  toggleSimilarMatch: (index) => {
    const pv = get().similarPreview;
    if (!pv) return;
    const excluded = pv.excluded.includes(index)
      ? pv.excluded.filter((i) => i !== index)
      : [...pv.excluded, index];
    set({ similarPreview: { ...pv, excluded } });
  },

  acceptSimilar: () => {
    const { similarPreview: pv, similarThreshold, project } = get();
    if (!pv) return;
    if (pv.drawingId !== project.activeDrawingId) {
      set({ similarPreview: null, status: "A prévia era de outra planta e foi descartada" });
      return;
    }
    const chosen = pv.matches.filter(
      (m, i) => m.score >= similarThreshold && !pv.excluded.includes(i),
    );
    const near = Math.max(3, Math.min(pv.w, pv.h) / 2);
    const existing = project.measurements.filter(
      (m) => m.itemId === pv.itemId && m.drawingId === pv.drawingId && m.page === pv.page,
    );
    const fresh = chosen.filter(
      (c) => !existing.some((m) => Math.hypot(m.points[0].x - c.x, m.points[0].y - c.y) <= near),
    );
    if (fresh.length > 0) {
      get().addMeasurements(
        pv.itemId,
        pv.page,
        fresh.map((c) => [{ x: c.x, y: c.y }]),
      );
    }
    const dup = chosen.length - fresh.length;
    set({
      similarPreview: null,
      status: `${fresh.length} marcações de contagem adicionadas${dup ? ` (${dup} já existiam)` : ""}`,
    });
  },
});
