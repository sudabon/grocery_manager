import { Chip } from './Chip';
import { quadrantLabels, type MemoItem, type QuadrantId } from '../store/useAppStore';

export function Quadrant({ id, chips, onSelect }: { id: QuadrantId; chips: MemoItem[]; onSelect: (id: string) => void }) {
  return <section className={`quadrant ${id}`} aria-label={`${id.toUpperCase()} ${quadrantLabels[id]}`} tabIndex={0}>
    <h2><span className="quadrant-number">{id.toUpperCase()}</span>{quadrantLabels[id]}<span className="chip-count" aria-label={`${chips.length}件`}>{chips.length}</span></h2>
    <ul className="chip-list" role="list">{chips.map((chip) => <Chip key={chip.id} chip={chip} onSelect={onSelect} />)}</ul>
  </section>;
}
