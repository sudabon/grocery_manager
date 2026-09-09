import { useEffect, useState } from 'react';
import { update } from '../pwa/registerSW';
import { usePwaState } from '../pwa/usePwaState';

export function UpdateBanner() {
  const waiting = usePwaState().status === 'waiting';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!waiting) { setBusy(false); setError(false); }
  }, [waiting]);
  const message = error ? '更新できませんでした。もう一度お試しください。' : '新しいバージョンがあります';
  return <>
    {/* display:none を使わない常設ライブリージョン。内容変化前からツリーに存在させる。 */}
    <p className="visually-hidden" aria-live="polite">{waiting ? `アプリの更新: ${message}` : ''}</p>
    {waiting && <aside className="banner pwa-banner update-banner" aria-label="アプリの更新">
      <p>{message}</p>
      <button type="button" disabled={busy} onClick={() => {
        setBusy(true); setError(false);
        void update()
          .then((result) => { if (result !== 'applied') { setError(true); setBusy(false); } })
          .catch(() => { setError(true); setBusy(false); });
      }}>{busy ? '更新中…' : '更新'}</button>
    </aside>}
  </>;
}
