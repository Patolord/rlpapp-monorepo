import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import type { Box, Pt } from "../geom";
import {
  applyTransform,
  composeTransforms,
  fromPdfUserSpace,
  invertTransform,
  type PageRotation,
  type PageView,
  pageToFrame,
  rectFromPdfUserSpace,
  rectToPdfUserSpace,
  toPdfUserSpace,
  userToFrameTransform,
  type ViewportTransform,
  viewportSize,
  viewportTransform,
} from "./coords";

const close = (a: Pt, b: Pt) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};
const closeBox = (a: Box, b: Box) => {
  expect(a.minX).toBeCloseTo(b.minX, 9);
  expect(a.minY).toBeCloseTo(b.minY, 9);
  expect(a.maxX).toBeCloseTo(b.maxX, 9);
  expect(a.maxY).toBeCloseTo(b.maxY, 9);
};

/** A 600 × 400 MediaBox whose visible CropBox starts at (50, 20): 500 × 360. */
const CROPPED: PageView = [50, 20, 550, 380];

describe("viewportTransform", () => {
  it("0°: flips y, the top-left of the visible box is the origin", () => {
    const t = viewportTransform([0, 0, 600, 400], 0);
    expect(t).toEqual([1, 0, 0, -1, 0, 400]);
    close(fromPdfUserSpace({ x: 0, y: 400 }, t), { x: 0, y: 0 });
    close(fromPdfUserSpace({ x: 600, y: 0 }, t), { x: 600, y: 400 });
  });

  it("0° with a CropBox offset: user (50, 380) is the page-space origin", () => {
    const t = viewportTransform(CROPPED, 0);
    close(fromPdfUserSpace({ x: 50, y: 380 }, t), { x: 0, y: 0 });
    close(fromPdfUserSpace({ x: 550, y: 20 }, t), { x: 500, y: 360 });
    close(toPdfUserSpace({ x: 100, y: 60 }, t), { x: 150, y: 320 });
  });

  it("90°: the page turns clockwise, the user-space bottom-left becomes the top-left", () => {
    const t = viewportTransform(CROPPED, 90);
    expect(viewportSize(CROPPED, 90)).toEqual({ width: 360, height: 500 });
    close(fromPdfUserSpace({ x: 50, y: 20 }, t), { x: 0, y: 0 });
    close(fromPdfUserSpace({ x: 550, y: 380 }, t), { x: 360, y: 500 });
    // moving right in user space moves down the displayed page
    close(fromPdfUserSpace({ x: 150, y: 20 }, t), { x: 0, y: 100 });
  });

  it("180°: upside down, the user-space bottom-right becomes the top-left", () => {
    const t = viewportTransform(CROPPED, 180);
    expect(viewportSize(CROPPED, 180)).toEqual({ width: 500, height: 360 });
    close(fromPdfUserSpace({ x: 550, y: 20 }, t), { x: 0, y: 0 });
    close(fromPdfUserSpace({ x: 50, y: 380 }, t), { x: 500, y: 360 });
  });

  it("270°: counter-clockwise, the user-space top-right becomes the top-left", () => {
    const t = viewportTransform(CROPPED, 270);
    expect(viewportSize(CROPPED, 270)).toEqual({ width: 360, height: 500 });
    close(fromPdfUserSpace({ x: 550, y: 380 }, t), { x: 0, y: 0 });
    close(fromPdfUserSpace({ x: 50, y: 20 }, t), { x: 360, y: 500 });
  });
});

