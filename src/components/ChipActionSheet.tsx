import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { useAppStore } from '../store/useAppStore';

export function ChipActionSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const chip = useAppStore((state) => state.chips.find((item) => item.id === id));
  const dictionaries = useAppStore((state) => state.dictionaries);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(chip?.rawText ?? '');
  const editor = useRef<HTMLInputElement>(null);
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
  return <Modal titleId="chip-sheet-title" onClose={onClose}>{content}</Modal>;
}
