import { test, expect, fixtureFile, readDownload } from './fixtures/dictionaries';

const tags = (id: string) => ({ tag: ['@add-quadmemo-memo-length-limit', `@${id}`] });
const dataOnly = ({ memos, dictionaries, settings }: Record<string, unknown>) => ({ memos, dictionaries, settings });

test.describe('残り容量が少ない象限', () => {
  test.use({ classificationSeed: 'seed:quadrant-near-limit' });
  test('収まる分だけ追加し一部のみ登録したことを通知する', tags('TP-001'), async ({ memo }) => {
    await memo.start(); await memo.add('猫 猫 猫');
    await expect(memo.quadrantChips(1)).toHaveCount(3);
    await expect(memo.classifiedChip('猫')).toHaveCount(2);
    await expect(memo.remaining(1)).toHaveText('残り0文字');
    await expect(memo.toast).toContainText('一部のみ登録しました。');
    await memo.waitForSave(); await memo.reload();
    await expect(memo.quadrantChips(1)).toHaveCount(3);
  });
  test('上限を超える編集は本文を変えず通知する', tags('TP-003'), async ({ memo }) => {
    await memo.openClassifiedChip('a'.repeat(95)); await memo.edit('a'.repeat(101));
    await expect(memo.classifiedChip('a'.repeat(95))).toBeVisible();
    await expect(memo.remaining(1)).toHaveText('残り4文字');
    await expect(memo.toast).toContainText('100文字上限');
    await expect(memo.sheet).toBeVisible();
    await memo.reload(); await expect(memo.classifiedChip('a'.repeat(95))).toBeVisible();
  });
  test('入力中に各象限の残り容量を読み取れる', tags('TP-006'), async ({ memo }) => {
    await memo.start();
    for (const [id, remaining] of [[1, 4], [2, 97], [3, 100], [4, 100]]) {
      await expect(memo.remaining(id)).toBeVisible();
      await expect(memo.remaining(id)).toHaveText(`残り${remaining}文字`);
    }
  });
});

test.describe('上限に達した象限', () => {
  test.use({ classificationSeed: 'seed:quadrant-at-limit' });
  test('満杯の象限には追加せず上限を通知する', tags('TP-002'), async ({ memo }) => {
    await memo.start(); await memo.add('apple');
    await expect(memo.quadrantChips(1)).toHaveCount(1);
    await expect(memo.remaining(1)).toHaveText('残り0文字');
    await expect(memo.toast).toContainText('100文字上限');
    await memo.reload(); await expect(memo.quadrantChips(1)).toHaveCount(1);
  });
  test('満杯の象限への移動を拒否し元の象限に留める', tags('TP-004'), async ({ memo }) => {
    await memo.openClassifiedChip('ぱん'); await memo.moveButton(1).click();
    await expect(memo.quadrantChips(2)).toHaveText(['ぱん']);
    await expect(memo.quadrantChips(1)).toHaveCount(1);
    await expect(memo.toast).toContainText('100文字上限');
    await expect(memo.sheet).toBeVisible();
    await memo.reload(); await expect(memo.quadrantChips(2)).toHaveText(['ぱん']);
  });
  test('満杯の象限があっても別の象限へ追加できる', tags('TP-005'), async ({ memo }) => {
    await memo.start(); await memo.add('牛乳');
    await expect(memo.quadrantChips(3)).toHaveText(['牛乳']);
    await expect(memo.remaining(3)).toHaveText('残り97文字');
    await expect(memo.remaining(1)).toHaveText('残り0文字');
    await expect(memo.toast).toBeEmpty({ timeout: 1000 });
  });
});

test('空文字と記号のみの確定ではチップも通知も出ない', tags('TP-007'), async ({ memo }) => {
  await memo.start(); await memo.add(''); await memo.add('★ ！？');
  await expect(memo.chips).toHaveCount(0); await expect(memo.toast).toBeEmpty({ timeout: 1000 });
});
test('51語では先頭50語のうち容量に収まる分を追加し部分登録を通知する', tags('TP-008'), async ({ memo }) => {
  await memo.start(); await memo.add([...Array(50).fill('牛乳'), '猫'].join(' '));
  await expect(memo.quadrantChips(3)).toHaveCount(33);
  await expect(memo.quadrantChips(1)).toHaveCount(0);
  await expect(memo.remaining(3)).toHaveText('残り1文字');
  await expect(memo.toast).toContainText('一部のみ登録しました。');
});

