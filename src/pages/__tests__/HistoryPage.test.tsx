import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HistoryPage } from '../HistoryPage';
import { boardDateLabel } from '../../core/boardDate';
import { useAppStore } from '../../store/useAppStore';

// 時刻を固定しないと JST 0:00 をまたいだ実行で描画時の当日が TODAY とずれ、
// 当日リンクにクエリが付いて href の検証が落ちる（useAppStore.test.ts と同じ固定時刻）。
// fake timers ではなく Date.now を差し替えるのは、fake timers が findBy* の自動待機を止めるため。
const TODAY = '2026-09-09';
const NOW = Date.parse(`${TODAY}T12:00:00+09:00`);
const PAST = '2026-09-08';
const LOADING = '日付を読み込んでいます…';
const READ_FAILED = '端末のデータを読み込めなかったため、日付の一覧を表示できません。';
const NO_PAST_BOARDS = '過去のボードはまだありません。';

// restoreMocks: true（vite.config.ts）が各テスト後に元へ戻す。
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(NOW); });
let listBoardDates: ReturnType<typeof vi.spyOn> | undefined;
afterEach(() => { listBoardDates?.mockRestore(); listBoardDates = undefined; });
/** `listBoardDates` の解決値を差し替えて日付の一覧を描画する。 */
function renderWith(result: Promise<string[] | null>) {
  listBoardDates = vi.spyOn(useAppStore.getState(), 'listBoardDates').mockReturnValue(result);
  render(<MemoryRouter><HistoryPage /></MemoryRouter>);
}

it('読み込み中は「無い」とも「読めなかった」とも見せない', () => {
  // 解決しない Promise で読み込み中のまま止める。
  renderWith(new Promise(() => {}));
  expect(screen.getByText(LOADING)).toBeVisible();
  expect(screen.queryByText(READ_FAILED)).toBeNull();
  expect(screen.queryByText(NO_PAST_BOARDS)).toBeNull();
  expect(screen.queryByRole('list', { name: 'ボードの日付' })).toBeNull();
});

it('読み取り失敗を 0 件と言い分け、一覧も「まだありません」も出さない', async () => {
  renderWith(Promise.resolve(null));
  expect(await screen.findByText(READ_FAILED)).toBeVisible();
  // 読めなかっただけで、日付が無いとは限らない。
  expect(screen.queryByText(NO_PAST_BOARDS)).toBeNull();
  expect(screen.queryByRole('list', { name: 'ボードの日付' })).toBeNull();
  expect(screen.queryByText(LOADING)).toBeNull();
});

it('日付を新しい順に並べ、当日だけクエリを付けない', async () => {
  renderWith(Promise.resolve([TODAY, PAST]));
  const list = await screen.findByRole('list', { name: 'ボードの日付' });
  const links = within(list).getAllByRole('link');
  expect(links.map((link) => link.textContent)).toEqual([boardDateLabel(TODAY), boardDateLabel(PAST)]);
  // 当日はクエリを付けない（付けたままにすると戻る操作で当日へ復帰しなくなる）。
  expect(links[0]).toHaveAttribute('href', '/');
  expect(links[1]).toHaveAttribute('href', `/?date=${PAST}`);
  expect(screen.queryByText(READ_FAILED)).toBeNull();
  expect(screen.queryByText(NO_PAST_BOARDS)).toBeNull();
});

it('当日のみのときは過去のボードが無いことを示し、読み取り失敗とは区別する', async () => {
  renderWith(Promise.resolve([TODAY]));
  expect(await screen.findByText(NO_PAST_BOARDS)).toBeVisible();
  expect(screen.queryByText(READ_FAILED)).toBeNull();
});

it('0 件でも読み取り失敗の案内は出さない', async () => {
  renderWith(Promise.resolve([]));
  await waitFor(() => expect(screen.getByText(NO_PAST_BOARDS)).toBeVisible());
  expect(screen.queryByText(READ_FAILED)).toBeNull();
  expect(screen.queryByText(LOADING)).toBeNull();
});
