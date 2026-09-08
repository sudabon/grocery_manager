export function tokenize(text: string): string[] {
  const segments = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)]
      .filter((part) => part.isWordLike).map((part) => part.segment)
    : text.split(/[\s、。！？,.!?]+/u);
  return segments.map((part) => part.trim()).filter((part) => /[\p{L}\p{N}]/u.test(part));
}
