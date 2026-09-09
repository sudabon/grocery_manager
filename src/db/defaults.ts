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
    { quadrant: 'q1', label: QUADRANT_LABELS.q1, entries: ['会議', '資料', 'メール', 'レビュー'], updatedAt: now },
    { quadrant: 'q2', label: QUADRANT_LABELS.q2, entries: ['洗濯', '掃除', '料理', '保育園'], updatedAt: now },
    { quadrant: 'q3', label: QUADRANT_LABELS.q3, entries: ['牛乳', '卵', 'パン', '洗剤'], updatedAt: now },
    { quadrant: 'q4', label: QUADRANT_LABELS.q4, entries: [], updatedAt: now },
  ];
}
