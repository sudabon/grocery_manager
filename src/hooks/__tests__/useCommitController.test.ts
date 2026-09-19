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
// iOS のディクテーションは、自動コミットで空になった入力欄へ「コミット済みの文字列 + その後の発話」を
// 累積で書き戻す（実機ログで確認）。コミット済みの先頭部分を除いた残りだけをコミットする。
it('書き戻しがコミット済みの文字列で始まるなら残りだけを確定する', () => {
  const commit = vi.fn(); const { result } = renderHook(() => useCommitController(commit));
  act(() => result.current.change('牛乳'));
  act(() => vi.advanceTimersByTime(1500)); expect(commit).toHaveBeenCalledExactlyOnceWith('牛乳');
  act(() => { result.current.change('牛乳、'); result.current.change('牛乳、卵'); });
  expect(result.current.text).toBe('牛乳、卵');
  act(() => vi.advanceTimersByTime(1500));
  expect(commit).toHaveBeenCalledTimes(2); expect(commit).toHaveBeenLastCalledWith('、卵');
  expect(result.current.text).toBe('');
});
it('書き戻しがコミット済みの文字列と同一なら再確定せず入力欄だけ空にする', () => {
  const commit = vi.fn(); const { result } = renderHook(() => useCommitController(commit));
  act(() => result.current.change('牛乳'));
  act(() => vi.advanceTimersByTime(1500));
  act(() => result.current.change('牛乳')); expect(result.current.text).toBe('牛乳');
  act(() => vi.advanceTimersByTime(1500));
  expect(commit).toHaveBeenCalledExactlyOnceWith('牛乳'); expect(result.current.text).toBe('');
});
it('手動確定の後の書き戻しも同様に残りだけを確定する', () => {
  const commit = vi.fn(); const { result } = renderHook(() => useCommitController(commit));
  act(() => { result.current.change('牛乳'); result.current.commit(); });
  act(() => result.current.change('牛乳、卵'));
  act(() => result.current.commit());
  expect(commit).toHaveBeenCalledTimes(2); expect(commit).toHaveBeenLastCalledWith('、卵');
});
it('reset 後は先頭が一致しても新しい入力として確定する', () => {
  const commit = vi.fn(); const { result } = renderHook(() => useCommitController(commit));
  act(() => result.current.change('卵'));
  act(() => vi.advanceTimersByTime(1500));
  act(() => result.current.reset());
  act(() => result.current.change('卵焼き'));
  act(() => vi.advanceTimersByTime(1500));
  expect(commit).toHaveBeenLastCalledWith('卵焼き');
});
