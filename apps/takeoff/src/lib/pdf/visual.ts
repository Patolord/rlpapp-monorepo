/**
 * Image-based symbol search ("localizar semelhantes" on the rendered page).
 *
 * CAD exports often arrive with blocks exploded, so two fans on the same sheet are not the same
 * vectors; they are, however, the same picture. The template is the ink inside the user's box
 * and every place on the page whose ink correlates with it (normalised cross-correlation) is a
 * match, tested at 0°, 90°, 180° and 270°. A coarse pass on a downsampled page finds candidates
 * and only those are scored at full resolution.
 */

/** Grey "ink" image: 0 = white paper, 255 = solid black. */
export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Match {
  /** Centre of the matched template, in page pixels. */
  cx: number;
  cy: number;
  /** Normalised cross-correlation, 0..1 (1 = identical picture). */
  score: number;
  /** Rotation of the template that matched, in quarter turns. */
  rot: number;
}

export interface MatchOptions {
  /** Also try the template rotated by 90°, 180° and 270° (default true). */
  rotations?: boolean;
  /** Smallest score kept (default 0.5, so a sensitivity slider can filter later). */
  minScore?: number;
  /** Upper bound on coarse candidates refined per rotation (default 2000). */
  maxCandidates?: number;
}

export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    const lum = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
    data[i] = 255 - lum;
  }
  return { width, height, data };
}

export function crop(g: Gray, x: number, y: number, w: number, h: number): Gray {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(g.width, Math.ceil(x + w));
  const y1 = Math.min(g.height, Math.ceil(y + h));
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  const data = new Uint8Array(width * height);
  for (let yy = 0; yy < height; yy++) {
    data.set(
      g.data.subarray((y0 + yy) * g.width + x0, (y0 + yy) * g.width + x0 + width),
      yy * width,
    );
  }
  return { width, height, data };
}

/** Box-average downsample by an integer factor. */
export function downsample(g: Gray, f: number): Gray {
  if (f <= 1) return g;
  const width = Math.floor(g.width / f);
  const height = Math.floor(g.height / f);
  const data = new Uint8Array(width * height);
  const n = f * f;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * g.width + x * f;
        for (let dx = 0; dx < f; dx++) s += g.data[row + dx];
      }
      data[y * width + x] = s / n;
    }
  }
  return { width, height, data };
}

/** Rotate clockwise by `times` quarter turns. */
export function rotate90(g: Gray, times: number): Gray {
  const t = ((times % 4) + 4) % 4;
  if (t === 0) return g;
  const { width: w, height: h, data } = g;
  if (t === 2) {
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = data[out.length - 1 - i];
    return { width: w, height: h, data: out };
  }
  const out = new Uint8Array(w * h);
  // 90° clockwise: new width = h, new height = w; (x, y) -> (h - 1 - y, x)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      if (t === 1) out[x * h + (h - 1 - y)] = v;
      else out[(w - 1 - x) * h + y] = v;
    }
  }
  return { width: h, height: w, data: out };
}

interface ZeroMean {
  t: Float32Array;
  norm: number;
  ink: number;
}

function zeroMean(g: Gray): ZeroMean | null {
  const n = g.width * g.height;
  if (n === 0) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += g.data[i];
  const mean = sum / n;
  const t = new Float32Array(n);
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const v = g.data[i] - mean;
    t[i] = v;
    sq += v * v;
  }
  const norm = Math.sqrt(sq);
  if (norm < 1e-3 || sum < 1) return null;
  return { t, norm, ink: sum };
}

/** Summed-area tables of ink and ink², (w+1)×(h+1). */
function integral(g: Gray): { sum: Float64Array; sq: Float64Array; stride: number } {
  const stride = g.width + 1;
  const sum = new Float64Array(stride * (g.height + 1));
  const sq = new Float64Array(stride * (g.height + 1));
  for (let y = 1; y <= g.height; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 1; x <= g.width; x++) {
      const v = g.data[(y - 1) * g.width + (x - 1)];
      rs += v;
      rq += v * v;
      sum[y * stride + x] = sum[(y - 1) * stride + x] + rs;
      sq[y * stride + x] = sq[(y - 1) * stride + x] + rq;
    }
  }
  return { sum, sq, stride };
}

