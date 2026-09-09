import { memo } from 'react';
import type { ChipItem } from '../store/useAppStore';

export const Chip = memo(function Chip({ chip, onSelect, readOnly }: { chip: ChipItem; onSelect: (id: string) => void; readOnly?: boolean }) {
  const unmatched = chip.matchedEntry === null;
  // 過去のボードは参照専用なので、開かないアクションシートを予告せず、操作もできない状態で見せる。
  return <li><button type="button" className={`chip${unmatched ? ' chip-unmatched' : ''}${chip.highlighted ? ' chip-highlighted' : ''}${chip.unsaved ? ' chip-unsaved' : ''}`}
    aria-label={`メモ「${chip.rawText}」${unmatched ? '（未分類）' : ''}${chip.unsaved ? '（未保存）' : ''}${chip.highlighted ? '（重複のため追加をスキップ）' : ''}`}
    disabled={readOnly} aria-haspopup={readOnly ? undefined : 'dialog'}
    onClick={readOnly ? undefined : () => onSelect(chip.id)}>{chip.rawText}{chip.unsaved && <span aria-hidden="true"> ⚠</span>}</button></li>;
});
