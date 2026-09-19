import { test, expect } from './fixtures/memo-board';

// iOS のディクテーションは、自動コミットで空になった入力欄へ「コミット済みの文字列 + その後の発話」を
// 通常の insertText として書き戻す。Playwright の fill は空の入力欄に対して同じ形（選択範囲なしの
// insertText）で挿入するので、書き戻しの再現に使う。ディクテーション自体は OS 機能で E2E から起動できない。
const tags = (id: string) => ({ tag: ['@fix-quadmemo-dictation-writeback', `@${id}`] });

test('書き戻しがコミット済みと同一ならチップは増えず入力欄が空になる', tags('TP-001'), async ({ memo }) => {
  await memo.start(); await memo.input.fill('牛乳'); await expect(memo.chip('牛乳')).toBeVisible(); await expect(memo.input).toHaveValue('');
  await memo.input.fill('牛乳'); await expect(memo.input).toHaveValue('');
  await expect(memo.chips).toHaveCount(1);
});

test('書き戻しに続きの発話が含まれる場合は続きのチップだけ追加される', tags('TP-002'), async ({ memo }) => {
  await memo.start(); await memo.input.fill('牛乳'); await expect(memo.chip('牛乳')).toBeVisible(); await expect(memo.input).toHaveValue('');
  await memo.input.fill('牛乳、卵');
  await memo.expectQuadrantTexts([[], [], [], ['牛乳', '卵']]); await expect(memo.input).toHaveValue('');
});

test('入力バーを閉じて開き直した後は先頭が一致しても新しい入力として登録される', tags('TP-003'), async ({ memo }) => {
  await memo.start(); await memo.add('卵'); await expect(memo.chip('卵')).toBeVisible();
  await memo.closeInput.click(); await memo.start();
  await memo.add('卵焼き');
  await memo.expectQuadrantTexts([[], [], [], ['卵', '卵焼き']]);
});

test('キー入力は書き戻しとして扱われず丸ごと登録される', tags('TP-004'), async ({ memo }) => {
  await memo.start(); await memo.input.fill('egg'); await expect(memo.chip('egg')).toBeVisible(); await expect(memo.input).toHaveValue('');
  await memo.input.pressSequentially('eggs'); await memo.confirm.click();
  await memo.expectQuadrantTexts([[], [], [], ['egg', 'eggs']]);
});
