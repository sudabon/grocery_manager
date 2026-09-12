import type { NormalizedDicts } from './classify';
import { normalize } from './normalize';

function mergeRun(run: string[], dicts?: NormalizedDicts): string[] {
  if (!dicts?.maxEntryLength || run.length < 2) return run;
  const tokens: string[] = [];
  for (let i = 0; i < run.length;) {
    let candidate = run[i];
    let best = candidate;
    let end = i + 1;
    for (let j = i + 1; j < run.length; j++) {
      candidate += run[j];
      // 半角カナなどは正規化で縮むので、原文長では打ち切らない。
      const normalized = normalize(candidate);
      if (normalized.length > dicts.maxEntryLength) break;
      if (dicts.exact.has(normalized)) { best = candidate; end = j + 1; }
    }
    tokens.push(best);
    i = end;
  }
  return tokens;
}

export function tokenize(text: string, dicts?: NormalizedDicts): string[] {
  const runs: string[][] = [];
  if (typeof Intl.Segmenter === 'function') {
    let run: string[] = [];
    for (const part of new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)) {
      if (part.isWordLike) {
        run.push(part.segment);
      } else if (run.length) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length) runs.push(run);
  } else {
    for (const part of text.split(/[\s、。！？,.!?]+/u)) runs.push([part]);
  }
  return runs.flatMap((run) => mergeRun(run, dicts))
    .map((part) => part.trim()).filter((part) => /[\p{L}\p{N}]/u.test(part));
}
