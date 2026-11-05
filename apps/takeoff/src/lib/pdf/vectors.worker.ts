import { type IndexRequest, indexPaths } from "./vectorsCore";

self.onmessage = (e: MessageEvent<IndexRequest>) => {
  const res = indexPaths(e.data);
  (self as unknown as Worker).postMessage(res, [
    res.segs.buffer,
    res.keys.buffer,
    res.starts.buffer,
    res.ids.buffer,
  ]);
};
