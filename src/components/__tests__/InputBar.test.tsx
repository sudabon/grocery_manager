import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { InputBar as InputBarType } from '../InputBar';
// InputBar はモジュールスコープの hintSeen で「ヒントはセッション 1 回だけ」を実現している。
// テスト間でリセットしないと実行順に依存するため、毎テストでモジュールを作り直す。
let InputBar: typeof InputBarType;
beforeEach(async () => { vi.resetModules(); ({ InputBar } = await import('../InputBar')); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.documentElement.style.removeProperty('--keyboard-inset'); });
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
// iOS のディクテーションの書き戻し（コミット済み文字列で始まる入力）は残りだけ確定するが、
// 書き戻しが来ない契機（バーを閉じる・キー入力・途中結果の範囲置換）の後は先頭一致でも新しい入力として扱う。
const beforeInput = (input: HTMLElement, data: string) => fireEvent(input, new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data }));
function commitByTimer(input: HTMLElement, commit: ReturnType<typeof vi.fn>, text: string) {
  fireEvent.change(input, { target: { value: text } }); act(() => vi.advanceTimersByTime(1500));
  expect(commit).toHaveBeenLastCalledWith(text);
}
it('入力バーを閉じて開き直した後は先頭が一致しても新しい入力として確定する', () => {
  vi.useFakeTimers(); const commit = vi.fn(); render(<InputBar onCommit={commit} />);
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' })); const input = screen.getByRole('textbox');
  commitByTimer(input, commit, '卵');
  fireEvent.click(screen.getByRole('button', { name: '入力バーを閉じる' }));
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' }));
  commitByTimer(input, commit, '卵焼き');
});
it('フォーカスが外れた後は先頭が一致しても新しい入力として確定する', () => {
  vi.useFakeTimers(); const commit = vi.fn(); render(<InputBar onCommit={commit} />);
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' })); const input = screen.getByRole('textbox');
  commitByTimer(input, commit, '卵');
  fireEvent.blur(input);
  commitByTimer(input, commit, '卵焼き');
});
it('キー入力の後は先頭が一致しても新しい入力として確定する', () => {
  vi.useFakeTimers(); const commit = vi.fn(); render(<InputBar onCommit={commit} />);
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' })); const input = screen.getByRole('textbox');
  commitByTimer(input, commit, '卵');
  fireEvent.keyDown(input, { key: '卵' });
  commitByTimer(input, commit, '卵焼き');
});
it('途中結果の範囲置換が来たら書き戻しではないので丸ごと確定する', () => {
  vi.useFakeTimers(); const commit = vi.fn(); render(<InputBar onCommit={commit} />);
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' })); const input = screen.getByRole('textbox') as HTMLInputElement;
  commitByTimer(input, commit, '卵');
  fireEvent.change(input, { target: { value: '卵' } });
  input.setSelectionRange(0, 1); beforeInput(input, '卵焼き');
  commitByTimer(input, commit, '卵焼き');
});
it('書き戻しの挿入（選択範囲なし）では残りだけを確定する', () => {
  vi.useFakeTimers(); const commit = vi.fn(); render(<InputBar onCommit={commit} />);
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' })); const input = screen.getByRole('textbox') as HTMLInputElement;
  commitByTimer(input, commit, '牛乳');
  input.setSelectionRange(0, 0); beforeInput(input, '牛乳、');
  fireEvent.change(input, { target: { value: '牛乳、卵' } }); act(() => vi.advanceTimersByTime(1500));
  expect(commit).toHaveBeenCalledTimes(2); expect(commit).toHaveBeenLastCalledWith('、卵');
});
// 閉じている間の入力バーは、常時マウント（同期 focus のため）のままフローから外して高さを持たせない。
it('閉じている間は入力バーをフローから外し、開くと戻す', () => {
  render(<InputBar onCommit={vi.fn()} />);
  const bar = document.getElementById('memo-input-bar')!;
  expect(bar).toHaveClass('collapsed');
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' })); expect(bar).not.toHaveClass('collapsed');
  fireEvent.click(screen.getByRole('button', { name: '入力バーを閉じる' })); expect(bar).toHaveClass('collapsed');
});
it('入力バーを開いている間だけキーボード分の余白を公開する', () => {
  vi.stubGlobal('visualViewport', Object.assign(new EventTarget(), { height: 400, offsetTop: 0 }));
  vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue({ bottom: 800 } as DOMRect);
  render(<InputBar onCommit={vi.fn()} />);
  const inset = () => document.documentElement.style.getPropertyValue('--keyboard-inset');
  expect(inset()).toBe('');
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' })); expect(inset()).toBe('400px');
  fireEvent.click(screen.getByRole('button', { name: '入力バーを閉じる' })); expect(inset()).toBe('');
});
