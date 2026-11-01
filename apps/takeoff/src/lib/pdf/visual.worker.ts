import { type Gray, type Match, type MatchOptions, matchTemplate } from "./visual";

export interface VisualRequest {
  id: number;
  page: Gray;
  tpl: Gray;
  opts: MatchOptions;
}

export interface VisualResponse {
  id: number;
  matches: Match[];
}

self.onmessage = (e: MessageEvent<VisualRequest>) => {
  const { id, page, tpl, opts } = e.data;
  const matches = matchTemplate(page, tpl, opts);
  (self as unknown as Worker).postMessage({ id, matches } satisfies VisualResponse);
};
