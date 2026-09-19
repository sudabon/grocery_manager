import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVisualViewport } from '../useVisualViewport';
function Bar({ active }: { active: boolean }) { useVisualViewport(active); return null; }
const inset = () => document.documentElement.style.getPropertyValue('--keyboard-inset');
// 基準は window.innerHeight ではなく自分のレイアウト（html = 100dvh）の下端。jsdom はレイアウトを持たないので stub する。
function stubViewport(height: number) {
  const viewport = Object.assign(new EventTarget(), { height, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue({ bottom: 800 } as DOMRect);
  return viewport;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.documentElement.style.removeProperty('--keyboard-inset'); });
it('入力中はキーボード相当の縮小とスクロールに追従し、復帰・購読解除する', () => {
  const viewport = stubViewport(400);
  const remove = vi.spyOn(viewport, 'removeEventListener');
  const { unmount } = render(<Bar active />);
  expect(inset()).toBe('400px');
  act(() => { viewport.offsetTop = 80; viewport.dispatchEvent(new Event('scroll')); });
  expect(inset()).toBe('320px');
  act(() => { viewport.offsetTop = 0; viewport.height = 800; viewport.dispatchEvent(new Event('resize')); });
  expect(inset()).toBe('0px');
  unmount(); expect(remove).toHaveBeenCalledTimes(2); expect(inset()).toBe('');
});
it('入力バーを閉じている間は余白を公開しない', () => {
  stubViewport(400);
  const { rerender } = render(<Bar active={false} />);
  expect(inset()).toBe('');
  rerender(<Bar active />); expect(inset()).toBe('400px');
  rerender(<Bar active={false} />); expect(inset()).toBe('');
});
it('VisualViewport未対応なら余白を公開しない', () => {
  vi.stubGlobal('visualViewport', undefined); render(<Bar active />);
  expect(inset()).toBe('');
});
