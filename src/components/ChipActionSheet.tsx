import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/useAppStore';

export function ChipActionSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const chip = useAppStore((state) => state.chips.find((item) => item.id === id));
  const dictionaries = useAppStore((state) => state.dictionaries);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(chip?.rawText ?? '');
  const sheet = useRef<HTMLDialogElement | HTMLDivElement | null>(null);
  const editor = useRef<HTMLInputElement>(null);
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
  useEffect(() => { if (editing) editor.current?.focus(); }, [editing]);
  if (!chip) return null;
  const content = <>
    <div className="sheet-heading"><h2 id="chip-sheet-title">メモの操作</h2><button type="button" onClick={onClose} aria-label="操作を閉じる">閉じる</button></div>
    <p className="sheet-text">{chip.rawText}</p>
    {editing ? <form className="edit-form" onSubmit={(event) => {
      event.preventDefault(); useAppStore.getState().editChip(id, text); onClose();
    }}>
      <label htmlFor="chip-edit">メモの編集</label>
      <input id="chip-edit" ref={editor} value={text} onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} />
      <button type="submit" className="commit-button">編集を確定</button>
    </form> : <>
      <div className="move-actions">{dictionaries.map(({ quadrant, label }) =>
        <button key={quadrant} type="button" disabled={chip.quadrant === quadrant} onClick={() => {
          useAppStore.getState().moveChip(id, quadrant); onClose();
        }}>{quadrant.toUpperCase()} {label}へ移動</button>)}</div>
      <div className="sheet-actions"><button type="button" onClick={() => setEditing(true)}>編集</button>
        <button type="button" className="danger" onClick={() => { useAppStore.getState().removeChip(id); onClose(); }}>削除</button></div>
    </>}
  </>;
  return createPortal(native
    ? <dialog ref={(node) => { sheet.current = node; }} className="action-sheet" aria-labelledby="chip-sheet-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>{content}</dialog>
    : <div className="sheet-overlay"><div ref={(node) => { sheet.current = node; }} className="action-sheet" role="dialog" aria-modal="true" aria-labelledby="chip-sheet-title">{content}</div></div>, document.body);
}
