import { boardDateOf, isBoardDate, todayBoardDate } from './boardDate';
import { QUADRANT_ORDER, type QuadrantId } from './classify';
import { QUADRANT_LABELS } from '../db/defaults';
import { sanitizeEntries } from './dictEntries';
import { clampAutoCommitMs } from './settings';
import type { PortableSettings, Dictionary, MemoItem } from '../db/schema';

export interface AppData { dictionaries: Dictionary[]; memos: MemoItem[]; settings: PortableSettings }
export class ImportFormatError extends Error {}
const invalid = () => new ImportFormatError('ファイルの形式が正しくないか、対応していない版数です。');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const quadrant = (value: unknown): value is QuadrantId => QUADRANT_ORDER.includes(value as QuadrantId);

function dictionaries(value: unknown): Dictionary[] {
  if (!Array.isArray(value) || value.length !== 4) throw invalid();
  const seen = new Set<QuadrantId>();
  const result = value.map((item) => {
    const d = record(item);
    if (!quadrant(d.quadrant) || seen.has(d.quadrant) || (d.label !== undefined && typeof d.label !== 'string') ||
      !Array.isArray(d.entries) || !d.entries.every((entry) => typeof entry === 'string') ||
      (d.updatedAt !== undefined && !finite(d.updatedAt))) throw invalid();
    seen.add(d.quadrant);
    return { quadrant: d.quadrant, label: QUADRANT_LABELS[d.quadrant], entries: sanitizeEntries(d.entries.join('\n')), updatedAt: d.updatedAt ?? Date.now() } as Dictionary;
  });
  return QUADRANT_ORDER.map((q) => result.find((d) => d.quadrant === q)!);
}
function settings(value: unknown): PortableSettings {
  const s = record(value);
  if (typeof s.partialMatch !== 'boolean' || typeof s.allowDuplicates !== 'boolean' ||
    typeof s.showDictationHint !== 'boolean' || !finite(s.autoCommitMs) || (s.key !== undefined && s.key !== 'app')) throw invalid();
  return { key: 'app', partialMatch: s.partialMatch, allowDuplicates: s.allowDuplicates,
    showDictationHint: s.showDictationHint, autoCommitMs: clampAutoCommitMs(s.autoCommitMs) };
}
function memos(value: unknown): MemoItem[] {
  if (!Array.isArray(value)) throw invalid();
  return value.map((item) => {
    const m = record(item);
    if (typeof m.id !== 'string' || !m.id || typeof m.rawText !== 'string' || typeof m.normText !== 'string' ||
      !quadrant(m.quadrant) || !(m.matchedEntry === null || typeof m.matchedEntry === 'string') ||
      typeof m.autoClassified !== 'boolean' || !finite(m.createdAt) || !finite(m.updatedAt) ||
      (m.boardDate !== undefined && !isBoardDate(m.boardDate))) throw invalid();
    // 日付を持たない旧版のメモは作成時刻の JST 日付へ振り分ける（design.md - D6）。
    return { id: m.id, boardDate: isBoardDate(m.boardDate) ? m.boardDate : boardDateOf(m.createdAt),
      rawText: m.rawText, normText: m.normText, quadrant: m.quadrant,
      matchedEntry: m.matchedEntry, autoClassified: m.autoClassified, createdAt: m.createdAt, updatedAt: m.updatedAt };
  });
}
export function dictionaryExport(value: Dictionary[]) { return { version: 1, dictionaries: value.map(({ quadrant, entries, updatedAt }) => ({ quadrant, entries, updatedAt })) }; }
/** メモの日付を含む版数。旧版（1）の入力も受け入れる（design.md - D6）。 */
export const FULL_EXPORT_SCHEMA_VERSION = 2;
const SUPPORTED_SCHEMA_VERSIONS = [1, FULL_EXPORT_SCHEMA_VERSION];
export function fullExport(data: AppData, now = new Date()) {
  return { app: 'quadmemo', schemaVersion: FULL_EXPORT_SCHEMA_VERSION, exportedAt: now.toISOString(),
    dictionaries: data.dictionaries.map(({ quadrant, entries, updatedAt }) => ({ quadrant, entries, updatedAt })), memos: data.memos.map(({ id, boardDate, rawText, normText, quadrant, matchedEntry, autoClassified, createdAt, updatedAt }) =>
      ({ id, boardDate, rawText, normText, quadrant, matchedEntry, autoClassified, createdAt, updatedAt })),
    settings: settings(data.settings) };
}
export function parseDictionaryImport(text: string): Dictionary[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw invalid(); }
  const value = record(parsed);
  if (value.version !== 1) throw invalid();
  return dictionaries(value.dictionaries);
}
export function validateAppData(value: unknown): AppData {
  const data = record(value);
  return { dictionaries: dictionaries(data.dictionaries), memos: memos(data.memos), settings: settings(data.settings) };
}
export function parseFullImport(text: string): AppData {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw invalid(); }
  const value = record(parsed);
  if (value.app !== 'quadmemo' || !SUPPORTED_SCHEMA_VERSIONS.includes(value.schemaVersion as number) ||
    typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) throw invalid();
  return validateAppData(value);
}
export function skipExistingMemos(incoming: MemoItem[], existingIds: Iterable<string>): MemoItem[] {
  const seen = new Set(existingIds);
  return incoming.filter((memo) => {
    if (seen.has(memo.id)) return false;
    seen.add(memo.id);
    return true;
  });
}
// 'board' だけは復元できない参照用画像なので拡張子が異なる（board-image-share design - D2）。
const exportExtension = { export: 'json', dictionaries: 'json', board: 'png' } as const;
/**
 * ファイル名の日付は JST 固定にする（design.md - D6）。共有画像は生成日ではなく
 * 対象ボードの日付を渡すため、引数は `YYYY-MM-DD` の文字列で受け取る。
 */
export function exportFileName(kind: keyof typeof exportExtension, date = todayBoardDate()): string {
  return `quadmemo-${kind}-${date}.${exportExtension[kind]}`;
}
