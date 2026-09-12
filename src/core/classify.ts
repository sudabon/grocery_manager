import { normalize } from './normalize';

export type QuadrantId = 'q1' | 'q2' | 'q3' | 'q4';
export const QUADRANT_ORDER: QuadrantId[] = ['q1', 'q2', 'q3', 'q4'];
interface Entry { quadrant: QuadrantId; raw: string; normalized: string }
export interface NormalizedDicts {
  exact: Map<string, Entry[]>;
  entries: Entry[];
  maxEntryLength: number;
}
export interface ClassifyResult { quadrant: QuadrantId; matchedEntry: string | null }

export function buildNormalizedDicts(dicts: readonly { quadrant: QuadrantId; entries: readonly string[] }[]): NormalizedDicts {
  const exact = new Map<string, Entry[]>();
  const entries: Entry[] = [];
  let maxEntryLength = 0;
  for (const dict of dicts) for (const raw of dict.entries) {
    const normalized = normalize(raw);
    if (!normalized) continue;
    maxEntryLength = Math.max(maxEntryLength, normalized.length);
    const entry = { quadrant: dict.quadrant, raw, normalized };
    entries.push(entry);
    const matches = exact.get(normalized) ?? [];
    matches.push(entry);
    exact.set(normalized, matches);
  }
  return { exact, entries, maxEntryLength };
}

export function classify(token: string, dicts: NormalizedDicts, partialMatch: boolean): ClassifyResult | null {
  const normalized = normalize(token);
  if (!normalized) return null;
  const candidates = partialMatch ? dicts.entries : dicts.exact.get(normalized) ?? [];
  let best: Entry | undefined;
  for (const entry of candidates) {
    if (partialMatch && !normalized.includes(entry.normalized) && !entry.normalized.includes(normalized)) continue;
    if (!best || entry.normalized.length > best.normalized.length ||
        (entry.normalized.length === best.normalized.length && entry.quadrant < best.quadrant)) best = entry;
  }
  return best ? { quadrant: best.quadrant, matchedEntry: best.raw } : { quadrant: 'q4', matchedEntry: null };
}
