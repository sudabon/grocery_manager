import { test, expect, fixtureFile, readDownload } from './fixtures/dictionaries';
const tags = (id: string) => ({ tag: ['@add-quadmemo-dictionaries', `@${id}`] });

test('語を追加して保存すると次のコミットから分類される', tags('TP-002'), async ({ dictionaries, memo }) => {
  await dictionaries.open(); await dictionaries.entries.fill('orange'); await dictionaries.save(); await dictionaries.back();
  await memo.start(); await memo.add('orange'); await expect(memo.quadrantChips(1)).toHaveText(['orange']);
});
test('未保存の語は分類に影響しない', tags('TP-003'), async ({ dictionaries, memo }) => {
  await dictionaries.open(); await dictionaries.entries.fill('orange'); await dictionaries.back();
  await memo.start(); await memo.add('orange'); await expect(memo.quadrantChips(4)).toHaveText(['orange']);
});
test('登録済みの語を削除して保存すると分類されなくなる', tags('TP-004'), async ({ dictionaries, memo }) => {
  await dictionaries.open(); await dictionaries.entries.fill(''); await dictionaries.save(); await dictionaries.back();
  await memo.start(); await memo.add('apple'); await expect(memo.quadrantChips(4)).toHaveText(['apple']);
});
test('空行と前後空白を含むリストの保存結果は整形される', tags('TP-005'), async ({ dictionaries }) => {
  await dictionaries.open(); await dictionaries.entries.fill(' \n orange \n\n apple \n'); await dictionaries.save(); await dictionaries.reload();
  await expect(dictionaries.entries).toHaveValue('orange\napple');
});
test('正規化同一の表記は先着の1件に統合される', tags('TP-006'), async ({ dictionaries }) => {
  await dictionaries.open(); await dictionaries.entries.fill('パン\nぱん\nﾊﾟﾝ'); await dictionaries.save(); await dictionaries.reload();
  await expect(dictionaries.entries).toHaveValue('パン');
});
test.describe('既存メモを持つ状態', () => {
  test.use({ classificationSeed: 'seed:memos-across-quadrants' });
  test('辞書を変更しても既存チップは動かず新規だけ新象限へ入る', tags('TP-007'), async ({ dictionaries, memo }) => {
    await dictionaries.open(); await dictionaries.tab(1).click(); await dictionaries.entries.fill(''); await dictionaries.save();
    await dictionaries.tab(2).click(); await dictionaries.entries.fill('ぱん\napple'); await dictionaries.save(); await dictionaries.back();
    await expect(memo.quadrantChips(1)).toHaveText(['apple']); await memo.start(); await memo.add('apple');
    await expect(memo.quadrantChips(1)).toHaveText(['apple']); await expect(memo.quadrantChips(2)).toHaveText(['ぱん', 'apple']);
    await memo.waitForSave(); await memo.reload(); await expect(memo.quadrantChips(1)).toHaveText(['apple']);
  });
  test('2段階の確認で全削除し再読込してもラベルと設定を保持する', tags('TP-017'), async ({ settingsPage, dictionaries, memo }) => {
    await dictionaries.open(); await dictionaries.entries.fill('orange'); await dictionaries.save();
    await settingsPage.open(); await settingsPage.partial.check(); await settingsPage.saved();
    await settingsPage.clear(); await settingsPage.reload(); await expect(settingsPage.partial).toBeChecked();
    await settingsPage.back(); await expect(memo.chips).toHaveCount(0); await expect(memo.quadrant(1)).toHaveAccessibleName(/^Q1 それ以外/);
    await dictionaries.open(); await expect(dictionaries.entries).toHaveValue('orange');
  });
  test('全削除の1段階目と2段階目の中止ではメモが残る', tags('TP-018'), async ({ settingsPage, memo }) => {
    await settingsPage.open(); await settingsPage.deleteButton.click(); await settingsPage.cancel.click();
    await settingsPage.back(); await expect(memo.chips).toHaveCount(3);
    await settingsPage.open(); await settingsPage.deleteButton.click(); await settingsPage.next.click(); await settingsPage.cancel.click();
    await settingsPage.back(); await memo.reload(); await expect(memo.chips).toHaveCount(3);
  });
  test('全データを出力して全削除後にインポートすると復元できる', tags('TP-024'), async ({ settingsPage, dictionaries, memo }) => {
    await dictionaries.open(); await dictionaries.entries.fill('orange'); await dictionaries.save();
    await settingsPage.open(); await settingsPage.partial.check(); await settingsPage.saved(); await settingsPage.setWait(700);
    const download = await settingsPage.export(); const before = await readDownload(download); const path = (await download.path())!;
    expect(before).toMatchObject({ app: 'quadmemo', schemaVersion: 2, exportedAt: expect.any(String) });
    await settingsPage.clear(); await settingsPage.partial.uncheck(); await settingsPage.saved();
    await dictionaries.open(); await dictionaries.entries.fill('changed'); await dictionaries.save();
    await settingsPage.open(); await settingsPage.import(path); await settingsPage.acceptImport(); await settingsPage.reload();
    expect(await readDownload(await settingsPage.export())).toEqual({ ...before, exportedAt: expect.any(String) });
    await settingsPage.back(); await expect(memo.chips).toHaveCount(3); await expect(memo.quadrant(1)).toHaveAccessibleName(/^Q1 それ以外/);
  });
  test('版数不一致の全データを拒否して全ストアを保持する', tags('TP-025'), async ({ settingsPage }) => {
    await settingsPage.open(); const before = await readDownload(await settingsPage.export());
    await settingsPage.import(fixtureFile('unsupported.json')); await expect(settingsPage.toast).toContainText('インポートできませんでした');
    await settingsPage.reload(); expect(await readDownload(await settingsPage.export())).toEqual({ ...before, exportedAt: expect.any(String) });
  });
  test('インポートでID衝突をスキップして新規メモだけ追加する', tags('TP-026'), async ({ settingsPage, memo }) => {
    await settingsPage.open(); await settingsPage.import(fixtureFile('collision.json')); await settingsPage.acceptImport(); await settingsPage.back();
    await memo.reload(); await expect(memo.chips).toHaveCount(4); await expect(memo.classifiedChip('上書き禁止')).toHaveCount(0);
    // 衝突メモはファイル側で q3・本文「上書き禁止」。既存 apple が一部でも上書きされれば象限の中身が変わる。
    await expect(memo.quadrantChips(1)).toHaveText(['apple', 'orange']);
    await expect(memo.quadrantChips(3)).toHaveText(['牛乳']);
  });
  test('上書き確認を中止するとメモ辞書設定はすべて無変更', tags('TP-027'), async ({ settingsPage }) => {
    await settingsPage.open(); const before = await readDownload(await settingsPage.export());
    await settingsPage.import(fixtureFile('all-data.json')); await settingsPage.cancel.click(); await settingsPage.reload();
    expect(await readDownload(await settingsPage.export())).toEqual({ ...before, exportedAt: expect.any(String) });
  });
});
test('辞書編集で語全体の登録と重複除去のヘルプを読める', tags('TP-008'), async ({ dictionaries }) => {
  await dictionaries.open(); await expect(dictionaries.help).toContainText('語全体を登録'); await expect(dictionaries.help).toContainText('1 件に統合');
  await expect(dictionaries.help).toContainText('空白や句読点を挟んだ語は結合されません');
});
test.describe('空の辞書', () => {
  test.use({ classificationSeed: 'seed:dict-all-empty' });
  test('辞書全空のメモ画面から辞書編集へ移動できる', tags('TP-009'), async ({ dictionaries }) => {
    await expect(dictionaries.prompt).toBeVisible(); await dictionaries.prompt.click(); await expect(dictionaries.entries).toBeVisible();
  });
  test('1語保存すると辞書設定の導線が消える', tags('TP-010'), async ({ dictionaries }) => {
    await dictionaries.prompt.click(); await dictionaries.entries.fill('orange'); await dictionaries.save(); await dictionaries.back(); await expect(dictionaries.prompt).toHaveCount(0);
  });
});
test('部分一致ONが分類へ反映される', tags('TP-011'), async ({ settingsPage, memo }) => {
  await settingsPage.open(); await settingsPage.partial.check(); await settingsPage.saved(); await settingsPage.back();
  await memo.start(); await memo.add('apples'); await expect(memo.quadrantChips(1)).toHaveText(['apples']);
});
test('待機時間を500msへ変更するとその時間で自動コミットする', tags('TP-012'), async ({ settingsPage, memo, page }) => {
  // 注入する時刻は `env:fixed-clock` と同じ JST 2026-09-09 にする。別の日付にすると
  // 表示中のボードが当日でなくなり、コミットが拒否される（daily-boards design - D4）。
  await settingsPage.open(); await settingsPage.setWait(500); await settingsPage.back(); await page.clock.install({ time: new Date('2026-09-09T03:00:00Z') }); await page.clock.pauseAt(new Date('2026-09-09T03:00:01Z'));
  await memo.start(); await memo.input.fill('apple'); await page.clock.runFor(499); await expect(memo.chips).toHaveCount(0);
  await page.clock.runFor(1); await expect(memo.quadrantChips(1)).toHaveText(['apple']);
});
test('待機時間は上下限へ収まりドラッグ中は保存されない', tags('TP-013'), async ({ settingsPage }) => {
  await settingsPage.open(); await settingsPage.setWait(900, false); await settingsPage.reload(); await expect(settingsPage.range).toHaveValue('1500');
  await settingsPage.setWait(-100); await expect(settingsPage.range).toHaveValue('500'); await settingsPage.reload(); await expect(settingsPage.range).toHaveValue('500');
  await settingsPage.setWait(9000); await settingsPage.reload(); await expect(settingsPage.range).toHaveValue('5000');
});
test('重複許可OFFで同じ語を2回コミットしても1件になる', tags('TP-014'), async ({ settingsPage, memo }) => {
  await settingsPage.open(); await settingsPage.duplicates.uncheck(); await settingsPage.saved(); await settingsPage.back();
  await memo.start(); await memo.add('apple'); await memo.add('apple'); await expect(memo.chips).toHaveCount(1);
});
test('ヒント表示OFFで入力バーを開いてもヒントが出ない', tags('TP-015'), async ({ settingsPage, memo }) => {
  await settingsPage.open(); await settingsPage.hint.uncheck(); await settingsPage.saved(); await settingsPage.back();
  await memo.start(); await expect(settingsPage.dictationHint).toHaveCount(0);
});
test('4設定は再読み込み後も保持され動作に反映される', tags('TP-016'), async ({ settingsPage, memo }) => {
  await settingsPage.open(); await settingsPage.partial.check(); await settingsPage.saved(); await settingsPage.duplicates.uncheck(); await settingsPage.saved();
  await settingsPage.hint.uncheck(); await settingsPage.saved(); await settingsPage.setWait(2300); await settingsPage.reload();
  await expect(settingsPage.partial).toBeChecked(); await expect(settingsPage.duplicates).not.toBeChecked(); await expect(settingsPage.hint).not.toBeChecked(); await expect(settingsPage.range).toHaveValue('2300');
  await settingsPage.back(); await memo.start(); await memo.add('apples'); await memo.add('apples'); await expect(memo.quadrantChips(1)).toHaveCount(1);
});
test('アプリ情報でバージョンと永続化結果を読める', tags('TP-019'), async ({ settingsPage }) => {
  await settingsPage.open(); await expect(settingsPage.info).toContainText(/バージョン \d+\.\d+\.\d+/);
  await expect(settingsPage.info).toContainText(/ストレージ永続化：(許可されています|許可されていません|この環境は非対応です)/);
});
test('プライバシー方針と定期バックアップ推奨を読める', tags('TP-020'), async ({ settingsPage }) => {
  await settingsPage.open(); await expect(settingsPage.info).toContainText('外部へのネットワーク送信は行いません');
  await expect(settingsPage.backup).toContainText('定期的なバックアップ');
});
test('辞書出力は版数と4象限の単語を含みラベルを含まない', tags('TP-021'), async ({ dictionaries }) => {
  await dictionaries.open(); const result = await readDownload(await dictionaries.export());
  expect(result.version).toBe(1); expect(result.dictionaries.map((d: { quadrant: string }) => d.quadrant)).toEqual(['q1','q2','q3','q4']);
  expect(result.dictionaries[0]).toMatchObject({ entries: ['apple', '会議', '猫'] });
  for (const dict of result.dictionaries) expect(dict).not.toHaveProperty('label');
});
test('壊れた辞書JSONを拒否して既存内容を保持する', tags('TP-022'), async ({ dictionaries }) => {
  await dictionaries.open(); const before = await readDownload(await dictionaries.export());
  await dictionaries.import(fixtureFile('broken.json')); await expect(dictionaries.toast).toContainText('インポートできませんでした');
  await dictionaries.reload(); expect(await readDownload(await dictionaries.export())).toEqual(before);
});
test('正しい辞書をインポートすると4象限が置き換わり分類に効く', tags('TP-023'), async ({ dictionaries, memo }) => {
  await dictionaries.open(); await dictionaries.import(fixtureFile('dictionaries.json')); await expect(dictionaries.toast).toContainText('辞書をインポートしました');
  for (const [index, text] of ['orange', 'ぱん', '牛乳', ''].entries()) { await dictionaries.tab(index + 1).click(); await expect(dictionaries.entries).toHaveValue(text); }
  await dictionaries.back(); await memo.start(); await memo.add('orange'); await expect(memo.quadrantChips(1)).toHaveText(['orange']);
});
test('共有非対応では日付付きJSONをダウンロードできる', tags('TP-028'), async ({ settingsPage }) => {
  await settingsPage.open(); const download = await settingsPage.export(); expect(download.suggestedFilename()).toMatch(/^quadmemo-export-\d{4}-\d{2}-\d{2}\.json$/);
  expect((await readDownload(download)).schemaVersion).toBe(2);
});
test.describe('共有対応', () => {
  test.use({ shareMode: 'env:web-share-stub' });
  test('共有対応ならエクスポートファイルを共有へ渡す', tags('TP-029'), async ({ dictionaries, settingsPage, readSharedFiles }) => {
    await dictionaries.open(); await dictionaries.exportButton.click(); await expect.poll(readSharedFiles).toHaveLength(1);
    let [file] = await readSharedFiles(); expect(file.name).toMatch(/^quadmemo-dictionaries-.*\.json$/); expect(file.type).toBe('application/json'); expect(JSON.parse(file.text!).version).toBe(1);
    await settingsPage.open(); await settingsPage.exportButton.click(); await expect.poll(async () => (await readSharedFiles())[0]?.name).toMatch(/^quadmemo-export-/);
    [file] = await readSharedFiles(); expect(file.type).toBe('application/json'); expect(JSON.parse(file.text!).schemaVersion).toBe(2);
  });
});
test('保存ボタンを連打してもエントリは重複しない', tags('TP-030'), async ({ dictionaries }) => {
  await dictionaries.open(); await dictionaries.entries.fill('orange\norange'); await dictionaries.repeatSave(); await dictionaries.reload(); await expect(dictionaries.entries).toHaveValue('orange');
});
