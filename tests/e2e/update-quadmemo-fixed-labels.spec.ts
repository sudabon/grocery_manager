import { test, expect, fixtureFile, readDownload } from './fixtures/dictionaries';

const tags = (id: string) => ({ tag: ['@update-quadmemo-fixed-labels', `@${id}`] });
const labels = ['それ以外', '野菜', '肉類・乳製品', 'ドラッグストア'];

test('メモ画面を開くと4象限が等分割され売り場区分が読み取れる', tags('TP-001'), async ({ memo }) => {
  await memo.expectEqualQuadrants();
  for (const [index, label] of labels.entries()) {
    await expect(memo.quadrant(index + 1)).toHaveAccessibleName(`Q${index + 1} ${label}`);
    await expect(memo.quadrant(index + 1).getByRole('heading')).toContainText(label);
  }
});

test.describe('旧ラベルが保存された端末', () => {
  test.use({ classificationSeed: 'seed:dict-custom-labels' });
  test('過去の保存ラベルに関係なく固定値を表示し移動先も固定値になる', tags('TP-002'), async ({ memo }) => {
    for (const [index, label] of labels.entries()) {
      await expect(memo.quadrant(index + 1)).toHaveAccessibleName(`Q${index + 1} ${label}`);
    }
    await expect(memo.board).not.toContainText(/企画|暮らし|食品|保留/);
    await memo.start(); await memo.add('apple'); await memo.openClassifiedChip('apple');
    for (const [index, label] of labels.entries()) await expect(memo.moveButton(index + 1)).toHaveText(`Q${index + 1} ${label}へ移動`);
    await expect(memo.sheet).not.toContainText(/企画|暮らし|食品|保留/);
  });
  test('旧ラベルを含む辞書JSONを取り込んでも固定値のまま単語だけ復元する', tags('TP-008'), async ({ dictionaries, memo }) => {
    await dictionaries.open();
    await dictionaries.import(fixtureFile('dictionaries.json'));
    await expect(dictionaries.toast).toContainText('辞書をインポートしました');
    await dictionaries.reload();
    for (const [index, text] of ['orange', 'ぱん', '牛乳', ''].entries()) {
      await dictionaries.tab(index + 1).click();
      await expect(dictionaries.entries).toHaveValue(text);
      await expect(dictionaries.tab(index + 1)).toHaveText(`Q${index + 1} ${labels[index]}`);
    }
    await dictionaries.back();
    for (const [index, label] of labels.entries()) await expect(memo.quadrant(index + 1)).toHaveAccessibleName(`Q${index + 1} ${label}`);
    await expect(memo.board).not.toContainText(/企画|暮らし|食品|保留/);
  });
});

