import { useEffect, useState } from 'react';
import { subscribeUpdates, update } from '../pwa/registerSW';

export function UpdateToast() {
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const subscription = subscribeUpdates(() => setWaiting(true));
    return subscription.unsubscribe;
  }, []);
  if (!waiting) return null;
  return <aside className="pwa-banner update-banner" aria-label="アプリの更新">
    <p aria-live="polite">{error ? '更新できませんでした。もう一度お試しください。' : '新しいバージョンがあります'}</p>
    <button type="button" disabled={busy} onClick={() => {
      setBusy(true); setError(false);
      void update().catch(() => { setError(true); setBusy(false); });
    }}>{busy ? '更新中…' : '更新'}</button>
  </aside>;
}
