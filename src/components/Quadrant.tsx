import { Chip } from './Chip';
import { useAppStore, type ChipItem, type QuadrantId } from '../store/useAppStore';

export function Quadrant({ id, chips, onSelect }: { id: QuadrantId; chips: ChipItem[]; onSelect: (id: string) => void }) {
  const label = useAppStore((state) => state.dictionaries.find((dict) => dict.quadrant === id)?.label ?? '');
  return <section className={`quadrant ${id}`} aria-label={`${id.toUpperCase()} ${label}`} tabIndex={0}>
    <h2><span className="quadrant-number">{id.toUpperCase()}</span>{label}<span className="chip-count" aria-label={`${chips.length}件`}>{chips.length}</span></h2>
    <ul className="chip-list" role="list">{chips.map((chip) => <Chip key={chip.id} chip={chip} onSelect={onSelect} />)}</ul>
  </section>;
}
