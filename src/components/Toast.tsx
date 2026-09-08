import { useCallback, useEffect, useState } from 'react';

export function useToast() {
  const [queue, setQueue] = useState<{ text: string }[]>([]);
  const notify = useCallback((message: string) => setQueue((items) => [...items, { text: message }]), []);
  const dismiss = useCallback(() => setQueue((items) => items.slice(1)), []);
  return { message: queue[0], notify, dismiss };
}
export function Toast({ message, dismiss }: { message: { text: string } | undefined; dismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(dismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [message, dismiss]);
  return <div className={`toast${message ? ' toast-visible' : ''}`} role="status" aria-atomic="true">{message?.text}</div>;
}
