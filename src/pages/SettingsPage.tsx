import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { clampAutoCommitMs } from '../core/settings';
import { exportFileName, fullExport, ImportFormatError, parseFullImport, type AppData } from '../core/portability';
import { shareExport } from '../core/shareExport';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SaveFeedback } from '../components/SaveFeedback';
import { useToast } from '../components/Toast';

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const permission = useAppStore((state) => state.persistencePermission);
  const pendingWrites = useAppStore((state) => state.pendingWrites);
  const storageAvailable = useAppStore((state) => state.storageAvailable);
  const dataLoaded = useAppStore((state) => state.dataLoaded);
  const [toggleValues, setToggleValues] = useState(settings);
  const [waitMs, setWaitMs] = useState(settings.autoCommitMs);
  const range = useRef<HTMLInputElement>(null);
  const [deleteStep, setDeleteStep] = useState(0);
  const [incoming, setIncoming] = useState<AppData | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const toast = useToast();
  const close = useCallback(() => { if (!lock.current) { setDeleteStep(0); setIncoming(null); } }, []);
  useEffect(() => { setToggleValues(settings); }, [settings]);
  useEffect(() => { setWaitMs(settings.autoCommitMs); }, [settings.autoCommitMs]);
  useEffect(() => {
    const input = range.current!;
    // React onChange for a range also fires on input; use the native commit event.
    const commit = () => {
      const value = clampAutoCommitMs(input.valueAsNumber);
      void useAppStore.getState().updateSettings({ autoCommitMs: value }).then((ok) => {
        if (!ok) setWaitMs(useAppStore.getState().settings.autoCommitMs);
      });
    };
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, []);
  async function importFile(file: File) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { setIncoming(parseFullImport(await file.text())); }
    catch (error) {
      toast.notify(error instanceof ImportFormatError
        ? 'インポートできませんでした。ファイルの形式・版数を確認してください。'
        : 'ファイルを読み取れませんでした。もう一度選び直してください。');
    }
    finally { lock.current = false; setBusy(false); }
  }
  async function confirm() {
    if (lock.current) return;
    if (deleteStep === 1) { setDeleteStep(2); return; }
    lock.current = true; setBusy(true);
    try {
      if (incoming) {
        if (await useAppStore.getState().importData(incoming)) toast.notify('全データをインポートしました');
      } else await useAppStore.getState().clearAll();
      setIncoming(null); setDeleteStep(0);
    } finally { lock.current = false; setBusy(false); }
  }
  const toggles = [
    ['partialMatch', '部分一致を許可'], ['allowDuplicates', '同一単語の重複を許可'], ['showDictationHint', 'ディクテーションのヒント表示'],
  ] as const;
  return <main className="secondary-page"><div className="page-content">
    <Link to="/">メモ画面へ戻る</Link><h2>設定</h2><p>設定は変更すると自動で保存されます。</p>
    <section className="settings-section" aria-label="メモの動作"><h3>メモの動作</h3>
      {toggles.map(([key, label]) => <label className="toggle-row" key={key}>{label}
        <input type="checkbox" role="switch" checked={toggleValues[key]} disabled={busy || pendingWrites > 0}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            setToggleValues((values) => ({ ...values, [key]: checked }));
            void useAppStore.getState().updateSettings({ [key]: checked }).then((ok) => {
              if (!ok) setToggleValues(useAppStore.getState().settings);
            });
          }} />
      </label>)}
      <label className="range-label" htmlFor="auto-commit">自動コミット待機時間 <span>{waitMs} ms</span></label>
      <input id="auto-commit" ref={range} type="range" min={500} max={5000} step={100} value={waitMs} disabled={busy}
        onChange={(event) => setWaitMs(clampAutoCommitMs(event.currentTarget.valueAsNumber))} />
      <p className="help-text">入力が止まってから確定するまでの時間（500〜5000 ms）</p>
    </section>
    <section className="settings-section" aria-label="全データのバックアップ"><h3>バックアップと復元</h3>
      <p>メモ・辞書・設定をまとめて保存できます。定期的なバックアップ（エクスポート）をおすすめします。</p>
      {/* 3 つの導線で条件が違う: エクスポートは書き込み能力を必要としないので塞がず、読み込み失敗だけを開示する。
          インポートは失敗しても applyImport がトランザクションを中断して無変更に戻るため塞がず開示に留める。
          メモ全削除だけは storageAvailable で塞ぐ（押しても必ず失敗し、画面から 1 件も消えないため）。 */}
      {!dataLoaded && <p className="help-text">端末のデータを読み込めなかったため、出力できるのは現在画面に表示されている内容だけです。復元用のバックアップとしては使わないでください。</p>}
      {!storageAvailable && <p className="help-text">この環境では端末にデータを保存できないため、インポートは失敗する可能性があります。</p>}
      <button type="button" className="secondary-button" disabled={busy || pendingWrites > 0} onClick={() => {
        const state = useAppStore.getState();
        void shareExport(fullExport({ dictionaries: state.dictionaries, memos: state.chips, settings: state.settings }), exportFileName('export'))
          .catch(() => toast.notify('エクスポートできませんでした。もう一度お試しください。'));
      }}>全データをエクスポート</button>
      <label className="file-control">全データをインポート<input type="file" accept=".json,application/json" disabled={busy || pendingWrites > 0} onChange={(event) => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importFile(file);
      }} /></label>
    </section>
    <section className="settings-section"><h3>メモの削除</h3><p>辞書と設定はそのままに、すべてのメモを削除します。</p>
      {!storageAvailable && <p className="help-text">この環境では端末にデータを保存できないため、削除を実行できません。</p>}
      <button type="button" className="secondary-button danger" disabled={busy || pendingWrites > 0 || !storageAvailable} onClick={() => setDeleteStep(1)}>メモを全削除</button>
    </section>
    <section className="settings-section" aria-label="アプリ情報"><h3>アプリ情報</h3>
      <p>バージョン {import.meta.env.VITE_APP_VERSION}</p>
      <p>ストレージ永続化：{permission === null ? '確認中' : { granted: '許可されています', denied: '許可されていません', unsupported: 'この環境は非対応です' }[permission]}</p>
      <p>メモ・辞書・設定は端末内に保存します。アプリから外部へのネットワーク送信は行いません。エクスポートは利用者が選んだ保存先へ渡します。</p>
    </section>
    {(deleteStep > 0 || incoming) && <ConfirmDialog key={incoming ? 'import' : deleteStep}
      title={incoming ? '辞書と設定を上書きしますか？' : deleteStep === 1 ? 'すべてのメモを削除しますか？' : '本当にすべてのメモを削除しますか？'}
      description={incoming ? '辞書と設定はファイルの内容に置き換わります。メモは既存の ID と重複しないものだけ追加します。' : deleteStep === 1 ? '次の確認で削除を確定します。辞書と設定は変更しません。' : 'この操作は元に戻せません。必要なメモは先にエクスポートしてください。'}
      confirmLabel={incoming ? '上書きしてインポート' : deleteStep === 1 ? '次へ' : 'すべてのメモを削除'}
      busy={busy} onClose={close} onConfirm={() => void confirm()} />}
    <SaveFeedback toast={toast} />
  </div></main>;
}
