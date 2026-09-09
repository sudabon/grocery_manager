import { test, expect, fixtureFile, readDownload } from './fixtures/daily-boards';

const tags = (id: string) => ({ tag: ['@add-quadmemo-daily-boards', `@${id}`] });
// 固定時刻は JST 2026-09-09 12:00（`env:fixed-clock`）。日付は画面に出る表記で確かめる。
const TODAY = '2026年9月9日';
const NEXT_DAY = '2026年9月10日';
const YESTERDAY = '2026年9月8日';
const OLDER = '2026年9月6日';
const EXPORT_NAME = 'quadmemo-export-2026-09-09.json';
const dataOnly = ({ memos, dictionaries, settings }: Record<string, unknown>) => ({ memos, dictionaries, settings });

test.describe('日付が変わる', () => {
  test.use({ clockMode: 'env:clock-advanced', classificationSeed: 'seed:boards-across-days' });

  test('日付が変わったあとに開くと白紙のボードと当日の年月日が表示される', tags('TP-001'), async ({ memo, clock }) => {
    await expect(memo.boardHeading(TODAY)).toBeVisible();
    await expect(memo.quadrantChips(1)).toHaveText(['apple']);
    await clock.advanceToNextDay();
    await memo.reload();
    await expect(memo.boardHeading(NEXT_DAY)).toBeVisible();
    await expect(memo.todayBadge).toBeVisible();
    await expect(memo.chips).toHaveCount(0);
    // 前日のチップは残っているが、当日のボードには現れない。
    await expect(memo.classifiedChip('apple')).toHaveCount(0);
  });
  test('表示したまま日付を進めてもボードとチップが変わらない', tags('TP-003'), async ({ memo, clock }) => {
    const before = await memo.quadrantTexts();
    await clock.advanceToNextDay();
    // 日付を進めただけでは再描画されないため、入力バーを開いて再描画させたうえで確認する。
    await memo.start();
    await expect(memo.boardHeading(TODAY)).toBeVisible();
    await expect(memo.todayBadge).toBeVisible();
    expect(await memo.quadrantTexts()).toEqual(before);
  });
});

test('コミットしたチップが当日のボードに属し、日付の一覧に当日が現れる', tags('TP-002'), async ({ memo, history }) => {
  await memo.start();
  await memo.add('apple');
  await expect(memo.quadrantChips(1)).toHaveText(['apple']);
  await memo.waitForSave();
  await history.open();
  await expect(history.dates).toHaveText([TODAY]);
  await history.openBoard(TODAY);
  await expect(memo.boardHeading(TODAY)).toBeVisible();
  await expect(memo.todayBadge).toBeVisible();
  await expect(memo.quadrantChips(1)).toHaveText(['apple']);
});

