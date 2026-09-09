import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ChipActionSheet } from '../ChipActionSheet';
import { QUADRANT_LIMIT_MESSAGE } from '../../core/quadrantLength';
import { defaultSettings, seedDictionaries } from '../../db/defaults';
import { useAppStore } from '../../store/useAppStore';

// Modal は #app-shell を参照するため（Modal.tsx）、ポータル先の土台を用意する。
beforeEach(() => {
  document.body.innerHTML = '<div id="app-shell"></div>';
  useAppStore.setState({
    chips: [{ id: 'a', rawText: 'apple', normText: 'apple', quadrant: 'q1', matchedEntry: null, autoClassified: false, createdAt: 1, updatedAt: 1 }],
    dictionaries: seedDictionaries(), settings: { ...defaultSettings },
  });
});

it('移動先のメモが見つからないときはシートを閉じて案内する', async () => {
  const onClose = vi.fn(); const notify = vi.fn();
  useAppStore.setState({ moveChip: vi.fn().mockResolvedValue({ ok: false, reason: 'not-found' }) });
  render(<ChipActionSheet id="a" onClose={onClose} notify={notify} />);
  fireEvent.click(screen.getByRole('button', { name: 'Q2 野菜へ移動' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith('メモが見つかりませんでした。'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('上限で拒否されたときはシートを閉じずに案内する', async () => {
  const onClose = vi.fn(); const notify = vi.fn();
  useAppStore.setState({ moveChip: vi.fn().mockResolvedValue({ ok: false, reason: 'quadrant-limit' }) });
  render(<ChipActionSheet id="a" onClose={onClose} notify={notify} />);
  fireEvent.click(screen.getByRole('button', { name: 'Q2 野菜へ移動' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(QUADRANT_LIMIT_MESSAGE));
  expect(onClose).not.toHaveBeenCalled();
});

it('移動が拒否で終わってもシートを閉じて案内する', async () => {
  const onClose = vi.fn(); const notify = vi.fn();
  useAppStore.setState({ moveChip: vi.fn().mockRejectedValue(new Error('boom')) });
  render(<ChipActionSheet id="a" onClose={onClose} notify={notify} />);
  fireEvent.click(screen.getByRole('button', { name: 'Q2 野菜へ移動' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith('操作できませんでした。もう一度お試しください。'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
