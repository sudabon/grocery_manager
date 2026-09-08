import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QUADRANT_ORDER, type QuadrantId } from '../core/classify';
import { dictionaryExport, exportFileName, parseDictionaryImport } from '../core/portability';
import { shareExport } from '../core/shareExport';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../components/Toast';
import { SaveFeedback } from '../components/SaveFeedback';

export function DictionariesPage() {
  const dictionaries = useAppStore((state) => state.dictionaries);
  const [selected, setSelected] = useState<QuadrantId>('q1');
  const [drafts, setDrafts] = useState(() => Object.fromEntries(dictionaries.map((d) => [d.quadrant, { label: d.label, text: d.entries.join('\n') }])));
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const toast = useToast();
  const draft = drafts[selected];
  const saved = dictionaries.find((d) => d.quadrant === selected)!;
  const dirty = draft.label !== saved.label || draft.text !== saved.entries.join('\n');
  const change = (patch: Partial<typeof draft>) => setDrafts((values) => ({ ...values, [selected]: { ...values[selected], ...patch } }));
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (await useAppStore.getState().saveDictionary(selected, draft.label, draft.text)) {
        const updated = useAppStore.getState().dictionaries.find((d) => d.quadrant === selected)!;
        setDrafts((values) => ({ ...values, [selected]: { label: updated.label, text: updated.entries.join('\n') } }));
        toast.notify('辞書を保存しました');
      }
    } finally { lock.current = false; setBusy(false); }
  }
  async function importFile(file: File) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const dictionaries = parseDictionaryImport(await file.text());
      if (await useAppStore.getState().importData({ dictionaries })) {
        setDrafts(Object.fromEntries(dictionaries.map((d) => [d.quadrant, { label: d.label, text: d.entries.join('\n') }])));
        toast.notify('辞書をインポートしました');
      }
    } catch { toast.notify('インポートできませんでした。ファイルの形式・版数を確認してください。'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <main className="secondary-page"><div className="page-content">
    <Link to="/">メモ画面へ戻る</Link><h2>辞書編集</h2>
    <p>象限ごとのラベルと単語を編集し、保存して反映します。</p>
    <div role="tablist" aria-label="編集する象限" className="quadrant-tabs">{QUADRANT_ORDER.map((q, index) =>
      <button key={q} type="button" role="tab" id={`tab-${q}`} aria-controls="dictionary-panel" aria-selected={selected === q}
        tabIndex={selected === q ? 0 : -1} disabled={busy} onClick={() => setSelected(q)} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4;
          setSelected(QUADRANT_ORDER[next]); document.getElementById(`tab-${QUADRANT_ORDER[next]}`)?.focus();
        }}>{q.toUpperCase()}</button>)}</div>
    <section id="dictionary-panel" role="tabpanel" aria-labelledby={`tab-${selected}`}>
      <fieldset disabled={busy} className="dictionary-fields">
        <label htmlFor="dictionary-label">象限ラベル</label>
        <input id="dictionary-label" value={draft.label} onChange={(event) => change({ label: event.currentTarget.value })} />
        <label htmlFor="dictionary-entries">単語リスト（1 行 1 語）</label>
        <textarea id="dictionary-entries" rows={10} value={draft.text} onChange={(event) => change({ text: event.currentTarget.value })} aria-describedby="dictionary-help" />
        <div className="save-row"><button type="button" className="commit-button" onClick={() => void save()}>保存</button>
          <span>{dirty ? '未保存の変更があります' : '保存済み'}</span></div>
      </fieldset>
    </section>
    <p id="dictionary-help" className="help-text">複合語が細かく分割される場合は、分割後の単位で登録してください。正規化して同じになる表記は 1 件に統合され、先に書いた表記が残ります。</p>
    <section className="settings-section" aria-label="辞書のバックアップ"><h3>辞書のバックアップ</h3>
      <p>保存済みの 4 象限の辞書を出力します。インポートすると 4 象限の辞書を置き換えます。</p>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => {
        void shareExport(dictionaryExport(dictionaries), exportFileName('dictionaries')).catch(() => toast.notify('エクスポートできませんでした。もう一度お試しください。'));
      }}>辞書をエクスポート</button>
      <label className="file-control">辞書をインポート<input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importFile(file);
      }} /></label>
    </section><SaveFeedback toast={toast} />
  </div></main>;
}
