import { test, expect } from './fixtures/dictionaries';

const tags = (id: string) => ({ tag: ['@update-quadmemo-dictionary-tokenization', `@${id}`] });
test.use({ classificationSeed: 'seed:dict-compound' });

test('辞書に登録した複合語は原文のチップ1つになる', tags('TP-001'), async ({ memo }) => {
  await memo.start(); await memo.add('キッチンペーパー');
  await memo.expectQuadrantTexts([[], [], [], ['キッチンペーパー']]);
  await expect(memo.classifiedChip('キッチンペーパー')).toBeVisible();
});

test('末尾の短いエントリより長い語を先に結合して分類する', tags('TP-002'), async ({ memo }) => {
  await memo.start(); await memo.add('鶏むね肉');
  await memo.expectQuadrantTexts([[], [], ['鶏むね肉'], []]);
});

test('かな表記の揺れを吸収して結合しカタカナの原文を保持する', tags('TP-003'), async ({ memo }) => {
  await memo.start(); await memo.add('鶏ムネ肉');
  await memo.expectQuadrantTexts([[], [], ['鶏ムネ肉'], []]);
});

test('読点を跨いで結合せず読点のチップも作らない', tags('TP-004'), async ({ memo }) => {
  await memo.start(); await memo.add('鶏、むね肉');
  await memo.expectQuadrantTexts([['むね肉'], [], [], ['鶏']]);
});

test.describe('部分一致ON', () => {
  test.use({ classificationSeed: 'seed:dict-compound-partial' });
  test('部分一致は分類にだけ適用し完全一致しない語は結合しない', tags('TP-005'), async ({ memo }) => {
    await memo.start(); await memo.add('鶏むね');
    await memo.expectQuadrantTexts([[], [], ['鶏', 'むね'], []]);
  });
});

test('辞書への登録は次のコミットから結合に反映され既存チップは保持する', tags('TP-006'), async ({ memo, dictionaries }) => {
  await memo.start(); await memo.add('オリーブオイル');
  await memo.expectQuadrantTexts([[], [], [], ['オリーブ', 'オイル']]);
  await dictionaries.open(); await dictionaries.tab(2).click();
  await dictionaries.entries.fill('ミニトマト\nオリーブオイル');
  await dictionaries.save(); await dictionaries.back();
  await memo.start(); await memo.add('オリーブオイル');
  await memo.expectQuadrantTexts([[], ['オリーブオイル'], [], ['オリーブ', 'オイル']]);
  await memo.waitForSave(); await memo.reload();
  await memo.expectQuadrantTexts([[], ['オリーブオイル'], [], ['オリーブ', 'オイル']]);
});