test('辞書編集では全象限で単語リストだけを編集できる', tags('TP-003'), async ({ dictionaries }) => {
  await dictionaries.open();
  for (const [index, label] of labels.entries()) {
    await dictionaries.tab(index + 1).click();
    await expect(dictionaries.tab(index + 1)).toHaveText(`Q${index + 1} ${label}`);
    await expect(dictionaries.entries).toBeEditable();
    await expect(dictionaries.textboxes).toHaveCount(1);
    await expect(dictionaries.label).toHaveCount(0);
  }
});
test('単語を追加して保存すると次のコミットからその象限へ分類される', tags('TP-004'), async ({ dictionaries, memo }) => {
  await dictionaries.open(); await dictionaries.entries.fill('apple\n会議\n猫\norange');
  await expect(dictionaries.dirty).toBeVisible(); await dictionaries.save(); await dictionaries.back();
  await memo.start(); await memo.add('orange'); await expect(memo.quadrantChips(1)).toHaveText(['orange']);
});
test('保存せずに戻ると入力した単語は未分類としてQ4に入る', tags('TP-005'), async ({ dictionaries, memo }) => {
  await dictionaries.open(); await dictionaries.entries.fill('orange'); await dictionaries.back();
  await memo.start(); await memo.add('orange'); await expect(memo.quadrantChips(4)).toHaveText(['orange']);
  await expect(memo.chip('orange')).toBeVisible();
});
test('単語を削除して保存するとその単語は未分類としてQ4に入る', tags('TP-006'), async ({ dictionaries, memo }) => {
  await dictionaries.open(); await dictionaries.entries.fill('会議\n猫'); await dictionaries.save(); await dictionaries.back();
  await memo.start(); await memo.add('apple'); await expect(memo.quadrantChips(4)).toHaveText(['apple']);
  await expect(memo.chip('apple')).toBeVisible();
});
test.describe('JSON共有', () => {
  test.use({ shareMode: 'env:web-share-stub' });
  test('辞書を出力すると版数と4象限の単語リストを含みラベルを含まないJSONが受け取れる', tags('TP-007'), async ({ dictionaries, readSharedFiles }) => {
    await dictionaries.open(); await dictionaries.exportButton.click(); await expect.poll(readSharedFiles).toHaveLength(1);
    const [file] = await readSharedFiles();
    expect(file.type).toBe('application/json');
    expect(file.name).toMatch(/^quadmemo-dictionaries-\d{4}-\d{2}-\d{2}\.json$/);
    const value = JSON.parse(file.text!);
    expect(value.version).toBe(1);
    expect(value.dictionaries).toEqual([
      { quadrant: 'q1', entries: ['apple', '会議', '猫'], updatedAt: 1 },
      { quadrant: 'q2', entries: ['ぱん'], updatedAt: 1 },
      { quadrant: 'q3', entries: ['牛乳'], updatedAt: 1 },
      { quadrant: 'q4', entries: [], updatedAt: 1 },
    ]);
    for (const dict of value.dictionaries) expect(dict).not.toHaveProperty('label');
  });
});
test('壊れたJSONを取り込むとエラーが出て既存辞書は変わらない', tags('TP-009'), async ({ dictionaries }) => {
  await dictionaries.open(); const before = await readDownload(await dictionaries.export());
  await dictionaries.import(fixtureFile('broken.json')); await expect(dictionaries.toast).toContainText('インポートできませんでした');
  await dictionaries.reload(); expect(await readDownload(await dictionaries.export())).toEqual(before);
});
test('正しいJSONを取り込むと4象限の単語を置き換えて分類に反映する', tags('TP-010'), async ({ dictionaries, memo }) => {
  await dictionaries.open();
  // 全象限で異なる保存値を作り、たまたま初期値と同じために通るのを防ぐ。
  for (let q = 1; q <= 4; q++) {
    await dictionaries.tab(q).click(); await dictionaries.entries.fill('before'); await dictionaries.save();
  }
  // 保存通知のキューを初期化し、インポートの通知だけを観測する。
  await dictionaries.reload();
  await dictionaries.import(fixtureFile('dictionaries.json')); await expect(dictionaries.toast).toContainText('辞書をインポートしました');
  for (const [index, text] of ['orange', 'ぱん', '牛乳', ''].entries()) {
    await dictionaries.tab(index + 1).click(); await expect(dictionaries.entries).toHaveValue(text);
  }
  // 「ぱん」は単語分割で二分されるため、同じ辞書語へ正規化される「パン」を入力する。
  await dictionaries.back(); await memo.start(); await memo.add('orange パン 牛乳 before');
  for (const [index, text] of ['orange', 'パン', '牛乳', 'before'].entries()) await expect(memo.quadrantChips(index + 1)).toHaveText([text]);
  await expect(memo.chip('before')).toBeVisible();
});
test('チップがあふれるとその象限だけをスクロールし全体の位置を保つ', tags('TP-011'), async ({ memo }) => {
  await memo.start();
  await memo.add(Array(50).fill('卵').join(' '));
  await expect(memo.quadrantChips(4)).toHaveCount(50);
  await memo.closeInput.click(); await memo.expectIndependentScroll();
});