test.describe('複数の日付にチップがある', () => {
  test.use({ classificationSeed: 'seed:boards-across-days' });

  test('日付の一覧がチップのある日付だけを新しい順に並べる', tags('TP-004'), async ({ history }) => {
    await history.open();
    await expect(history.dates).toHaveText([TODAY, YESTERDAY, OLDER]);
    // チップが無い 2026-09-07 は現れない。
    await expect(history.board('2026年9月7日')).toHaveCount(0);
    await expect(history.noPastBoards).toHaveCount(0);
  });
  test('一覧から過去のボードを開くとその日付のチップと日付が表示され、当日でないことが区別できる', tags('TP-005'), async ({ memo, history }) => {
    await history.open();
    await history.openBoard(YESTERDAY);
    await expect(memo.boardHeading(YESTERDAY)).toBeVisible();
    await expect(memo.pastBadge).toBeVisible();
    await expect(memo.todayBadge).toHaveCount(0);
    await memo.expectQuadrantTexts([[], ['ぱん'], ['卵'], []]);
  });
  test('過去のボードでは入力してコミットする手段が提供されない', tags('TP-007'), async ({ memo, history }) => {
    await history.open();
    await history.openBoard(YESTERDAY);
    await expect(memo.pastBadge).toBeVisible();
    await expect(memo.mic).toHaveCount(0);
    await expect(memo.input).toHaveCount(0);
    await expect(memo.confirm).toHaveCount(0);
  });
  test('過去のボードでチップを選んでもアクションシートが開かない', tags('TP-008'), async ({ memo, history }) => {
    await history.open();
    await history.openBoard(YESTERDAY);
    const chip = memo.classifiedChip('ぱん');
    await expect(chip).toBeDisabled();
    // 押せない状態なので actionability を外して押し、それでもシートが開かないことを見る。
    await chip.click({ force: true });
    await expect(memo.sheet).toHaveCount(0);
    await memo.expectQuadrantTexts([[], ['ぱん'], ['卵'], []]);
  });
  test('一覧へ遷移し過去のボードを開いたあとメモ画面へ戻ると当日のボードになる', tags('TP-009'), async ({ memo, history }) => {
    await history.open();
    await history.back();
    await expect(memo.boardHeading(TODAY)).toBeVisible();
    await history.open();
    await history.openBoard(YESTERDAY);
    await expect(memo.boardHeading(YESTERDAY)).toBeVisible();
    await memo.backToToday.click();
    await expect(memo.boardHeading(TODAY)).toBeVisible();
    await expect(memo.todayBadge).toBeVisible();
    await expect(memo.quadrantChips(1)).toHaveText(['apple']);
  });
  test('再読み込み後も過去の日付のチップが復元され、他の日付が混ざらない', tags('TP-013'), async ({ memo, history }) => {
    await memo.reload();
    await history.open();
    await history.openBoard(YESTERDAY);
    await memo.expectQuadrantTexts([[], ['ぱん'], ['卵'], []]);
    await expect(memo.classifiedChip('apple')).toHaveCount(0);
    await expect(memo.classifiedChip('牛乳')).toHaveCount(0);
    await history.open();
    await history.openBoard(OLDER);
    await memo.expectQuadrantTexts([[], [], ['牛乳'], []]);
  });
});

test.describe('当日のみチップがある', () => {
  test.use({ classificationSeed: 'seed:memos-across-quadrants' });

  test('過去のボードが無い状態で一覧を開くとその旨が表示される', tags('TP-006'), async ({ history }) => {
    await history.open();
    await expect(history.dates).toHaveText([TODAY]);
    await expect(history.noPastBoards).toBeVisible();
  });
  test('当日のチップの移動・編集・削除が再読み込み後も維持される', tags('TP-012'), async ({ memo }) => {
    await memo.openClassifiedChip('apple');
    await memo.moveButton(4).click();
    await memo.openClassifiedChip('ぱん');
    await memo.edit('パン');
    await memo.openClassifiedChip('牛乳');
    await memo.remove();
    await memo.waitForSave();
    await memo.reload();
    await expect(memo.boardHeading(TODAY)).toBeVisible();
    await memo.expectQuadrantTexts([[], ['パン'], [], ['apple']]);
  });
  test('対応しない版数のインポートが拒否され既存データが変わらない', tags('TP-017'), async ({ memo, settingsPage }) => {
    await settingsPage.open();
    const before = dataOnly(await readDownload(await settingsPage.export()));
    await settingsPage.import(fixtureFile('unsupported.json'));
    await expect(settingsPage.toast).toContainText('インポートできませんでした');
    await settingsPage.reload();
    expect(dataOnly(await readDownload(await settingsPage.export()))).toEqual(before);
    await settingsPage.back();
    await memo.expectQuadrantTexts([['apple'], ['ぱん'], ['牛乳'], []]);
  });
  test('共有非対応環境で JST 日付を含むファイル名でダウンロードできる', tags('TP-019'), async ({ settingsPage }) => {
    await settingsPage.open();
    const download = await settingsPage.export();
    expect(download.suggestedFilename()).toBe(EXPORT_NAME);
    expect((await readDownload(download)).schemaVersion).toBe(2);
  });
});

test.describe('端末のタイムゾーンが JST 以外', () => {
  // 固定時刻 2026-09-09T03:00Z は現地では 2026-09-08 20:00。端末設定に従うと日付がずれる。
  test.use({ timezoneId: 'America/Los_Angeles', classificationSeed: 'seed:memos-across-quadrants' });

  test('端末のタイムゾーンを JST 以外にしても表示される日付が JST の日付である', tags('TP-010'), async ({ memo, history }) => {
    expect(await memo.page.evaluate(() => new Date().getDate())).toBe(8);
    await expect(memo.boardHeading(TODAY)).toBeVisible();
    await expect(memo.todayBadge).toBeVisible();
    await history.open();
    await expect(history.dates).toHaveText([TODAY]);
  });
});

