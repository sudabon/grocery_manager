import { quadrantRemaining } from '../core/quadrantLength';
import { Chip } from './Chip';
import { QUADRANT_LABELS } from '../db/defaults';
import type { ChipItem, QuadrantId } from '../store/useAppStore';

export function Quadrant({ id, chips, onSelect }: { id: QuadrantId; chips: ChipItem[]; onSelect: (id: string) => void }) {
  const label = QUADRANT_LABELS[id];
  return <section className={`quadrant ${id}`} aria-label={`${id.toUpperCase()} ${label}`} tabIndex={0}>
    <h2><span className="quadrant-number">{id.toUpperCase()}</span>{label}<span className="quadrant-remaining">残り{quadrantRemaining(chips, id)}文字</span></h2>
    <ul className="chip-list" role="list">{chips.map((chip) => <Chip key={chip.id} chip={chip} onSelect={onSelect} />)}</ul>
  </section>;
}
