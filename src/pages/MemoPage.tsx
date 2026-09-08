import { useCallback, useState } from 'react';
import { QuadrantGrid } from '../components/QuadrantGrid';
import { InputBar } from '../components/InputBar';
import { ChipActionSheet } from '../components/ChipActionSheet';
import { Toast, useToast } from '../components/Toast';
import { commitText } from '../core/commitText';

export function MemoPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const close = useCallback(() => setSelected(null), []);
  const toast = useToast();
  const commit = useCallback((text: string) => commitText(text, toast.notify), [toast.notify]);
  return <main className="memo-page" aria-label="メモ">
    <QuadrantGrid onSelect={setSelected} />
    <InputBar onCommit={commit} />
    <Toast message={toast.message} dismiss={toast.dismiss} />
    {selected && <ChipActionSheet id={selected} onClose={close} />}
  </main>;
}
