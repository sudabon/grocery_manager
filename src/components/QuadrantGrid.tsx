import { useMemo } from 'react';
import { useAppStore, type MemoItem, type QuadrantId } from '../store/useAppStore';
import { Quadrant } from './Quadrant';

const visualOrder: QuadrantId[] = ['q2', 'q1', 'q3', 'q4'];
export function QuadrantGrid({ onSelect, readOnly }: { onSelect: (id: string) => void; readOnly?: boolean }) {
  const chips = useAppStore((state) => state.chips);
  const groups = useMemo(() => {
    const result: Record<QuadrantId, MemoItem[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const chip of chips) result[chip.quadrant].push(chip);
    return result;
  }, [chips]);
  return <div className="quadrant-grid" role="group" aria-label="メモボード">
    {visualOrder.map((id) => <Quadrant key={id} id={id} chips={groups[id]} onSelect={onSelect} readOnly={readOnly} />)}
  </div>;
}
