import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { MemoPage } from './pages/MemoPage';
import { DictionariesPage } from './pages/DictionariesPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAppStore } from './store/useAppStore';

export function App() {
  const { pathname } = useLocation();
  const ready = useAppStore((state) => state.ready);
  useEffect(() => { void useAppStore.getState().initialize(); }, []);
  useEffect(() => {
    document.title = `${pathname === '/dictionaries' ? '辞書編集' : pathname === '/settings' ? '設定' : 'メモ'} | QuadMemo`;
  }, [pathname]);
  return <div className="app-shell" id="app-shell">
    <header className="app-header">
      <Link to="/dictionaries">辞書編集</Link>
      <h1>QuadMemo</h1>
      <Link to="/settings">設定</Link>
    </header>
    {ready ? <Routes>
      <Route path="/" element={<MemoPage />} />
      <Route path="/dictionaries" element={<DictionariesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes> : <p role="status">メモを読み込んでいます…</p>}
  </div>;
}