test.describe('上限内のメモ操作', () => {
  test.use({ classificationSeed: 'seed:memos-across-quadrants' });
  test('余裕のある象限へ移動すると元の象限から消える', tags('TP-009'), async ({ memo }) => {
    await memo.openClassifiedChip('apple'); await memo.moveButton(2).click();
    await expect(memo.quadrantChips(1)).toHaveCount(0);
    await expect(memo.quadrantChips(2)).toHaveText(['apple', 'ぱん']);
    await expect(memo.remaining(2)).toHaveText('残り91文字');
    await memo.waitForSave();
    await expect(memo.toast).toBeEmpty({ timeout: 1000 });
    await expect(memo.sheet).toBeHidden();
    await memo.reload();
    await expect(memo.quadrantChips(2)).toHaveText(['apple', 'ぱん']);
  });
  test('上限内の本文へ編集すると表示と残り容量が更新される', tags('TP-010'), async ({ memo }) => {
    await memo.openClassifiedChip('apple'); await memo.edit('りんご');
    await expect(memo.chip('りんご')).toBeVisible();
    await expect(memo.remaining(1)).toHaveText('残り96文字');
    await memo.waitForSave();
    await expect(memo.toast).toBeEmpty({ timeout: 1000 });
    await expect(memo.sheet).toBeHidden();
    await memo.reload(); await expect(memo.chip('りんご')).toBeVisible();
  });
});

for (const [seed, file, description] of [
  ['seed:dict-basic', 'over-limit.json', 'ファイル単体で'],
  ['seed:quadrant-at-limit', 'all-data.json', '既存メモと統合して'],
] as const) {
  test.describe(description, () => {
    test.use({ classificationSeed: seed });
    test(`${description}上限を超えるインポートは全データを変更せず拒否する`, tags('TP-011'), async ({ settingsPage }) => {
      await settingsPage.open();
      const before = dataOnly(await readDownload(await settingsPage.export()));
      await settingsPage.import(fixtureFile(file)); await settingsPage.acceptImport();
      await expect(settingsPage.toast).toContainText('100文字上限');
      expect(dataOnly(await readDownload(await settingsPage.export()))).toEqual(before);
      await settingsPage.reload();
      expect(dataOnly(await readDownload(await settingsPage.export()))).toEqual(before);
    });
  });
}

test.describe('バックアップの復元', () => {
  test.use({ classificationSeed: 'seed:memos-across-quadrants', shareMode: 'env:web-share-stub' });
  test('エクスポート後に全削除してもメモ・辞書・設定を復元できる', tags('TP-012'), async ({ memo, settingsPage, readSharedFiles }) => {
    const beforeTexts = await memo.quadrantTexts();
    await settingsPage.open(); await settingsPage.exportButton.click();
    await expect.poll(async () => (await readSharedFiles())[0]?.text).toBeTruthy();
    const backup = (await readSharedFiles())[0].text!;
    await settingsPage.clear(); await settingsPage.partial.click(); await settingsPage.saved();
    await settingsPage.back(); await expect(memo.chips).toHaveCount(0);
    await settingsPage.open(); await settingsPage.importContents(backup); await settingsPage.acceptImport();
    await expect(settingsPage.toast).toContainText('全データをインポートしました');
    await settingsPage.reload(); await settingsPage.exportButton.click();
    await expect.poll(async () => (await readSharedFiles())[0]?.text).toBeTruthy();
    expect(dataOnly(JSON.parse((await readSharedFiles())[0].text!))).toEqual(dataOnly(JSON.parse(backup)));
    await settingsPage.back(); await expect(memo.board).toBeVisible(); expect(await memo.quadrantTexts()).toEqual(beforeTexts);
  });
});
