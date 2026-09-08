import { memo } from 'react';
import type { ChipItem } from '../store/useAppStore';

export const Chip = memo(function Chip({ chip, onSelect }: { chip: ChipItem; onSelect: (id: string) => void }) {
  const unmatched = chip.matchedEntry === null;
  return <li><button type="button" className={`chip${unmatched ? ' chip-unmatched' : ''}${chip.highlighted ? ' chip-highlighted' : ''}${chip.unsaved ? ' chip-unsaved' : ''}`}
    aria-label={`メモ「${chip.rawText}」${unmatched ? '（未分類）' : ''}${chip.unsaved ? '（未保存）' : ''}${chip.highlighted ? '（重複のため追加をスキップ）' : ''}`}
    aria-haspopup="dialog" onClick={() => onSelect(chip.id)}>{chip.rawText}{chip.unsaved && <span aria-hidden="true"> ⚠</span>}</button></li>;
});
