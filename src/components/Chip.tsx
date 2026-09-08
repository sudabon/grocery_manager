import { memo } from 'react';
import type { MemoItem } from '../store/useAppStore';

export const Chip = memo(function Chip({ chip, onSelect }: { chip: MemoItem; onSelect: (id: string) => void }) {
  const unmatched = chip.matchedEntry === null;
  return <li><button type="button" className={`chip${unmatched ? ' chip-unmatched' : ''}`}
    aria-label={`メモ「${chip.rawText}」${unmatched ? '（未分類）' : ''}`}
    aria-haspopup="dialog" onClick={() => onSelect(chip.id)}>{chip.rawText}</button></li>;
});
