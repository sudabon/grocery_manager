import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuadrantGrid } from '../components/QuadrantGrid';
import { InputBar } from '../components/InputBar';
import { ChipActionSheet } from '../components/ChipActionSheet';
import { Toast, useToast } from '../components/Toast';
import { commitText } from '../core/commitText';
import { boardImageFile, boardImageLayout } from '../core/boardImage';
import { exportFileName } from '../core/portability';
import { shareFile } from '../core/shareExport';
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
  const commit = useCallback((text: string) => {
    void commitText(text, toast.notify).catch((error: unknown) => {
      console.error('[commit] メモを登録できませんでした', error);
      toast.notify('登録できませんでした。もう一度お試しください。');
    });
  }, [toast.notify]);
  // 画像の組み立てから受け渡しまで await を挟まない。iOS はジェスチャが切れると共有シートを開かない
  // （design.md - D2）。共有は読み取りだけで、ストアにも IndexedDB にも書き込まない。
  const shareBoardImage = useCallback(() => {
    const { chips } = useAppStore.getState();
    let file: File;
    // 利用者向けの案内は汎用文でよいが、Canvas 非対応・書き出し失敗・共有失敗を実機で切り分けられるよう痕跡は残す。
    try { file = boardImageFile(boardImageLayout(chips), exportFileName('board')); }
    catch (error) {
      console.error('[board-image] 画像を作成できませんでした', error);
      toast.notify('画像を作成できませんでした。もう一度お試しください。'); return;
    }
    void shareFile(file).catch((error: unknown) => {
      console.error('[board-image] 画像を共有できませんでした', error);
      toast.notify('画像を共有できませんでした。もう一度お試しください。');
    });
  }, [toast.notify]);
  return <main className="memo-page" aria-label="メモ">
    {!storageAvailable && !bannerClosed && <aside className="banner storage-banner" aria-label="保存できない環境の案内">
      <p>この環境ではデータを端末に保存できません。ページを閉じると変更が失われます。</p>
      <button type="button" aria-label="保存の案内を閉じる" onClick={() => setBannerClosed(true)}>閉じる</button>
    </aside>}
    {dictionariesEmpty && <aside className="dictionary-prompt"><Link to="/dictionaries">辞書を設定すると自動で振り分けられます</Link></aside>}
    <div className="board-actions"><button type="button" className="board-share-button" onClick={shareBoardImage}>画像で共有</button></div>
    <QuadrantGrid onSelect={setSelected} />
    <span className="visually-hidden">{pendingWrites ? '保存中' : '保存処理完了'}</span>
    <InputBar onCommit={commit} />
    <Toast message={saveError ?? toast.message} dismiss={saveError ? dismissSaveError : toast.dismiss} />
    {selected && <ChipActionSheet id={selected} onClose={close} notify={toast.notify} />}
  </main>;
}