describe("page space ↔ user space", () => {
  const rotations: PageRotation[] = [0, 90, 180, 270];
  const views: PageView[] = [[0, 0, 2384, 1684], CROPPED, [-30, -10, 170, 90]];

  it("round-trips points for every rotation and box origin", () => {
    for (const view of views) {
      for (const r of rotations) {
        const t = viewportTransform(view, r);
        const { width, height } = viewportSize(view, r);
        for (const p of [
          { x: 0, y: 0 },
          { x: width, y: height },
          { x: width * 0.3, y: height * 0.8 },
        ]) {
          close(fromPdfUserSpace(toPdfUserSpace(p, t), t), p);
        }
        // the displayed page maps onto exactly the visible box
        closeBox(rectToPdfUserSpace({ minX: 0, minY: 0, maxX: width, maxY: height }, t), {
          minX: view[0],
          minY: view[1],
          maxX: view[2],
          maxY: view[3],
        });
      }
    }
  });

  it("crops of a rotated sheet turn with the page", () => {
    // 90°: a crop at the top-left of the displayed page is the bottom-left of user space
    const t = viewportTransform(CROPPED, 90);
    const crop = { minX: 10, minY: 30, maxX: 110, maxY: 80 };
    const user = rectToPdfUserSpace(crop, t);
    closeBox(user, { minX: 80, minY: 30, maxX: 130, maxY: 130 });
    closeBox(rectFromPdfUserSpace(user, t), crop);
    // every corner of the page-space crop is inside the user-space box
    for (const p of [
      { x: 10, y: 30 },
      { x: 110, y: 80 },
    ]) {
      const u = toPdfUserSpace(p, t);
      expect(u.x).toBeGreaterThanOrEqual(user.minX - 1e-9);
      expect(u.x).toBeLessThanOrEqual(user.maxX + 1e-9);
      expect(u.y).toBeGreaterThanOrEqual(user.minY - 1e-9);
      expect(u.y).toBeLessThanOrEqual(user.maxY + 1e-9);
    }
  });

  it("inverts and composes matrices", () => {
    const t = viewportTransform(CROPPED, 270);
    const id = composeTransforms(t, invertTransform(t));
    [1, 0, 0, 1, 0, 0].forEach((v, i) => {
      expect(id[i]).toBeCloseTo(v, 12);
    });
    expect(() => invertTransform([0, 0, 0, 0, 1, 1])).toThrow();
  });
});

describe("frame placement", () => {
  it("draws the crop's top-left at the frame's top-left, y up, scaled by the zoom", () => {
    for (const r of [0, 90, 180, 270] as PageRotation[]) {
      const t = viewportTransform(CROPPED, r);
      const crop = { minX: 40, minY: 25, maxX: 140, maxY: 75 };
      const m = userToFrameTransform(t, crop, 2);
      // a user-space point lands where its page-space image does under pageToFrame
      for (const p of [
        { x: 40, y: 25 },
        { x: 140, y: 75 },
        { x: 90, y: 30 },
      ]) {
        close(applyTransform(toPdfUserSpace(p, t), m), pageToFrame(p, crop, 2));
      }
      close(pageToFrame({ x: 40, y: 25 }, crop, 2), { x: 0, y: 100 });
      close(pageToFrame({ x: 140, y: 75 }, crop, 2), { x: 200, y: 0 });
    }
  });
});

/** A bare PDF (no content) with the given page boxes, for checking against pdf.js itself. */
function makePdf(pages: { media: number[]; crop?: number[]; rotate?: number }[]): Uint8Array {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ...pages.map(
      (p) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [${p.media.join(" ")}]` +
        (p.crop ? ` /CropBox [${p.crop.join(" ")}]` : "") +
        (p.rotate ? ` /Rotate ${p.rotate}` : "") +
        " >>",
    ),
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

describe("against pdf.js", () => {
  it("matches PageViewport.transform for rotated and cropped pages", async () => {
    const specs = [
      { media: [0, 0, 600, 400] },
      { media: [0, 0, 600, 400], crop: [50, 20, 550, 380], rotate: 90 },
      { media: [0, 0, 600, 400], crop: [50, 20, 550, 380], rotate: 180 },
      { media: [0, 0, 600, 400], crop: [50, 20, 550, 380], rotate: 270 },
      { media: [-30, -10, 170, 90], rotate: 90 },
      // a CropBox reaching past the MediaBox: pdf.js keeps the intersection
      { media: [0, 0, 300, 200], crop: [100, -50, 400, 150] },
    ];
    const task = pdfjs.getDocument({ data: makePdf(specs), verbosity: 0 });
    const doc = await task.promise;
    try {
      for (let i = 0; i < specs.length; i++) {
        const page = await doc.getPage(i + 1);
        const vp = page.getViewport({ scale: 1 });
        const view = page.view as unknown as PageView;
        const t = viewportTransform(view, page.rotate as PageRotation);
        t.forEach((v, k) => {
          expect(v).toBeCloseTo(vp.transform[k], 9);
        });
        expect(viewportSize(view, page.rotate as PageRotation)).toEqual({
          width: vp.width,
          height: vp.height,
        });
        const p = { x: vp.width * 0.25, y: vp.height * 0.6 };
        const [ux, uy] = vp.convertToPdfPoint(p.x, p.y);
        close(toPdfUserSpace(p, vp.transform as unknown as ViewportTransform), {
          x: ux,
          y: uy,
        });
      }
    } finally {
      await task.destroy();
    }
  });
});
