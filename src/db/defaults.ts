import type { AppSettings, Dictionary } from './schema';

export const defaultSettings: AppSettings = {
  key: 'app', partialMatch: false, autoCommitMs: 1500, allowDuplicates: true, showDictationHint: true,
};
export function seedDictionaries(now = Date.now()): Dictionary[] {
  return [
    { quadrant: 'q1', label: '仕事', entries: ['会議', '資料', 'メール', 'レビュー'], updatedAt: now },
    { quadrant: 'q2', label: '家庭', entries: ['洗濯', '掃除', '料理', '保育園'], updatedAt: now },
    { quadrant: 'q3', label: '買い物', entries: ['牛乳', '卵', 'パン', '洗剤'], updatedAt: now },
    { quadrant: 'q4', label: 'その他', entries: [], updatedAt: now },
  ];
}
