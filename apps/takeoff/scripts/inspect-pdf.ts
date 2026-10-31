// Inspect PDFs: page sizes, operator counts, vector segment counts, text and images.
// Usage: bun scripts/inspect-pdf.ts <file.pdf> [...more]
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const OPS = pdfjs.OPS;
for (const file of process.argv.slice(2)) {
  const data = new Uint8Array(readFileSync(file));
  const t0 = performance.now();
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const tLoad = performance.now() - t0;
  console.log(`\n== ${file}  pages=${doc.numPages}  load=${tLoad.toFixed(0)}ms`);
  for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const t1 = performance.now();
    const ol = await page.getOperatorList();
    const tOps = performance.now() - t1;
    let paths = 0,
      segs = 0,
      images = 0,
      texts = 0,
      forms = 0,
      pathAsPath2D = 0;
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i];
      if (fn === OPS.constructPath) {
        paths++;
        const d = ol.argsArray[i][1]?.[0];
        if (d && typeof d.length === "number") segs += d.length / 3;
        else pathAsPath2D++;
      } else if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintImageMaskXObject ||
        fn === OPS.paintInlineImageXObject
      )
        images++;
      else if (fn === OPS.showText || fn === OPS.showSpacedText) texts++;
      else if (fn === OPS.paintFormXObjectBegin) forms++;
    }
    const tc = await page.getTextContent();
    console.log(
      `  p${p}: ${vp.width.toFixed(0)}x${vp.height.toFixed(0)}pt (${((vp.width / 72) * 25.4).toFixed(0)}x${((vp.height / 72) * 25.4).toFixed(0)}mm) rot=${page.rotate} ops=${ol.fnArray.length} paths=${paths} ~segs=${segs.toFixed(0)} images=${images} textOps=${texts} textItems=${tc.items.length} forms=${forms} path2d=${pathAsPath2D} opList=${tOps.toFixed(0)}ms`,
    );
  }
  await doc.cleanup?.();
}
