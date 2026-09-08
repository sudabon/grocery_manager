import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuadrantGrid } from '../components/QuadrantGrid';
import { InputBar } from '../components/InputBar';
import { ChipActionSheet } from '../components/ChipActionSheet';
import { Toast, useToast } from '../components/Toast';
import { commitText } from '../core/commitText';
import { useAppStore } from '../store/useAppStore';

export function MemoPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const close = useCallback(() => setSelected(null), []);
  const toast = useToast();
  const dictionariesEmpty = useAppStore((state) => state.dictionaries.every((d) => d.entries.length === 0));
  const storageAvailable = useAppStore((state) => state.storageAvailable);
  const saveError = useAppStore((state) => state.saveErrors[0]);
  const dismissSaveError = useAppStore((state) => state.dismissSaveError);
  const pendingWrites = useAppStore((state) => state.pendingWrites);
  const [bannerClosed, setBannerClosed] = useState(false);
  const commit = useCallback((text: string) => commitText(text, toast.notify), [toast.notify]);
  return <main className="memo-page" aria-label="メモ">
    {!storageAvailable && !bannerClosed && <aside className="storage-banner" aria-label="保存できない環境の案内">
      <p>この環境ではデータを端末に保存できません。ページを閉じると変更が失われます。</p>
      <button type="button" aria-label="保存の案内を閉じる" onClick={() => setBannerClosed(true)}>閉じる</button>
    </aside>}
    {dictionariesEmpty && <aside className="dictionary-prompt"><Link to="/dictionaries">辞書を設定すると自動で振り分けられます</Link></aside>}
    <QuadrantGrid onSelect={setSelected} />
    <span className="visually-hidden">{pendingWrites ? '保存中' : '保存処理完了'}</span>
    <InputBar onCommit={commit} />
    <Toast message={saveError ?? toast.message} dismiss={saveError ? dismissSaveError : toast.dismiss} />
    {selected && <ChipActionSheet id={selected} onClose={close} />}
  </main>;
}
