import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { MemoPage } from './pages/MemoPage';
import { DictionariesPage } from './pages/DictionariesPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${pathname === '/dictionaries' ? '辞書編集' : pathname === '/settings' ? '設定' : 'メモ'} | QuadMemo`;
  }, [pathname]);
  return <div className="app-shell" id="app-shell">
    <header className="app-header">
      <Link to="/dictionaries">辞書編集</Link>
      <h1>QuadMemo</h1>
      <Link to="/settings">設定</Link>
    </header>
    <Routes>
      <Route path="/" element={<MemoPage />} />
      <Route path="/dictionaries" element={<DictionariesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  </div>;
}
