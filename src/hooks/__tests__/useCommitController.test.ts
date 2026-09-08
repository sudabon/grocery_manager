import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCommitController } from '../useCommitController';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('最終入力から1500ms後に確定し入力欄をクリアする', () => {
  const commit = vi.fn(); const { result } = renderHook(() => useCommitController(commit));
  act(() => result.current.change('牛'));
  act(() => vi.advanceTimersByTime(1000));
  act(() => result.current.change('牛乳'));
  act(() => vi.advanceTimersByTime(1499)); expect(commit).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1)); expect(commit).toHaveBeenCalledExactlyOnceWith('牛乳');
  expect(result.current.text).toBe('');
});
it('変換中は確定せず変換終了からタイマーを再開する', () => {
  const commit = vi.fn(); const { result } = renderHook(() => useCommitController(commit));
  act(() => result.current.change('ぎゅ'));
  act(() => result.current.compositionStart());
  act(() => result.current.change('ぎゅうにゅう'));
  act(() => vi.advanceTimersByTime(5000)); expect(commit).not.toHaveBeenCalled();
  act(() => result.current.compositionEnd('牛乳'));
  act(() => vi.advanceTimersByTime(1499)); expect(commit).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1)); expect(commit).toHaveBeenCalledExactlyOnceWith('牛乳');
});
it('即時コミットとタイマー・連打が競合しても一度のみ確定する', () => {
  const commit = vi.fn(); const { result } = renderHook(() => useCommitController(commit));
  act(() => { result.current.change('牛乳'); result.current.commit(); result.current.commit(); });
  act(() => vi.advanceTimersByTime(2000)); expect(commit).toHaveBeenCalledExactlyOnceWith('牛乳');
});
it('アンマウントでタイマーを破棄する', () => {
  const commit = vi.fn(); const { result, unmount } = renderHook(() => useCommitController(commit));
  act(() => result.current.change('牛乳')); unmount();
  act(() => vi.advanceTimersByTime(2000)); expect(commit).not.toHaveBeenCalled();
});
