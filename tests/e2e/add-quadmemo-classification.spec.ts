import { test, expect } from './fixtures/classification';

const tags = (id: string) => ({ tag: ['@add-quadmemo-classification', `@${id}`] });

test('全角英字をコミットすると半角エントリの象限へ自動分類される', tags('TP-001'), async ({ memo }) => {
  await memo.start(); await memo.add('ＡＰＰＬＥ');
  await expect(memo.quadrantChips(1)).toHaveText(['ＡＰＰＬＥ']);
  await expect(memo.classifiedChip('ＡＰＰＬＥ')).toHaveCSS('border-top-style', 'solid');
});
test('カタカナをコミットするとひらがなエントリの象限へ入る', tags('TP-002'), async ({ memo }) => {
  await memo.start(); await memo.add('パン'); await expect(memo.quadrantChips(2)).toHaveText(['パン']);
});
test('かな表記をコミットしても漢字エントリには一致せずQ4に入る', tags('TP-003'), async ({ memo }) => {
  await memo.start(); await memo.add('ねこ'); await expect(memo.quadrantChips(4)).toHaveText(['ねこ']); await expect(memo.chip('ねこ')).toBeVisible();
});
test('辞書登録語をコミットするとその象限に自動分類される', tags('TP-004'), async ({ memo }) => {
  await memo.start(); await memo.add('apple'); await expect(memo.quadrantChips(1)).toHaveText(['apple']); await expect(memo.classifiedChip('apple')).toBeVisible();
});
test('未登録語をコミットするとQ4へ未マッチとして入る', tags('TP-005'), async ({ memo }) => {
  await memo.start(); await memo.add('unknown'); await expect(memo.quadrantChips(4)).toHaveText(['unknown']); await expect(memo.chip('unknown')).toHaveCSS('border-top-style', 'dashed');
});
test('登録語と未登録語を同時に入れると実線と点線で区別できる', tags('TP-006'), async ({ memo }) => {
  await memo.start(); await memo.add('apple unknown');
  await expect(memo.classifiedChip('apple')).toHaveCSS('border-top-style', 'solid'); await expect(memo.chip('unknown')).toHaveCSS('border-top-style', 'dashed');
});
test.describe('部分一致の最長優先', () => {
  test.use({ classificationSeed: 'seed:dict-overlap-partial' });
  test('短い語と長い語に一致する入力は長いエントリの象限へ入る', tags('TP-007'), async ({ memo }) => {
    await memo.start(); await memo.add('apples'); await expect(memo.quadrantChips(2)).toHaveText(['apples']);
    await expect(memo.quadrantChips(1)).toHaveCount(0);
  });
});
test.describe('正規化の競合', () => {
  test.use({ classificationSeed: 'seed:dict-normalize-tie' });
  test('正規化で同一になる語を入れると象限順でQ1が選ばれる', tags('TP-008'), async ({ memo }) => {
    await memo.start(); await memo.add('apple'); await expect(memo.quadrantChips(1)).toHaveText(['apple']); await expect(memo.quadrantChips(2)).toHaveCount(0);
  });
});
test.describe('双方向の部分一致', () => {
  test.use({ classificationSeed: 'seed:settings-partial-match' });
  test('トークンがエントリを含むと対応象限へ入る', tags('TP-009'), async ({ memo }) => {
    await memo.start(); await memo.add('apples'); await expect(memo.quadrantChips(1)).toHaveText(['apples']);
  });
  test('エントリがトークンを含むと対応象限へ入る', tags('TP-010'), async ({ memo }) => {
    await memo.start(); await memo.add('app'); await expect(memo.quadrantChips(1)).toHaveText(['app']);
  });
});
test('部分一致OFFでは含まれるだけの語はQ4へ入る', tags('TP-011'), async ({ memo }) => {
  await memo.start(); await memo.add('apples'); await expect(memo.quadrantChips(4)).toHaveText(['apples']); await expect(memo.chip('apples')).toBeVisible();
});
test.describe('重複OFF', () => {
  test.use({ classificationSeed: 'seed:settings-no-duplicates' });
  test('同じ語を追加すると件数が増えず既存チップが一時強調される', tags('TP-012'), async ({ memo }) => {
    await memo.start(); await memo.add('ＡＰＰＬＥ'); await expect(memo.chips).toHaveCount(1);
    await expect(memo.highlightedChip('apple')).toBeVisible(); await expect(memo.highlightedChip('apple')).toHaveCSS('outline-style', 'solid');
    await expect(memo.classifiedChip('apple')).toBeVisible(); await expect(memo.classifiedChip('apple')).not.toHaveClass(/chip-highlighted/);
  });
});
test('重複ONでは同じ語を2回入れると2件並ぶ', tags('TP-013'), async ({ memo }) => {
  await memo.start(); await memo.add('apple'); await memo.add('apple'); await expect(memo.quadrantChips(1)).toHaveText(['apple', 'apple']);
});
test('同じ語を3回コミットしてもすべて同じ象限へ入る', tags('TP-014'), async ({ memo }) => {
  await memo.start(); for (let i = 0; i < 3; i++) await memo.add('apple'); await expect(memo.quadrantChips(1)).toHaveText(['apple', 'apple', 'apple']);
  await expect(memo.chips).toHaveCount(3);
});
test('2件追加してリロードすると同じ象限のチップが復元される', tags('TP-015'), async ({ memo }) => {
  await memo.start(); await memo.add('apple パン'); await memo.waitForSave(); await memo.reload();
  await expect(memo.chips).toHaveCount(2); await expect(memo.quadrantChips(1)).toHaveText(['apple']); await expect(memo.quadrantChips(2)).toHaveText(['パン']);
});
test.describe('保存済みメモの操作', () => {
  test.use({ classificationSeed: 'seed:memos-across-quadrants' });
  test('移動・編集・削除のあとリロードしても変更が維持される', tags('TP-016'), async ({ memo }) => {
    await memo.openClassifiedChip('apple'); await memo.moveButton(4).click();
    await memo.openClassifiedChip('ぱん'); await memo.edit('edited');
    await memo.openClassifiedChip('牛乳'); await memo.remove(); await memo.waitForSave(); await memo.reload();
    await expect(memo.chips).toHaveCount(2); await expect(memo.quadrantChips(4)).toHaveText(['apple']);
    await expect(memo.quadrantChips(2)).toHaveText(['edited']); await expect(memo.quadrantChips(1)).toHaveCount(0); await expect(memo.quadrantChips(3)).toHaveCount(0);
  });
});
test.describe('保存済みの独自辞書', () => {
  test.use({ classificationSeed: 'seed:dict-custom-labels' });
  test('保存済みラベルと部分一致設定をロードして対応象限へ分類する', tags('TP-017'), async ({ memo }) => {
    for (const [id, label] of [[1, '企画'], [2, '暮らし'], [3, '食品'], [4, '保留']] as const) await expect(memo.quadrant(id)).toHaveAccessibleName(`Q${id} ${label}`);
    await memo.start(); await memo.add('apples'); await expect(memo.quadrantChips(1)).toHaveText(['apples']);
    await memo.openClassifiedChip('apples'); await expect(memo.moveButton(2)).toHaveText('Q2 暮らしへ移動');
  });
  test('リロードしても独自ラベルと設定が初期値に戻らない', tags('TP-019'), async ({ memo }) => {
    await memo.reload(); await expect(memo.quadrant(1)).toHaveAccessibleName('Q1 企画');
    await memo.start(); await memo.add('apples'); await expect(memo.quadrantChips(1)).toHaveText(['apples']);
  });
});
test.describe('初回起動', () => {
  test.use({ classificationSeed: 'seed:fresh-storage' });
  test('保存データなしで起動すると初期ラベルが見えシード辞書で分類される', tags('TP-018'), async ({ memo }) => {
    for (const [id, label] of [[1, '仕事'], [2, '家庭'], [3, '買い物'], [4, 'その他']] as const) await expect(memo.quadrant(id)).toHaveAccessibleName(`Q${id} ${label}`);
    await memo.start(); await memo.add('会議 牛乳'); await expect(memo.quadrantChips(1)).toHaveText(['会議']); await expect(memo.quadrantChips(3)).toHaveText(['牛乳']);
  });
});
test('同一象限へ順に追加してリロードしても作成順が変わらない', tags('TP-020'), async ({ memo }) => {
  await memo.start(); await memo.add('first'); await memo.add('second'); await memo.add('third'); await memo.waitForSave(); await memo.reload();
  await expect(memo.quadrantChips(4)).toHaveText(['first', 'second', 'third']);
});
test.describe('保存失敗', () => {
  test.use({ classificationSeed: 'env:idb-write-failure' });
  test('保存が失敗してもチップは残り警告と通知が表示される', tags('TP-021'), async ({ memo }) => {
    await memo.start(); await memo.add('unknown'); await expect(memo.unsavedChip('unknown')).toBeVisible();
    await expect(memo.unsavedChip('unknown')).toContainText('⚠'); await expect(memo.toast).toContainText('保存できませんでした');
    await expect(memo.chips).toHaveCount(1);
  });
});
test.describe('保存不可環境', () => {
  test.use({ classificationSeed: 'env:idb-blocked' });
  test('保存不可なら案内を表示し閉じても再訪時に再表示する', tags('TP-022'), async ({ memo, appShell }) => {
    await expect(memo.storageBanner).toContainText('データを端末に保存できません');
    await memo.closeStorageBanner(); await expect(memo.storageBanner).toBeHidden();
    await appShell.openSettings(); await appShell.backToMemo(); await expect(memo.storageBanner).toBeVisible();
  });
});
test('追加・移動・編集・削除と画面遷移で配信元以外へのリクエストが発生しない', tags('TP-023'), async ({ memo, appShell, externalRequests }) => {
  await memo.start(); await memo.add('apple'); await memo.openClassifiedChip('apple'); await memo.moveButton(2).click();
  await memo.openClassifiedChip('apple'); await memo.edit('edited'); await memo.openChip('edited'); await memo.remove(); await memo.waitForSave();
  await appShell.openDictionaries(); await appShell.expectSecondary('辞書編集'); await appShell.backToMemo();
  await appShell.openSettings(); await appShell.expectSecondary('設定'); await appShell.backToMemo(); await expect(memo.board).toBeVisible();
  expect(externalRequests).toEqual([]);
});
test('50件を一括コミットしてリロードすると欠けや重複なく復元される', tags('TP-024'), async ({ memo }) => {
  const tokens = Array.from({ length: 50 }, (_, i) => `token${i}`);
  await memo.start(); await memo.add(tokens.join(' ')); await expect(memo.chips).toHaveCount(50);
  await memo.waitForSave(); await memo.reload(); await expect(memo.quadrantChips(4)).toHaveText(tokens);
});
