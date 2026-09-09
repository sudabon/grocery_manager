import type { QuadrantId } from '../core/classify';
import type { AppSettings, Dictionary } from './schema';

export const QUADRANT_LABELS: Record<QuadrantId, string> = {
  q1: 'それ以外', q2: '野菜', q3: '肉類・乳製品', q4: 'ドラッグストア',
};

export const defaultSettings: AppSettings = {
  key: 'app', partialMatch: false, autoCommitMs: 1500, allowDuplicates: true, showDictationHint: true, installHintDismissed: false,
};
export function seedDictionaries(now = Date.now()): Dictionary[] {
  return [
    { quadrant: 'q1', label: QUADRANT_LABELS.q1, entries: [], updatedAt: now },
    { quadrant: 'q2', label: QUADRANT_LABELS.q2, entries: ['にんじん', 'たまねぎ', 'キャベツ', 'じゃがいも'], updatedAt: now },
    { quadrant: 'q3', label: QUADRANT_LABELS.q3, entries: ['牛乳', '卵', '鶏肉', 'チーズ'], updatedAt: now },
    { quadrant: 'q4', label: QUADRANT_LABELS.q4, entries: [], updatedAt: now },
  ];
}
