import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVisualViewport } from '../useVisualViewport';
function Dock() { return <div ref={useVisualViewport()} role="group" aria-label="入力ドック" />; }
afterEach(() => vi.unstubAllGlobals());
it('キーボード相当の縮小とスクロールに追従し復帰・購読解除する', () => {
  const viewport = Object.assign(new EventTarget(), { height: 400, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport); vi.stubGlobal('innerHeight', 800);
  const remove = vi.spyOn(viewport, 'removeEventListener');
  const { unmount } = render(<Dock />); const dock = screen.getByRole('group');
  expect(dock.style.transform).toBe('translateY(-400px)');
  act(() => { viewport.offsetTop = 80; viewport.dispatchEvent(new Event('scroll')); });
  expect(dock.style.transform).toBe('translateY(-320px)');
  act(() => { viewport.offsetTop = 0; viewport.height = 800; viewport.dispatchEvent(new Event('resize')); });
  expect(dock.style.transform).toBe('translateY(0px)');
  unmount(); expect(remove).toHaveBeenCalledTimes(2);
});
it('VisualViewport未対応ならfixed位置を変更しない', () => {
  vi.stubGlobal('visualViewport', undefined); render(<Dock />);
  expect(screen.getByRole('group').style.transform).toBe('');
});
