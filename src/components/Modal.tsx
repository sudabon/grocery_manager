import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Modal({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: ReactNode }) {
  const sheet = useRef<HTMLDialogElement | HTMLDivElement | null>(null);
  const native = typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function';
  useEffect(() => {
    const node = sheet.current!;
    const previous = document.activeElement as HTMLElement | null;
    const app = document.getElementById('app-shell')!;
    const previousHidden = app.getAttribute('aria-hidden');
    const previousInert = app.inert;
    if (native) (node as HTMLDialogElement).showModal();
    else { app.inert = true; app.setAttribute('aria-hidden', 'true'); node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !native) { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = [...node.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]')];
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? 0 : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      // Native dialogs can tab to browser chrome; mobile WebKit skips buttons.
      // Explicit cycling fulfills the board's requirement in both environments.
      event.preventDefault();
      items[next]?.focus();
    };
    const containFocus = (event: FocusEvent) => {
      if (!node.contains(event.target as Node)) node.querySelector<HTMLElement>('button:not(:disabled), input')?.focus();
    };
    // Older engines also lack inert; contain keyboard/programmatic focus in the overlay.
    document.addEventListener('keydown', trap);
    if (!native) document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', trap);
      if (native) (node as HTMLDialogElement).close();
      else {
        document.removeEventListener('focusin', containFocus);
        app.inert = previousInert;
        if (previousHidden === null) app.removeAttribute('aria-hidden'); else app.setAttribute('aria-hidden', previousHidden);
      }
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('.mic-button')?.focus({ preventScroll: true });
    };
  }, [native, onClose]);
  return createPortal(native
    ? <dialog ref={(node) => { sheet.current = node; }} className="action-sheet" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>{children}</dialog>
    : <div className="sheet-overlay"><div ref={(node) => { sheet.current = node; }} className="action-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>{children}</div></div>, document.body);
}