/** NCC of the template at (x, y) computed directly (used at full resolution). */
function scoreAt(page: Gray, zm: ZeroMean, tw: number, th: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x + tw > page.width || y + th > page.height) return -1;
  let sum = 0;
  let sq = 0;
  let corr = 0;
  const t = zm.t;
  for (let ty = 0; ty < th; ty++) {
    const row = (y + ty) * page.width + x;
    const trow = ty * tw;
    for (let tx = 0; tx < tw; tx++) {
      const v = page.data[row + tx];
      sum += v;
      sq += v * v;
      corr += v * t[trow + tx];
    }
  }
  const n = tw * th;
  const varN = sq - (sum * sum) / n;
  if (varN <= 1e-6) return 0;
  return corr / (Math.sqrt(varN) * zm.norm);
}

export function matchTemplate(page: Gray, tpl0: Gray, opts: MatchOptions = {}): Match[] {
  const minScore = opts.minScore ?? 0.5;
  const maxCandidates = opts.maxCandidates ?? 400;
  const rots = opts.rotations === false ? [0] : [0, 1, 2, 3];
  if (tpl0.width < 3 || tpl0.height < 3) return [];

  // coarse pass: the template shrinks to ~8 px on its short side (refinement restores precision)
  const f = Math.max(1, Math.floor(Math.min(tpl0.width, tpl0.height) / 8));
  const pageC = downsample(page, f);
  const { sum: isum, sq: isq, stride } = integral(pageC);
  const found: Match[] = [];

  for (const rot of rots) {
    const tpl = rotate90(tpl0, rot);
    const tplC = downsample(tpl, f);
    const zmC = zeroMean(tplC);
    const zmF = zeroMean(tpl);
    if (!zmC || !zmF) continue;
    const tw = tplC.width;
    const th = tplC.height;
    const n = tw * th;
    const t = zmC.t;
    const minInk = zmC.ink * 0.3;
    const coarseMin = Math.max(0.35, minScore - 0.1);
    const cands: { x: number; y: number; score: number }[] = [];

    for (let y = 0; y + th <= pageC.height; y++) {
      for (let x = 0; x + tw <= pageC.width; x++) {
        const a = y * stride + x;
        const b = a + tw;
        const c = (y + th) * stride + x;
        const d = c + tw;
        const s = isum[d] - isum[b] - isum[c] + isum[a];
        if (s < minInk) continue;
        const q = isq[d] - isq[b] - isq[c] + isq[a];
        const varN = q - (s * s) / n;
        if (varN <= 1e-6) continue;
        let corr = 0;
        for (let ty = 0; ty < th; ty++) {
          const row = (y + ty) * pageC.width + x;
          const trow = ty * tw;
          for (let tx = 0; tx < tw; tx++) corr += pageC.data[row + tx] * t[trow + tx];
        }
        const score = corr / (Math.sqrt(varN) * zmC.norm);
        if (score >= coarseMin) cands.push({ x, y, score });
      }
    }

    // coarse non-maximum suppression, then refine the survivors at full resolution
    cands.sort((p, q) => q.score - p.score);
    const r = Math.max(2, Math.min(tw, th) * 0.5);
    const kept: { x: number; y: number }[] = [];
    for (const cnd of cands) {
      if (kept.length >= maxCandidates) break;
      if (kept.some((k) => Math.abs(k.x - cnd.x) <= r && Math.abs(k.y - cnd.y) <= r)) continue;
      kept.push(cnd);
      // two-step local search at full resolution: stride f/2 over ±f, then ±1 around the best
      let best = -1;
      let bx = cnd.x * f;
      let by = cnd.y * f;
      const probe = (x: number, y: number) => {
        const sc = scoreAt(page, zmF, tpl.width, tpl.height, x, y);
        if (sc > best) {
          best = sc;
          bx = x;
          by = y;
        }
      };
      const step = Math.max(1, Math.round(f / 2));
      for (let dy = -f; dy <= f; dy += step) {
        for (let dx = -f; dx <= f; dx += step) probe(cnd.x * f + dx, cnd.y * f + dy);
      }
      const cx0 = bx;
      const cy0 = by;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (dx || dy) probe(cx0 + dx, cy0 + dy);
      }
      if (best >= minScore) {
        found.push({ cx: bx + tpl.width / 2, cy: by + tpl.height / 2, score: best, rot });
      }
    }
  }

  // one result per place, best rotation wins
  found.sort((p, q) => q.score - p.score);
  const radius = Math.min(tpl0.width, tpl0.height) * 0.5;
  const out: Match[] = [];
  for (const m of found) {
    if (out.some((o) => Math.hypot(o.cx - m.cx, o.cy - m.cy) <= radius)) continue;
    out.push(m);
  }
  return out;
}
