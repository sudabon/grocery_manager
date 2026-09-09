import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function InstallHintBanner() {
  const dismissed = useAppStore((state) => state.settings.installHintDismissed);
  const [closed, setClosed] = useState(false);
  const standalone = isStandalone();
  if (standalone || dismissed || closed) return null;
  return <aside className="banner pwa-banner" aria-label="ホーム画面への追加">
    <p>共有ボタンから「ホーム画面に追加」を選ぶと、アプリとして使えます。</p>
    <button type="button" aria-label="ホーム画面追加の案内を閉じる" onClick={() => {
      setClosed(true);
      // 保存不可環境ではフラグを残せず、次回起動時にも案内が表示されることを許容する。
      void useAppStore.getState().dismissInstallHint();
    }}>閉じる</button>
  </aside>;
}
