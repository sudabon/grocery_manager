import { expect, it } from 'vitest';
import { defaultSettings, seedDictionaries } from '../../db/defaults';
import { boardDateOf } from '../boardDate';
import { dictionaryExport, exportFileName, FULL_EXPORT_SCHEMA_VERSION, fullExport, ImportFormatError, parseDictionaryImport, parseFullImport, skipExistingMemos } from '../portability';
const CREATED_AT = Date.parse('2026-09-09T10:00:00+09:00');
const memo = { id: 'a', boardDate: '2026-09-09', rawText: 'パン', normText: 'ぱん', quadrant: 'q2' as const, matchedEntry: 'パン', autoClassified: true, createdAt: CREATED_AT, updatedAt: CREATED_AT };
const { installHintDismissed: _deviceSetting, ...portableSettings } = defaultSettings;
const data = () => ({ dictionaries: seedDictionaries(1), memos: [memo], settings: { ...portableSettings } });
it('辞書と全データを往復でき、一時表示フラグは出力しない', () => {
  expect(parseDictionaryImport(JSON.stringify(dictionaryExport(data().dictionaries)))).toEqual(data().dictionaries);
  expect(parseFullImport(JSON.stringify(fullExport(data())))).toEqual(data());
  expect(fullExport({ ...data(), memos: [{ ...memo, unsaved: true } as typeof memo] }).memos[0]).not.toHaveProperty('unsaved');
  const deviceSettings = { ...defaultSettings, installHintDismissed: true };
  expect(fullExport({ ...data(), settings: deviceSettings }).settings).not.toHaveProperty('installHintDismissed');
  expect(parseFullImport(JSON.stringify(fullExport({ ...data(), memos: [] }))).memos).toEqual([]);
});
it.each(['{', 'null', '[]', '{"version":2}', '{"version":1}'])('不正な辞書JSONを拒否: %s', (text) => {
  expect(() => parseDictionaryImport(text)).toThrow(ImportFormatError);
});
it.each([
  (d: any) => { d.schemaVersion = 3; }, (d: any) => { delete d.settings; },
  (d: any) => { d.app = 'other'; }, (d: any) => { d.exportedAt = 'bad'; },
  (d: any) => { d.dictionaries.pop(); }, (d: any) => { d.dictionaries[1].quadrant = 'q1'; },
  (d: any) => { d.dictionaries[0].entries = [4]; }, (d: any) => { d.dictionaries[0].label = false; },
  (d: any) => { d.memos[0].quadrant = 'q5'; }, (d: any) => { delete d.memos[0].normText; },
  (d: any) => { d.memos[0].createdAt = '1'; }, (d: any) => { d.memos[0].matchedEntry = 2; },
  (d: any) => { d.memos[0].autoClassified = 1; }, (d: any) => { d.settings.partialMatch = 'false'; },
  (d: any) => { d.memos[0].boardDate = '2026/09/09'; }, (d: any) => { d.memos[0].boardDate = 20260909; },
  (d: any) => { d.memos[0].boardDate = null; },
  // 暦として存在しない日付。受け入れると保存はできるが `?date=` から開けないボードになる。
  (d: any) => { d.memos[0].boardDate = '2026-02-30'; }, (d: any) => { d.memos[0].boardDate = '2026-99-99'; },
  (d: any) => { d.memos[0].boardDate = '0000-00-00'; },
  (d: any) => { delete d.settings.showDictationHint; }, (d: any) => { d.settings.autoCommitMs = null; },
])('不正な必須項目を全件検証で拒否 %#', (mutate) => {
  const value = JSON.parse(JSON.stringify(fullExport(data()))); mutate(value);
  expect(() => parseFullImport(JSON.stringify(value))).toThrow(ImportFormatError);
});
it.each([[0, 500], [9999, 5000]])('設定範囲外%sを%sにクランプ', (value, expected) => {
  const input = data(); input.settings.autoCommitMs = value;
  expect(parseFullImport(JSON.stringify(fullExport(input))).settings.autoCommitMs).toBe(expected);
});
it('既存IDと入力内重複をスキップする', () => {
  expect(skipExistingMemos([memo, { ...memo, id: 'b' }, { ...memo, id: 'b' }], ['a'])).toEqual([{ ...memo, id: 'b' }]);
});
it('JST の日付を含むファイル名', () => {
  const date = boardDateOf(Date.parse('2026-09-08T10:00:00Z'));
  expect(exportFileName('export', date)).toBe('quadmemo-export-2026-09-08.json');
  expect(exportFileName('dictionaries', date)).toBe('quadmemo-dictionaries-2026-09-08.json');
  expect(exportFileName('board', date)).toBe('quadmemo-board-2026-09-08.png');
  // UTC 日付では前日になる JST 0:00〜9:00 でも、その日の JST 日付になる。
  expect(exportFileName('export', boardDateOf(Date.parse('2026-09-08T20:00:00Z')))).toBe('quadmemo-export-2026-09-09.json');
  // 対象ボードの日付をそのまま使い、生成日には依存しない。
  expect(exportFileName('board', '2026-09-06')).toBe('quadmemo-board-2026-09-06.png');
});
it('可搬設定だけを出力し、往復できる', () => {
  const exported = fullExport(data());
  expect(() => fullExport(data())).not.toThrow();
  expect(exported.settings).not.toHaveProperty('installHintDismissed');
  expect(() => parseFullImport(JSON.stringify(exported))).not.toThrow();
  expect(parseFullImport(JSON.stringify(exported)).settings).toEqual(portableSettings);
  for (const dict of fullExport(data()).dictionaries) expect(dict).not.toHaveProperty('label');
});

