import { useEffect } from 'react';

/**
 * ソフトウェアキーボードでレイアウトの下端が隠れている量を `--keyboard-inset` として html に公開する。
 * メモ画面はこの分だけ下パディングを増やし、入力ドックをキーボードの上へ押し上げつつボードを縮める
 * （ドックを transform で持ち上げるとボードに重なり、象限の末尾が隠れる）。
 * 基準は window.innerHeight ではなく自分のレイアウト（html = 100dvh）の下端。iOS が innerHeight と
 * visualViewport の基準をずらしていても、レイアウトと視覚ビューポートの差そのものを取れる。
 * 入力バーが開いている間だけ追従する。閉じている間はキーボードが出ないので、実機の値のずれを余白に混入させない。
 */
export function useVisualViewport(active: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !active) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, root.getBoundingClientRect().bottom - (viewport.offsetTop + viewport.height));
      root.style.setProperty('--keyboard-inset', `${inset}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.style.removeProperty('--keyboard-inset');
    };
  }, [active]);
}
