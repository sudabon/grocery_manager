import { test, expect } from './fixtures/memo-board';

test('初期表示で4象限が等分割されラベルが見えチップは0件', { tag: ['@add-quadmemo-quadrant-ui', '@TP-001'] }, async ({ memo }) => {
  for (const [id, label] of [[1, '仕事'], [2, '家庭'], [3, '買い物'], [4, 'その他']] as const) await expect(memo.quadrant(id)).toContainText(label);
  await expect(memo.chips).toHaveCount(0); await memo.expectEqualQuadrants();
});
test('あふれた象限だけをスクロールし末尾チップへ到達できる', { tag: ['@add-quadmemo-quadrant-ui', '@TP-002'] }, async ({ memo }) => {
  await memo.start(); for (let i = 0; i < 4; i++) await memo.add(Array(50).fill('牛乳').join(' '));
  await expect(memo.chips).toHaveCount(200); await memo.closeInput.click(); await memo.expectIndependentScroll();
});
test('マイクのタップで入力バーが開き入力欄にフォーカスする', { tag: ['@add-quadmemo-quadrant-ui', '@TP-003'] }, async ({ memo }) => {
  await memo.start(); await expect(memo.input).toBeVisible(); await expect(memo.confirm).toBeVisible();
});
test('入力バーを閉じるとマイクが音声メモ開始に戻る', { tag: ['@add-quadmemo-quadrant-ui', '@TP-004'] }, async ({ memo }) => {
  await memo.start(); await memo.closeInput.click(); await expect(memo.input).toBeHidden(); await expect(memo.mic).toBeVisible();
});
test('入力後に操作しないと自動コミットされ入力欄が空になる', { tag: ['@add-quadmemo-quadrant-ui', '@TP-005'] }, async ({ memo }) => {
  await memo.start(); await memo.input.fill('牛乳'); await expect(memo.chip('牛乳')).toBeVisible(); await expect(memo.input).toHaveValue(''); await expect(memo.input).toBeFocused();
});
test('確定ボタンで即時コミットされる', { tag: ['@add-quadmemo-quadrant-ui', '@TP-006'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳'); await expect(memo.chip('牛乳')).toBeVisible(); await expect(memo.input).toHaveValue('');
});
test('Enterキーでコミットされる', { tag: ['@add-quadmemo-quadrant-ui', '@TP-007'] }, async ({ memo }) => {
  await memo.start(); await memo.input.fill('牛乳'); await memo.input.press('Enter'); await expect(memo.chip('牛乳')).toBeVisible(); await expect(memo.input).toHaveValue('');
});
test('コミット後に再タップせず連続入力して2件目を追加できる', { tag: ['@add-quadmemo-quadrant-ui', '@TP-008'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳'); await expect(memo.input).toBeFocused(); await memo.typeWithoutRefocus('卵');
  await expect(memo.chips).toHaveCount(2); await expect(memo.chip('卵')).toBeVisible();
});
test('閉じる操作で未確定テキストをコミットする', { tag: ['@add-quadmemo-quadrant-ui', '@TP-009'] }, async ({ memo }) => {
  await memo.start(); await memo.input.fill('牛乳'); await memo.closeInput.click(); await expect(memo.chip('牛乳')).toBeVisible(); await expect(memo.input).toBeHidden();
});
test('複数単語をコミットすると単語ごとに順に並ぶ', { tag: ['@add-quadmemo-quadrant-ui', '@TP-010'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳 卵 パン'); await expect(memo.chips).toHaveText(['牛乳', '卵', 'パン']);
});
test('句読点を含む入力から単語のチップだけを生成する', { tag: ['@add-quadmemo-quadrant-ui', '@TP-011'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳、卵。パン！？'); await expect(memo.chips).toHaveText(['牛乳', '卵', 'パン']);
});
test('単語分割APIがなくてもフォールバックでチップを生成する', { tag: ['@add-quadmemo-quadrant-ui', '@TP-012'] }, async ({ noSegmenter: memo }) => {
  await memo.start(); await memo.add('牛乳、卵。パン！？ ★'); await expect(memo.chips).toHaveText(['牛乳', '卵', 'パン']);
});
test('辞書がない場合は全チップをQ4に配置する', { tag: ['@add-quadmemo-quadrant-ui', '@TP-013'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳 卵'); await expect(memo.quadrantChips(4)).toHaveCount(2);
  for (const id of [1, 2, 3]) await expect(memo.quadrantChips(id)).toHaveCount(0);
});
test('未マッチチップは未分類という名前と点線で識別できる', { tag: ['@add-quadmemo-quadrant-ui', '@TP-014'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳'); await expect(memo.chip('牛乳')).toHaveAccessibleName('メモ「牛乳」（未分類）'); await expect(memo.chip('牛乳')).toHaveCSS('border-top-style', 'dashed');
});
test('記号のみのコミットはチップも通知も出さない', { tag: ['@add-quadmemo-quadrant-ui', '@TP-015'] }, async ({ memo }) => {
  await memo.start(); await memo.add('！？、。★🎤'); await expect(memo.input).toHaveValue(''); await expect(memo.chips).toHaveCount(0); await expect(memo.toast).toBeEmpty();
});
test('51語のコミットは先頭50件のみ登録し通知する', { tag: ['@add-quadmemo-quadrant-ui', '@TP-016'] }, async ({ memo }) => {
  await memo.start(); await memo.add([...Array(50).fill('牛乳'), '卵'].join(' '));
  await expect(memo.chips).toHaveCount(50); await expect(memo.chip('卵')).toHaveCount(0); await expect(memo.toast).toContainText('先頭50件のみ登録しました');
});
test('チップ操作では現在の象限への移動を選べない', { tag: ['@add-quadmemo-quadrant-ui', '@TP-017'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳'); await memo.openChip('牛乳'); await expect(memo.moveButton(4)).toBeDisabled();
});
test('別象限へ移動すると元象限から消える', { tag: ['@add-quadmemo-quadrant-ui', '@TP-018'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳'); await memo.openChip('牛乳'); await memo.moveButton(1).click();
  await expect(memo.quadrantChips(1)).toHaveText(['牛乳']); await expect(memo.quadrantChips(4)).toHaveCount(0);
});
test('チップを編集すると表示が更新される', { tag: ['@add-quadmemo-quadrant-ui', '@TP-019'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳'); await memo.openChip('牛乳'); await memo.edit('パン'); await expect(memo.chips).toHaveText(['パン']);
});
test('チップを削除しても他のチップは残る', { tag: ['@add-quadmemo-quadrant-ui', '@TP-020'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳 卵'); await memo.openChip('牛乳'); await memo.remove(); await expect(memo.chips).toHaveText(['卵']);
});
test('編集で空白だけにするとチップを削除する', { tag: ['@add-quadmemo-quadrant-ui', '@TP-021'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳'); await memo.openChip('牛乳'); await memo.edit('   '); await expect(memo.chips).toHaveCount(0);
});
test('辞書編集へ遷移して戻り直リンクでも画面が表示される', { tag: ['@add-quadmemo-quadrant-ui', '@TP-022'] }, async ({ memo, appShell }) => {
  await appShell.openDictionaries(); await appShell.expectSecondary('辞書編集'); await appShell.backToMemo(); await expect(memo.board).toBeVisible();
  await appShell.goto('/dictionaries'); await appShell.expectSecondary('辞書編集');
});
test('設定へ遷移して戻り直リンクとリロードでも画面が表示される', { tag: ['@add-quadmemo-quadrant-ui', '@TP-023'] }, async ({ memo, appShell }) => {
  await appShell.openSettings(); await appShell.expectSecondary('設定'); await appShell.backToMemo(); await expect(memo.board).toBeVisible();
  await appShell.goto('/settings'); await appShell.reload(); await appShell.expectSecondary('設定');
});
test('入力欄の実効フォントサイズは16px以上', { tag: ['@add-quadmemo-quadrant-ui', '@TP-024'] }, async ({ memo }) => {
  await memo.start(); expect(await memo.input.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
});
test('マイクとチップをロールと名前で一意に識別できる', { tag: ['@add-quadmemo-quadrant-ui', '@TP-025'] }, async ({ memo }) => {
  await expect(memo.mic).toHaveCount(1); const size = await memo.mic.boundingBox(); expect(size!.width).toBeGreaterThanOrEqual(64); expect(size!.height).toBeGreaterThanOrEqual(64);
  await memo.start(); await memo.add('牛乳'); await expect(memo.chip('牛乳')).toHaveCount(1);
});
test('アクションシートのフォーカスは前後のTab操作で外に出ない', { tag: ['@add-quadmemo-quadrant-ui', '@TP-026'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳'); await memo.openChip('牛乳'); await memo.expectFocusContained();
});
test('モーション低減時はチップのアニメーションを無効化する', { tag: ['@add-quadmemo-quadrant-ui', '@TP-027'] }, async ({ reducedMotionBoard: memo }) => {
  await memo.start(); await memo.add('牛乳'); await expect(memo.chip('牛乳')).toBeVisible(); await expect(memo.chip('牛乳')).toHaveCSS('animation-name', 'none');
});
test('確定ボタンを連打しても重複追加しない', { tag: ['@add-quadmemo-quadrant-ui', '@TP-028'] }, async ({ memo }) => {
  await memo.start(); await memo.add('牛乳'); await memo.confirm.click({ clickCount: 3 }); await expect(memo.chips).toHaveText(['牛乳']);
});
test('dialog未対応でもアクションシートのフォーカスを保持する', { tag: ['@add-quadmemo-quadrant-ui', '@TP-026'] }, async ({ noDialog: memo }) => {
  await memo.start(); await memo.add('牛乳'); await memo.openChip('牛乳'); await memo.expectFocusContained(); await memo.edit('パン'); await expect(memo.chips).toHaveText(['パン']);
});