it('辞書エクスポートはラベルを除き、単語と版数を保って往復できる', () => {
  const legacy = seedDictionaries(1).map((dict) => ({ ...dict, label: '古いラベル' }));
  const exported = dictionaryExport(legacy);
  expect(exported.version).toBe(1);
  expect(exported.dictionaries).toHaveLength(4);
  for (const dict of exported.dictionaries) expect(dict).not.toHaveProperty('label');
  expect(parseDictionaryImport(JSON.stringify(exported))).toEqual(seedDictionaries(1));
  expect(legacy.every((dict) => dict.label === '古いラベル')).toBe(true);
});
it('旧 JSON のラベルを取り込まず固定値で復元する', () => {
  const legacy = data();
  legacy.dictionaries = legacy.dictionaries.map((dict) => ({ ...dict, label: '古いラベル' }));
  expect(parseDictionaryImport(JSON.stringify({ version: 1, dictionaries: legacy.dictionaries }))).toEqual(data().dictionaries);
  expect(parseFullImport(JSON.stringify(fullExport(legacy)))).toEqual(data());
});
it.each([null, false, 123, [], {}])('省略可能な label も存在する場合は文字列型を検証する: %j', (label) => {
  const input = { version: 1, dictionaries: seedDictionaries(1).map((dict) => ({ ...dict, label })) };
  expect(() => parseDictionaryImport(JSON.stringify(input))).toThrow(ImportFormatError);
});
it('全データインポートでもラベル省略を受け付ける', () => {
  const input = { ...fullExport(data()), dictionaries: dictionaryExport(data().dictionaries).dictionaries };
  expect(parseFullImport(JSON.stringify(input))).toEqual(data());
});

it('版数2で出力し各メモの日付を含む', () => {
  const exported = fullExport(data());
  expect(FULL_EXPORT_SCHEMA_VERSION).toBe(2);
  expect(exported.schemaVersion).toBe(2);
  expect(exported.memos[0]).toMatchObject({ id: 'a', boardDate: '2026-09-09' });
  expect(parseFullImport(JSON.stringify(exported)).memos).toEqual(data().memos);
});
it('版数1の日付なしメモを受け入れ作成時刻の JST 日付へ振り分ける', () => {
  const legacy = {
    app: 'quadmemo', schemaVersion: 1, exportedAt: '2026-09-08T00:00:00.000Z',
    dictionaries: dictionaryExport(data().dictionaries).dictionaries,
    memos: [
      // JST 0:30（UTC では前日）と JST 23:30。UTC 日付で振り分けると両方ずれる。
      { ...memo, id: 'midnight', createdAt: Date.parse('2026-09-10T00:30:00+09:00'), updatedAt: 1, boardDate: undefined },
      { ...memo, id: 'evening', createdAt: Date.parse('2026-09-09T23:30:00+09:00'), updatedAt: 1, boardDate: undefined },
    ].map(({ boardDate: _dropped, ...rest }) => rest),
    settings: { ...portableSettings },
  };
  const parsed = parseFullImport(JSON.stringify(legacy));
  expect(parsed.memos.map(({ id, boardDate }) => ({ id, boardDate }))).toEqual([
    { id: 'midnight', boardDate: '2026-09-10' }, { id: 'evening', boardDate: '2026-09-09' },
  ]);
  expect(parsed.memos).toHaveLength(legacy.memos.length);
});
it('版数1でも日付を持つメモはその日付を保つ', () => {
  const input = { ...fullExport(data()), schemaVersion: 1 };
  expect(parseFullImport(JSON.stringify(input)).memos[0].boardDate).toBe('2026-09-09');
});