test('当日のチップが再読み込み後も同じ象限・同じ順序・同じ日付で復元される', tags('TP-011'), async ({ memo }) => {
  await memo.start();
  for (const text of ['apple', '会議', '猫']) await memo.add(text);
  await expect(memo.quadrantChips(1)).toHaveText(['apple', '会議', '猫']);
  await memo.waitForSave();
  await memo.reload();
  await expect(memo.boardHeading(TODAY)).toBeVisible();
  await expect(memo.todayBadge).toBeVisible();
  await expect(memo.quadrantChips(1)).toHaveText(['apple', '会議', '猫']);
});

test.describe('日付を持たない既存メモ', () => {
  test.use({ classificationSeed: 'seed:legacy-memos-without-date' });

  test('日付を持たない既存メモが作成日の JST 日付のボードへ振り分けられ件数が一致する', tags('TP-014'), async ({ memo, history }) => {
    // JST 0:30 に作られたメモは当日のボードへ入る（UTC 日付で振り分けると前日になる）。
    await expect(memo.quadrantChips(1)).toHaveText(['apple']);
    await expect(memo.chips).toHaveCount(1);
    await history.open();
    await expect(history.dates).toHaveText([TODAY, YESTERDAY, OLDER]);
    await history.openBoard(YESTERDAY);
    await expect(memo.quadrantChips(2)).toHaveText(['ぱん']);
    await expect(memo.chips).toHaveCount(1);
    await history.open();
    await history.openBoard(OLDER);
    await expect(memo.quadrantChips(3)).toHaveText(['牛乳']);
    await expect(memo.chips).toHaveCount(1);
  });
});

