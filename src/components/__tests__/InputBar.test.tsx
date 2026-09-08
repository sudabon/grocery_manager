import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { InputBar as InputBarType } from '../InputBar';
// InputBar はモジュールスコープの hintSeen で「ヒントはセッション 1 回だけ」を実現している。
// テスト間でリセットしないと実行順に依存するため、毎テストでモジュールを作り直す。
let InputBar: typeof InputBarType;
beforeEach(async () => { vi.resetModules(); ({ InputBar } = await import('../InputBar')); });
afterEach(() => vi.useRealTimers());
it('常時DOMの入力欄を同期表示・focusし、確定後も連続入力できる', () => {
  const commit = vi.fn(); render(<InputBar onCommit={commit} />);
  const input = document.getElementById('memo-input')!;
  expect(input).not.toBeVisible(); fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' }));
  expect(screen.getByText('キーボードのマイクキー🎤をタップして話してください')).toBeVisible();
  expect(screen.getByRole('textbox')).toBe(input); expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: '牛乳' } }); fireEvent.click(screen.getByRole('button', { name: '確定' }));
  expect(commit).toHaveBeenCalledExactlyOnceWith('牛乳'); expect(input).toHaveFocus(); expect(input).toHaveValue('');
  fireEvent.change(input, { target: { value: '卵' } }); fireEvent.click(screen.getByRole('button', { name: '入力バーを閉じる' }));
  expect(commit).toHaveBeenLastCalledWith('卵'); expect(input).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' }));
  expect(screen.queryByText('キーボードのマイクキー🎤をタップして話してください')).not.toBeInTheDocument();
});
it('入力欄の変換イベントを自動確定ガードへ接続する', () => {
  vi.useFakeTimers(); const commit = vi.fn(); render(<InputBar onCommit={commit} />);
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' })); const input = screen.getByRole('textbox');
  fireEvent.compositionStart(input); fireEvent.change(input, { target: { value: '牛乳' } });
  act(() => vi.advanceTimersByTime(5000)); expect(commit).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input); act(() => vi.advanceTimersByTime(1500));
  expect(commit).toHaveBeenCalledExactlyOnceWith('牛乳');
});
