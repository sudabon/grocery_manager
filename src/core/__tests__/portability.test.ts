import { expect, it } from 'vitest';
import { defaultSettings, seedDictionaries } from '../../db/defaults';
import { dictionaryExport, exportFileName, fullExport, ImportFormatError, parseDictionaryImport, parseFullImport, skipExistingMemos } from '../portability';
const memo = { id: 'a', rawText: 'パン', normText: 'ぱん', quadrant: 'q2' as const, matchedEntry: 'パン', autoClassified: true, createdAt: 1, updatedAt: 1 };
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
  (d: any) => { d.schemaVersion = 2; }, (d: any) => { delete d.settings; },
  (d: any) => { d.app = 'other'; }, (d: any) => { d.exportedAt = 'bad'; },
  (d: any) => { d.dictionaries.pop(); }, (d: any) => { d.dictionaries[1].quadrant = 'q1'; },
  (d: any) => { d.dictionaries[0].entries = [4]; }, (d: any) => { d.dictionaries[0].label = false; },
  (d: any) => { d.memos[0].quadrant = 'q5'; }, (d: any) => { delete d.memos[0].normText; },
  (d: any) => { d.memos[0].createdAt = '1'; }, (d: any) => { d.memos[0].matchedEntry = 2; },
  (d: any) => { d.memos[0].autoClassified = 1; }, (d: any) => { d.settings.partialMatch = 'false'; },
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
it('日付を含むファイル名', () => {
  const date = new Date('2026-09-08T10:00:00Z');
  expect(exportFileName('export', date)).toBe('quadmemo-export-2026-09-08.json');
  expect(exportFileName('dictionaries', date)).toBe('quadmemo-dictionaries-2026-09-08.json');
  expect(exportFileName('board', date)).toBe('quadmemo-board-2026-09-08.png');
});
it('可搬設定だけを出力し、往復できる', () => {
  const exported = fullExport(data());
  expect(() => fullExport(data())).not.toThrow();
  expect(exported.settings).not.toHaveProperty('installHintDismissed');
  expect(() => parseFullImport(JSON.stringify(exported))).not.toThrow();
  expect(parseFullImport(JSON.stringify(exported)).settings).toEqual(portableSettings);
});
