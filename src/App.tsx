import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { MemoPage } from './pages/MemoPage';
import { DictionariesPage } from './pages/DictionariesPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAppStore } from './store/useAppStore';
import { UpdateToast } from './components/UpdateToast';
import { InstallHintBanner } from './components/InstallHintBanner';
import { usePwaState } from './pwa/usePwaState';

export function App() {
  const { pathname } = useLocation();
  const ready = useAppStore((state) => state.ready);
  const { offlineReady } = usePwaState();
  useEffect(() => { void useAppStore.getState().initialize(); }, []);
  useEffect(() => {
    document.title = `${pathname === '/dictionaries' ? '辞書編集' : pathname === '/settings' ? '設定' : 'メモ'} | QuadMemo`;
  }, [pathname]);
  return <div className="app-shell" id="app-shell">
    <header className="app-header">
      <Link to="/dictionaries">辞書編集</Link>
      <div className="app-title"><h1>QuadMemo</h1>{offlineReady && <small>オフライン利用可</small>}</div>
      <Link to="/settings">設定</Link>
    </header>
    <UpdateToast />
    {ready && <InstallHintBanner />}
    {ready ? <Routes>
      <Route path="/" element={<MemoPage />} />
      <Route path="/dictionaries" element={<DictionariesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes> : <p role="status">メモを読み込んでいます…</p>}
  </div>;
}
