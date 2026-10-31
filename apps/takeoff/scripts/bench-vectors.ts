// Benchmark vector extraction + indexing phases on a PDF page.
// Usage: pnpm bench <file.pdf> [pageNumber]
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { collectPaths } from "../src/lib/pdf/vectors";
import { buildIndex, type Mat, walkPath } from "../src/lib/pdf/vectorsCore";

const [file, pageArg = "1"] = process.argv.slice(2);
const data = new Uint8Array(readFileSync(file));
const doc = await pdfjs.getDocument({ data }).promise;
const page = await doc.getPage(Number(pageArg));

let t = performance.now();
const { data: pathData, offsets, mats } = await collectPaths(page as never);
console.log(`collect: ${offsets.length - 1} paths in ${(performance.now() - t).toFixed(0)}ms`);

t = performance.now();
const out: number[] = [];
for (let i = 0; i < offsets.length - 1; i++) {
  walkPath(
    pathData.subarray(offsets[i], offsets[i + 1]),
    Array.from(mats.subarray(i * 6, i * 6 + 6)) as Mat,
    out,
  );
}
const segs = Float32Array.from(out);
console.log(`walk: ${segs.length / 4} segments in ${(performance.now() - t).toFixed(0)}ms`);

// length distribution
const vp = page.getViewport({ scale: 1 });
let long = 0;
let outside = 0;
let totalLen = 0;
let maxLen = 0;
for (let i = 0; i < segs.length; i += 4) {
  const l = Math.hypot(segs[i + 2] - segs[i], segs[i + 3] - segs[i + 1]);
  totalLen += l;
  if (l > maxLen) maxLen = l;
  if (l > 200) long++;
  if (segs[i] < -10 || segs[i + 1] < -10 || segs[i] > vp.width + 10 || segs[i + 1] > vp.height + 10)
    outside++;
}
console.log(
  `page ${vp.width.toFixed(0)}x${vp.height.toFixed(0)}  avgLen=${(totalLen / (segs.length / 4)).toFixed(1)} maxLen=${maxLen.toFixed(0)} long(>200pt)=${long} outsidePage=${outside}`,
);

t = performance.now();
const idx = buildIndex(segs);
console.log(
  `index: ${idx.keys.length} cells, ${idx.ids.length} entries in ${(performance.now() - t).toFixed(0)}ms`,
);
