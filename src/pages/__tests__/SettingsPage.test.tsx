import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { SettingsPage } from '../SettingsPage';
import { defaultSettings, seedDictionaries } from '../../db/defaults';
import { useAppStore } from '../../store/useAppStore';
import { shareExport } from '../../core/shareExport';
import type { fullExport } from '../../core/portability';

vi.mock('../../core/shareExport', () => ({ shareExport: vi.fn() }));
vi.mock('../../pwa/usePwaState', () => ({
  usePwaState: () => ({ status: 'registered', offlineReady: true }),
}));

beforeEach(() => {
  vi.mocked(shareExport).mockReset();
  useAppStore.setState({
    settings: { ...defaultSettings }, dictionaries: seedDictionaries(), chips: [],
    pendingWrites: 0, saveErrors: [], dataLoaded: true, storageAvailable: true,
  });
});

it('エクスポートの同期検証エラーをトーストに変換し、共有処理を開始しない', async () => {
  useAppStore.setState({ settings: { ...defaultSettings, autoCommitMs: NaN } });
  render(<MemoryRouter><SettingsPage /></MemoryRouter>);
  // 全データのエクスポートは表示中のボード以外のメモも含めるため、画面を開いた時点で
  // 全メモを読み込む。読み込みが終わるまでは、不完全なバックアップを出さないよう押せない。
  await waitFor(() => expect(screen.getByRole('button', { name: '全データをエクスポート' })).toBeEnabled());
  expect(() => fireEvent.click(screen.getByRole('button', { name: '全データをエクスポート' }))).not.toThrow();
  expect(screen.getByRole('status')).toHaveTextContent('エクスポートできませんでした。もう一度お試しください。');
  expect(shareExport).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '全データをエクスポート' })).toBeEnabled();
});

it('全データのエクスポートは表示中のボード以外のメモも含める', async () => {
  const memo = (id: string, boardDate: string) =>
    ({ id, boardDate, rawText: id, normText: id, quadrant: 'q1' as const, matchedEntry: null, autoClassified: false, createdAt: 1, updatedAt: 1 });
  const all = [memo('today', '2026-09-09'), memo('past', '2026-09-08')];
  // chips は表示中のボードのぶんだけ。エクスポートは保存層から読み直した全メモを使う。
  useAppStore.setState({ chips: [all[0]], viewingBoardDate: '2026-09-09', viewingIsToday: true });
  const listAllMemos = vi.spyOn(useAppStore.getState(), 'listAllMemos').mockResolvedValue(all);
  vi.mocked(shareExport).mockResolvedValue(undefined);
  try {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: '全データをエクスポート' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '全データをエクスポート' }));
    expect(shareExport).toHaveBeenCalledTimes(1);
    const [value, name] = vi.mocked(shareExport).mock.calls[0];
    const payload = value as ReturnType<typeof fullExport>;
    expect(payload.memos.map((entry) => entry.id)).toEqual(['today', 'past']);
    expect(payload.memos.map((entry) => entry.boardDate)).toEqual(['2026-09-09', '2026-09-08']);
    expect(name).toMatch(/^quadmemo-export-\d{4}-\d{2}-\d{2}\.json$/);
  } finally { listAllMemos.mockRestore(); }
});
