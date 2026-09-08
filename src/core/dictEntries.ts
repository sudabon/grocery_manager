import { normalize } from './normalize';

export function sanitizeEntries(rawText: string): string[] {
  const seen = new Set<string>();
  return rawText.split(/\r\n?|\n/).map((line) => line.trim()).filter((entry) => {
    const key = normalize(entry);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