test.describe('共有が使える環境', () => {
  test.use({ shareMode: 'env:web-share-stub' });

  test('エクスポートの共有が JST 日付を含むファイル名で呼び出される', tags('TP-018'), async ({ settingsPage, readSharedFiles }) => {
    await settingsPage.open();
    await settingsPage.exportButton.click();
    await expect.poll(readSharedFiles).toHaveLength(1);
    const [shared] = await readSharedFiles();
    expect(shared.name).toBe(EXPORT_NAME);
    expect(shared.type).toBe('application/json');
    expect(JSON.parse(shared.text!).schemaVersion).toBe(2);
  });
  test('当日のボードの画像共有が当日の日付を含むファイル名で呼び出される', tags('TP-020'), async ({ memo, readSharedFiles }) => {
    await memo.shareImage();
    await expect.poll(readSharedFiles).toHaveLength(1);
    const [shared] = await readSharedFiles();
    expect(shared.name).toBe('quadmemo-board-2026-09-09.png');
    expect(shared.type).toBe('image/png');
    expect(shared.size).toBeGreaterThan(0);
  });

  test.describe('メモ 0 件', () => {
    test.use({ classificationSeed: 'seed:dict-all-empty' });
    test('メモ 0 件の当日ボードでも画像共有がエラーにならない', tags('TP-022'), async ({ memo, readSharedFiles }) => {
      await expect(memo.chips).toHaveCount(0);
      await memo.shareImage();
      await expect.poll(readSharedFiles).toHaveLength(1);
      const [shared] = await readSharedFiles();
      expect(shared.name).toBe('quadmemo-board-2026-09-09.png');
      expect(shared.size).toBeGreaterThan(0);
      // t=0 で出ているトーストを 4000ms の自動消滅で見逃さないよう、短い timeout で見る。
      await expect(memo.toast).toBeEmpty({ timeout: 1000 });
    });
  });

  test.describe('複数の日付にチップがある', () => {
    test.use({ classificationSeed: 'seed:boards-across-days' });

    test('過去のボードの画像共有がその日付のファイル名になり、チップが変わらない', tags('TP-021'), async ({ memo, history, readSharedFiles }) => {
      await history.open();
      await history.openBoard(YESTERDAY);
      await memo.expectQuadrantTexts([[], ['ぱん'], ['卵'], []]);
      const before = await memo.quadrantTexts();
      await memo.shareImage();
      await expect.poll(readSharedFiles).toHaveLength(1);
      const [shared] = await readSharedFiles();
      expect(shared.name).toBe('quadmemo-board-2026-09-08.png');
      expect(shared.type).toBe('image/png');
      expect(shared.size).toBeGreaterThan(0);
      expect(await memo.quadrantTexts()).toEqual(before);
      // 再読み込みしても過去のボードのチップは 1 件も変わっていない（共有は読み取りだけ）。
      await memo.reload();
      await expect(memo.boardHeading(YESTERDAY)).toBeVisible();
      await memo.expectQuadrantTexts([[], ['ぱん'], ['卵'], []]);
      // 当日のボードへ戻ると当日のチップだけになる。
      await memo.backToToday.click();
      await memo.expectQuadrantTexts([['apple'], [], [], []]);
    });
    test('全データのエクスポートと復元で各メモが元の日付のボードに戻る', tags('TP-015'), async ({ memo, settingsPage, history, readSharedFiles }) => {
      await settingsPage.open();
      await settingsPage.exportButton.click();
      await expect.poll(async () => (await readSharedFiles())[0]?.text).toBeTruthy();
      const backup = (await readSharedFiles())[0].text!;
      const exported = JSON.parse(backup);
      expect(exported.schemaVersion).toBe(2);
      // 各メモが所属する日付を含む（spec: 出力に各メモの日付を含める）。
      expect(exported.memos.map((entry: { boardDate: string }) => entry.boardDate).sort())
        .toEqual(['2026-09-06', '2026-09-08', '2026-09-08', '2026-09-09']);
      await settingsPage.clear();
      await settingsPage.back();
      await expect(memo.chips).toHaveCount(0);
      await settingsPage.open();
      await settingsPage.importContents(backup);
      await settingsPage.acceptImport();
      await expect(settingsPage.toast).toContainText('全データをインポートしました');
      await settingsPage.back();
      await expect(memo.quadrantChips(1)).toHaveText(['apple']);
      await history.open();
      await expect(history.dates).toHaveText([TODAY, YESTERDAY, OLDER]);
      await history.openBoard(YESTERDAY);
      await memo.expectQuadrantTexts([[], ['ぱん'], ['卵'], []]);
      await history.open();
      await history.openBoard(OLDER);
      await memo.expectQuadrantTexts([[], [], ['牛乳'], []]);
    });
  });
});

test('schemaVersion 1 の JSON をインポートすると各メモが作成日の JST 日付へ振り分けられる', tags('TP-016'), async ({ memo, settingsPage, history }) => {
  await settingsPage.open();
  await settingsPage.import(fixtureFile('legacy-v1.json'));
  await settingsPage.acceptImport();
  await expect(settingsPage.toast).toContainText('全データをインポートしました');
  await settingsPage.back();
  // JST 0:30 のメモは当日のボードへ入る。
  await expect(memo.boardHeading(TODAY)).toBeVisible();
  await expect(memo.quadrantChips(1)).toHaveText(['orange']);
  await expect(memo.chips).toHaveCount(1);
  await history.open();
  await expect(history.dates).toHaveText([TODAY, YESTERDAY, OLDER]);
  await history.openBoard(YESTERDAY);
  await expect(memo.quadrantChips(2)).toHaveText(['ぱん']);
  await expect(memo.chips).toHaveCount(1);
  await history.open();
  await history.openBoard(OLDER);
  await expect(memo.quadrantChips(3)).toHaveText(['牛乳']);
  await expect(memo.chips).toHaveCount(1);
});

test('ヘッダーから辞書編集・設定へ遷移して戻れる', tags('TP-023'), async ({ memo, appShell, dictionaries, settingsPage }) => {
  await dictionaries.open();
  await appShell.expectSecondary('辞書編集');
  await dictionaries.back();
  await expect(memo.boardHeading(TODAY)).toBeVisible();
  await settingsPage.open();
  await appShell.expectSecondary('設定');
  await settingsPage.back();
  await expect(memo.boardHeading(TODAY)).toBeVisible();
  await expect(memo.todayBadge).toBeVisible();
});
