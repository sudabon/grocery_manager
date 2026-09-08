import { afterEach, expect, it, vi } from 'vitest';
import { shareExport } from '../shareExport';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('awaitを挟まずユーザー操作内で共有を呼ぶ', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { canShare: () => true, share });
  const result = shareExport({ version: 1 }, 'test.json');
  expect(share).toHaveBeenCalledTimes(1);
  const file = share.mock.calls[0][0].files[0]; expect(file.name).toBe('test.json'); expect(file.type).toBe('application/json');
  await result;
});
it.each(['missing', 'false', 'throws'])('共有判定%sならダウンロードへフォールバックする', async (mode) => {
  vi.useFakeTimers();
  const share = vi.fn();
  vi.stubGlobal('navigator', { share, canShare: mode === 'missing' ? undefined : () => { if (mode === 'throws') throw new Error(); return false; } });
  const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe('test.json'); });
  await shareExport({}, 'test.json'); expect(click).toHaveBeenCalledOnce(); expect(share).not.toHaveBeenCalled();
  await vi.runAllTimersAsync(); expect(revoke).toHaveBeenCalledWith('blob:test');
});
it('共有中止は無通知、共有失敗は呼び出し元へ返す', async () => {
  const share = vi.fn().mockRejectedValueOnce(new DOMException('cancel', 'AbortError')).mockRejectedValueOnce(new Error('failed'));
  vi.stubGlobal('navigator', { canShare: () => true, share });
  await expect(shareExport({}, 'test.json')).resolves.toBeUndefined();
  await expect(shareExport({}, 'test.json')).rejects.toThrow('failed');
});
