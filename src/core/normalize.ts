export function normalize(text: string): string {
  // NFKC must precede kana conversion so half-width katakana (including dakuten)
  // becomes full-width first. Locale-independent lowercasing keeps matching deterministic.
  return text.normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60)).trim();
}
