import { useId } from 'react';
import { Modal } from './Modal';
export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onClose, busy = false }: {
  title: string; description: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; busy?: boolean;
}) {
  const titleId = useId();
  return <Modal titleId={titleId} onClose={onClose}>
    <h2 id={titleId}>{title}</h2>
    <p>{description}</p>
    <div className="sheet-actions">
      <button type="button" autoFocus disabled={busy} onClick={onClose}>中止</button>
      <button type="button" className="danger" disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </Modal>;
}
