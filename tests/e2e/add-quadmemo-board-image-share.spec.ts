import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures/board-image-share';

const tags = (id: string) => ({ tag: ['@add-quadmemo-board-image-share', `@${id}`] });
const BOARD_IMAGE_NAME = /^quadmemo-board-\d{4}-\d{2}-\d{2}\.png$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const shareFailure = '画像を共有できませんでした。もう一度お試しください。';

// 空ボード（初期ラベル・全象限の空エントリ・メモ 0 件）。TP-001 / TP-002 の前提。
test.use({ classificationSeed: 'seed:dict-all-empty' });

test('メモ画面に受け渡し先アプリ名を含まない「画像で共有」がある', tags('TP-001'), async ({ memo }) => {
  await expect(memo.shareImageButton).toBeEnabled();
  await expect(memo.shareImageButton).toHaveAccessibleName('画像で共有');
  await expect(memo.shareImageButton).not.toHaveAccessibleName(/LINE|ライン|メール|Slack|Instagram/i);
});
test('メモ0件で画像共有するとPNGが共有へ渡りエラー案内が出ない', tags('TP-002'), async ({ memo, readSharedFiles }) => {
  await expect(memo.chips).toHaveCount(0);
  await memo.shareImage();
  // 受け渡しの到着だけを poll で待ち、各項目は即座に落ちるアサーションで見る
  // （形状不一致はリトライしても収束しないので、poll に入れるとタイムアウトとしてしか現れない）。
  await expect.poll(readSharedFiles).toHaveLength(1);
  const [shared] = await readSharedFiles();
  expect(shared.name).toMatch(BOARD_IMAGE_NAME);
  expect(shared.type).toBe('image/png');
  expect(shared.size).toBeGreaterThan(0);
  // t=0 でトーストが出ている場合、既定の 5000ms は 4000ms の自動消滅を待って偽の緑になる。
  // 遅れて出るトーストは toBeEmpty が即座に成功して抜けるため、この timeout では検出できない。
  await expect(memo.toast).toBeEmpty({ timeout: 1000 });
});

test.describe('チップがある状態', () => {
  test.use({ classificationSeed: 'seed:memos-across-quadrants' });

  test('チップがある状態で画像共有するとimage/pngのファイルが共有へ渡る', tags('TP-003'), async ({ memo, readSharedFiles }) => {
    await memo.shareImage();
    await expect.poll(readSharedFiles).toHaveLength(1);
    const [shared] = await readSharedFiles();
    expect(shared.name).toMatch(BOARD_IMAGE_NAME);
    // type は実装が付ける固定値なので、中身が空でないことは size で見る。
    expect(shared.type).toBe('image/png');
    expect(shared.size).toBeGreaterThan(0);
  });
  test('画像共有で配信元以外へのリクエストが発生しない', tags('TP-009'), async ({ memo, readSharedFiles, externalRequests }) => {
    await memo.shareImage();
    await expect.poll(readSharedFiles).toHaveLength(1);
    expect(externalRequests).toEqual([]);
  });
  test('画像共有のあとも各象限のチップは共有前と同一である', tags('TP-006'), async ({ memo, readSharedFiles }) => {
    const before = await memo.quadrantTexts();
    expect(before).toEqual([['apple'], ['ぱん'], ['牛乳'], []]);
    await memo.shareImage();
    await expect.poll(readSharedFiles).toHaveLength(1);
    expect(await memo.quadrantTexts()).toEqual(before);
  });

  test.describe('共有非対応', () => {
    test.use({ shareMode: 'env:no-web-share' });
    test('共有が使えない環境で画像共有すると日付付きのPNGをダウンロードできる', tags('TP-004'), async ({ memo }) => {
      const download = await memo.downloadImage();
      expect(download.suggestedFilename()).toMatch(BOARD_IMAGE_NAME);
      const body = await readFile((await download.path())!);
      expect(body.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    });
  });

  test.describe('共有の中止', () => {
    test.use({ shareMode: 'env:web-share-abort' });
    test('共有を中止してもエラー案内が出ずチップは変わらない', tags('TP-005'), async ({ memo, readSharedFiles }) => {
      const before = await memo.quadrantTexts();
      await memo.shareImage();
      await expect.poll(readSharedFiles).toHaveLength(1);
      // t=0 でトーストが出ている場合、既定の 5000ms は 4000ms の自動消滅を待って偽の緑になる。
      // 遅れて出るトーストは toBeEmpty が即座に成功して抜けるため、この timeout では検出できない。
      await expect(memo.toast).toBeEmpty({ timeout: 1000 });
      expect(await memo.quadrantTexts()).toEqual(before);
    });
  });

  test.describe('受け渡しの失敗', () => {
    test.use({ shareMode: 'env:web-share-failure' });
    test('受け渡しに失敗すると案内が出てチップは変わらない', tags('TP-007'), async ({ memo }) => {
      const before = await memo.quadrantTexts();
      await memo.shareImage();
      await expect(memo.toast).toHaveText(shareFailure);
      expect(await memo.quadrantTexts()).toEqual(before);
    });
  });
});
