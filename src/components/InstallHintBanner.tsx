import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function InstallHintBanner() {
  const dismissed = useAppStore((state) => state.settings.installHintDismissed === true);
  const [closed, setClosed] = useState(false);
  const [standalone, setStandalone] = useState(isStandalone);
  useEffect(() => {
    const media = window.matchMedia?.('(display-mode: standalone)');
    const change = () => setStandalone(isStandalone());
    media?.addEventListener('change', change);
    return () => media?.removeEventListener('change', change);
  }, []);
  if (standalone || dismissed || closed) return null;
  return <aside className="pwa-banner" aria-label="ホーム画面への追加">
    <p>共有ボタンから「ホーム画面に追加」を選ぶと、アプリとして使えます。</p>
    <button type="button" aria-label="ホーム画面追加の案内を閉じる" onClick={() => {
      setClosed(true);
      // 保存不可環境ではフラグを残せず、次回起動時にも案内が表示されることを許容する。
      void useAppStore.getState().updateSettings({ installHintDismissed: true });
    }}>閉じる</button>
  </aside>;
}
