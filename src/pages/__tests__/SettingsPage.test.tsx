import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { SettingsPage } from '../SettingsPage';
import { defaultSettings, seedDictionaries } from '../../db/defaults';
import { useAppStore } from '../../store/useAppStore';
import { shareExport } from '../../core/shareExport';

vi.mock('../../core/shareExport', () => ({ shareExport: vi.fn() }));
vi.mock('../../pwa/usePwaState', () => ({
  usePwaState: () => ({ status: 'registered', offlineReady: true }),
}));

beforeEach(() => {
  vi.mocked(shareExport).mockReset();
  useAppStore.setState({
    settings: { ...defaultSettings }, dictionaries: seedDictionaries(), chips: [],
    pendingWrites: 0, saveErrors: [], dataLoaded: true, storageAvailable: true,
  });
});

it('エクスポートの同期検証エラーをトーストに変換し、共有処理を開始しない', () => {
  useAppStore.setState({ settings: { ...defaultSettings, autoCommitMs: NaN } });
  render(<MemoryRouter><SettingsPage /></MemoryRouter>);
  expect(() => fireEvent.click(screen.getByRole('button', { name: '全データをエクスポート' }))).not.toThrow();
  expect(screen.getByRole('status')).toHaveTextContent('エクスポートできませんでした。もう一度お試しください。');
  expect(shareExport).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '全データをエクスポート' })).toBeEnabled();
});
