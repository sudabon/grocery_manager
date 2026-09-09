import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InstallHintBanner } from '../InstallHintBanner';
import { useAppStore } from '../../store/useAppStore';
import { defaultSettings } from '../../db/defaults';

beforeEach(() => {
  useAppStore.setState({ settings: { ...defaultSettings }, dismissInstallHint: vi.fn().mockResolvedValue(undefined) });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});
afterEach(() => vi.unstubAllGlobals());
it('閉じると内部設定へ保存し、同じセッションでは即座に隠す', async () => {
  const save = vi.fn().mockResolvedValue(undefined); useAppStore.setState({ dismissInstallHint: save });
  render(<InstallHintBanner />);
  expect(screen.getByText(/共有ボタンから/)).toBeVisible();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'ホーム画面追加の案内を閉じる' })));
  expect(save).toHaveBeenCalled();
  expect(screen.queryByRole('complementary', { name: 'ホーム画面への追加' })).not.toBeInTheDocument();
});
it('記録済みなら表示しない', () => {
  useAppStore.setState({ settings: { ...defaultSettings, installHintDismissed: true } });
  render(<InstallHintBanner />); expect(screen.queryByRole('complementary', { name: 'ホーム画面への追加' })).not.toBeInTheDocument();
});
it.each(['media', 'ios'])('standalone の %s 判定では表示しない', (mode) => {
  if (mode === 'media') vi.stubGlobal('matchMedia', () => ({ matches: true }));
  else vi.stubGlobal('navigator', { standalone: true });
  render(<InstallHintBanner />); expect(screen.queryByRole('complementary', { name: 'ホーム画面への追加' })).not.toBeInTheDocument();
});
it('保存失敗時も現在の案内は閉じ、再訪では再表示できる', async () => {
  useAppStore.setState({ dismissInstallHint: vi.fn().mockResolvedValue(undefined) });
  const view = render(<InstallHintBanner />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'ホーム画面追加の案内を閉じる' })));
  expect(screen.queryByRole('complementary', { name: 'ホーム画面への追加' })).not.toBeInTheDocument();
  view.unmount(); render(<InstallHintBanner />); expect(screen.getByRole('complementary', { name: 'ホーム画面への追加' })).toBeVisible();
});
