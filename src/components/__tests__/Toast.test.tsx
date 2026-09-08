import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Toast, useToast } from '../Toast';
afterEach(() => vi.useRealTimers());
it('同じ通知も単一キューで順に表示し自動消滅する', () => {
  vi.useFakeTimers();
  function Harness() {
    const toast = useToast();
    return <><button onClick={() => toast.notify('50件のみ登録')}>通知</button><Toast message={toast.message} dismiss={toast.dismiss} /></>;
  }
  render(<Harness />); fireEvent.click(screen.getByRole('button')); fireEvent.click(screen.getByRole('button'));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(4000)); expect(screen.getByRole('status')).toHaveTextContent('50件のみ登録');
  act(() => vi.advanceTimersByTime(4000)); expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
