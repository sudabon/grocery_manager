import { quadrantRemaining } from '../core/quadrantLength';
import { Chip } from './Chip';
import { QUADRANT_LABELS } from '../db/defaults';
import type { ChipItem, QuadrantId } from '../store/useAppStore';

export function Quadrant({ id, chips, onSelect, readOnly }: { id: QuadrantId; chips: ChipItem[]; onSelect: (id: string) => void; readOnly?: boolean }) {
  const label = QUADRANT_LABELS[id];
  return <section className={`quadrant ${id}`} aria-label={`${id.toUpperCase()} ${label}`} tabIndex={0}>
    {/* 残り容量は追加できるボードでのみ意味を持つので、参照専用の過去ボードでは出さない。 */}
    <h2><span className="quadrant-number">{id.toUpperCase()}</span>{label}
      {!readOnly && <span className="quadrant-remaining">残り{quadrantRemaining(chips, id)}文字</span>}</h2>
    <ul className="chip-list" role="list">{chips.map((chip) => <Chip key={chip.id} chip={chip} onSelect={onSelect} readOnly={readOnly} />)}</ul>
  </section>;
}
