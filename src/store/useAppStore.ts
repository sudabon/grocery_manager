import { create } from 'zustand';

export type QuadrantId = 'q1' | 'q2' | 'q3' | 'q4';
export const quadrantLabels: Record<QuadrantId, string> = {
  q1: '仕事', q2: '家庭', q3: '買い物', q4: 'その他',
};
export interface MemoItem {
  id: string;
  rawText: string;
  normText: string;
  quadrant: QuadrantId;
  matchedEntry: string | null;
  autoClassified: boolean;
  createdAt: number;
  updatedAt: number;
}
interface AppStore {
  chips: MemoItem[];
  settings: { autoCommitMs: number; showDictationHint: boolean };
  addChips: (chips: MemoItem[]) => void;
  moveChip: (id: string, quadrant: QuadrantId) => void;
  editChip: (id: string, text: string) => void;
  removeChip: (id: string) => void;
  clearAll: () => void;
}
export const useAppStore = create<AppStore>((set) => ({
  chips: [],
  settings: { autoCommitMs: 1500, showDictationHint: true },
  addChips: (chips) => set((state) => ({ chips: [...state.chips, ...chips] })),
  moveChip: (id, quadrant) => set((state) => ({
    chips: state.chips.map((chip) => chip.id === id ? {
      ...chip, quadrant, autoClassified: false, updatedAt: Date.now(),
    } : chip),
  })),
  editChip: (id, text) => set((state) => ({
    chips: text.trim() ? state.chips.map((chip) => chip.id === id ? {
      ...chip, rawText: text.trim(), normText: text.trim(), matchedEntry: null,
      autoClassified: false, updatedAt: Date.now(),
    } : chip) : state.chips.filter((chip) => chip.id !== id),
  })),
  removeChip: (id) => set((state) => ({ chips: state.chips.filter((chip) => chip.id !== id) })),
  clearAll: () => set({ chips: [] }),
}));
