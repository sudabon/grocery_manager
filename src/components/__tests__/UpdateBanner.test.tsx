import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { UpdateBanner } from '../UpdateBanner';
import { update } from '../../pwa/registerSW';
import { usePwaState } from '../../pwa/usePwaState';

vi.mock('../../pwa/registerSW', () => ({ update: vi.fn() }));
vi.mock('../../pwa/usePwaState', () => ({ usePwaState: vi.fn() }));

beforeEach(() => {
  vi.mocked(update).mockReset();
  vi.mocked(usePwaState).mockReturnValue({ status: 'registered', offlineReady: true });
});
function notifyUpdate() {
  vi.mocked(usePwaState).mockReturnValue({ status: 'waiting', offlineReady: true });
}
it('通知前は更新の文面を描画しない', () => {
  render(<UpdateBanner />);
  expect(screen.queryByText('新しいバージョンがあります')).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'アプリの更新' })).not.toBeInTheDocument();
});
it('通知後にバナー本文と有効な更新ボタンが出る', () => {
  const { rerender } = render(<UpdateBanner />);
  act(() => { notifyUpdate(); rerender(<UpdateBanner />); });
  expect(screen.getByRole('complementary', { name: 'アプリの更新' })).toBeVisible();
  expect(screen.getByText('新しいバージョンがあります')).toBeVisible();
  expect(screen.getByRole('button', { name: /^更新$/ })).toBeEnabled();
});
it('制御移行がタイムアウトしたらエラーを表示し、再試行できる', async () => {
  vi.mocked(update).mockResolvedValueOnce('timeout');
  notifyUpdate(); render(<UpdateBanner />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /^更新$/ })));
  expect(screen.getByText('更新できませんでした。もう一度お試しください。')).toBeVisible();
  expect(screen.getByRole('button', { name: /^更新$/ })).toBeEnabled();
  vi.mocked(update).mockResolvedValueOnce('applied');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /^更新$/ })));
  expect(update).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: '更新中…' })).toBeDisabled();
});
it('更新が失敗するとエラーを表示して再試行できる', async () => {
  let rejectUpdate!: (error: Error) => void;
  vi.mocked(update).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectUpdate = reject; }));
  const { rerender } = render(<UpdateBanner />);
  act(() => { notifyUpdate(); rerender(<UpdateBanner />); });
  fireEvent.click(screen.getByRole('button', { name: /^更新$/ }));
  expect(screen.getByRole('button', { name: '更新中…' })).toBeDisabled();
  await act(async () => rejectUpdate(new Error('offline')));
  expect(screen.getByText('更新できませんでした。もう一度お試しください。')).toBeVisible();
  expect(screen.getByRole('button', { name: /^更新$/ })).toBeEnabled();
  vi.mocked(update).mockResolvedValueOnce('applied');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /^更新$/ })));
  expect(update).toHaveBeenCalledTimes(2);
});
it('更新が適用対象外なら失敗として扱う', async () => {
  vi.mocked(update).mockResolvedValueOnce('skipped');
  const { rerender } = render(<UpdateBanner />);
  act(() => { notifyUpdate(); rerender(<UpdateBanner />); });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /^更新$/ })));
  expect(screen.getByText('更新できませんでした。もう一度お試しください。')).toBeVisible();
  expect(screen.getByRole('button', { name: /^更新$/ })).toBeEnabled();
});
it('通知前からライブリージョンが存在し、通知後に同じ要素の本文を更新する', () => {
  const { rerender } = render(<UpdateBanner />);
  const live = screen.getByRole('paragraph');
  expect(live).toHaveAttribute('aria-live', 'polite');
  expect(live).toHaveClass('visually-hidden');
  expect(live).toBeEmptyDOMElement();
  expect(live.closest('[hidden], [aria-hidden="true"]')).toBeNull();
  act(() => { notifyUpdate(); rerender(<UpdateBanner />); });
  expect(live).toBeInTheDocument();
  expect(live).toHaveTextContent('アプリの更新: 新しいバージョンがあります');
});
it('失敗後に次世代の通知が来ると文面と更新ボタンを戻す', async () => {
  vi.mocked(update).mockRejectedValueOnce(new Error('offline'));
  const { rerender } = render(<UpdateBanner />);
  act(() => { notifyUpdate(); rerender(<UpdateBanner />); });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /^更新$/ })));
  expect(screen.getByText('更新できませんでした。もう一度お試しください。')).toBeVisible();
  act(() => {
    vi.mocked(usePwaState).mockReturnValue({ status: 'registered', offlineReady: true });
    rerender(<UpdateBanner />);
  });
  act(() => { notifyUpdate(); rerender(<UpdateBanner />); });
  expect(screen.getByText('新しいバージョンがあります')).toBeVisible();
  expect(screen.getByRole('button', { name: /^更新$/ })).toBeEnabled();
});
