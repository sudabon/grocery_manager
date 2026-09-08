import { create } from 'zustand';
import { buildNormalizedDicts, type NormalizedDicts, type QuadrantId } from '../core/classify';
import { sanitizeEntries } from '../core/dictEntries';
import { clampAutoCommitMs } from '../core/settings';
import { skipExistingMemos, type AppData } from '../core/portability';
import { normalize } from '../core/normalize';
import { defaultSettings, seedDictionaries } from '../db/defaults';
import { repository, requestPersistence, type PersistencePermission, type Repository } from '../db/repository';
import type { AppSettings, Dictionary, MemoItem } from '../db/schema';

export type { MemoItem, QuadrantId };
export interface ChipItem extends MemoItem { unsaved?: boolean; highlighted?: boolean }
interface AppStore {
  chips: ChipItem[];
  dictionaries: Dictionary[];
  normalizedDicts: NormalizedDicts;
  settings: AppSettings;
  ready: boolean;
  storageAvailable: boolean;
  persistencePermission: PersistencePermission | null;
  saveErrors: { text: string }[];
  pendingWrites: number;
  initialize: () => Promise<void>;
  dismissSaveError: () => void;
  addChips: (chips: MemoItem[]) => Promise<void>;
  moveChip: (id: string, quadrant: QuadrantId) => Promise<void>;
  editChip: (id: string, text: string) => Promise<void>;
  removeChip: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  saveDictionary: (quadrant: QuadrantId, label: string, rawText: string) => Promise<boolean>;
  updateSettings: (patch: Partial<Omit<AppSettings, 'key'>>) => Promise<boolean>;
  importData: (data: AppData | { dictionaries: Dictionary[] }) => Promise<boolean>;
}
// Strip transient display flags before writing a memo back to IndexedDB.
function persisted(chip: ChipItem): MemoItem {
  const { id, rawText, normText, quadrant, matchedEntry, autoClassified, createdAt, updatedAt } = chip;
  return { id, rawText, normText, quadrant, matchedEntry, autoClassified, createdAt, updatedAt };
}
export function createAppStore(repo: Repository = repository, persist = requestPersistence) {
  let initialization: Promise<void> | undefined;
  let writeQueue = Promise.resolve();
  const highlights = new Map<string, ReturnType<typeof setTimeout>>();
  return create<AppStore>((set, get) => {
    function save(operation: () => Promise<void>, ids: string[]) {
      set((state) => ({ pendingWrites: state.pendingWrites + 1 }));
      // Serialize operations including retries: a late retry must never overwrite a newer edit.
      writeQueue = writeQueue.then(async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await operation();
            set((state) => ({ chips: state.chips.map((chip) => ids.includes(chip.id) ? { ...chip, unsaved: false } : chip) }));
            return;
          } catch {
            if (attempt === 0) continue;
            set((state) => ({
              chips: state.chips.map((chip) => ids.includes(chip.id) ? { ...chip, unsaved: true } : chip),
              saveErrors: [...state.saveErrors, { text: '保存できませんでした。変更は端末に保存されていません。' }],
            }));
          }
        }
      }).finally(() => set((state) => ({ pendingWrites: state.pendingWrites - 1 })));
      return writeQueue;
    }
    function apply(operation: () => Promise<void>): Promise<boolean> {
      set((state) => ({ pendingWrites: state.pendingWrites + 1 }));
      const result = writeQueue.then(async () => {
        try { await operation(); return true; }
        catch {
          set((state) => ({ saveErrors: [...state.saveErrors, { text: '保存できませんでした。変更は端末に保存されていません。' }] }));
          return false;
        }
      }).finally(() => set((state) => ({ pendingWrites: state.pendingWrites - 1 })));
      writeQueue = result.then(() => {});
      return result;
    }
    function highlight(id: string) {
      clearTimeout(highlights.get(id));
      highlights.set(id, setTimeout(() => {
        set((state) => ({ chips: state.chips.map((chip) => chip.id === id ? { ...chip, highlighted: false } : chip) }));
        highlights.delete(id);
      }, 1800));
    }
    return {
      chips: [], dictionaries: seedDictionaries(), normalizedDicts: buildNormalizedDicts([]),
      settings: { ...defaultSettings }, ready: false, storageAvailable: true,
      persistencePermission: null, saveErrors: [], pendingWrites: 0,
      initialize: () => initialization ??= (async () => {
        // Persistence permission is independent and must not delay the memo board.
        void persist().then((persistencePermission) => set({ persistencePermission }));
        let storageAvailable = await repo.probeStorage();
        if (storageAvailable) {
          // Seeding is a write; its failure must not discard memos that can still be read.
          try { await repo.seed(); } catch { storageAvailable = false; }
        }
        try {
          const [chips, dictionaries, settings] = await Promise.all([
            repo.getMemos(), repo.getDictionaries(), repo.getSettings(),
          ]);
          const loadedDicts = dictionaries.length ? dictionaries : seedDictionaries();
          set({ chips, dictionaries: loadedDicts, normalizedDicts: buildNormalizedDicts(loadedDicts), settings: settings ?? { ...defaultSettings } });
        } catch {
          storageAvailable = false;
          const dictionaries = seedDictionaries();
          set({ dictionaries, normalizedDicts: buildNormalizedDicts(dictionaries) });
        }
        set({ ready: true, storageAvailable });
      })(),
      dismissSaveError: () => set((state) => ({ saveErrors: state.saveErrors.slice(1) })),
      addChips: (incoming) => {
        const { settings } = get();
        const chips = [...get().chips];
        const added: MemoItem[] = [];
        for (const item of incoming) {
          const normText = normalize(item.rawText);
          if (!normText) continue;
          const existing = !settings.allowDuplicates ? chips.findIndex((chip) => chip.quadrant === item.quadrant && chip.normText === normText) : -1;
          if (existing !== -1) {
            chips[existing] = { ...chips[existing], highlighted: true };
            highlight(chips[existing].id);
          } else {
            const chip = persisted({ ...item, normText });
            chips.push(chip); added.push(chip);
          }
        }
        set({ chips });
        return added.length ? save(() => repo.putMemos(added), added.map((chip) => chip.id)) : Promise.resolve();
      },
      moveChip: (id, quadrant) => {
        const current = get().chips.find((chip) => chip.id === id);
        if (!current) return Promise.resolve();
        const moved = { ...current, quadrant, autoClassified: false, updatedAt: Date.now() };
        set((state) => ({ chips: state.chips.map((chip) => chip.id === id ? moved : chip) }));
        return save(() => repo.putMemos([persisted(moved)]), [id]);
      },
      editChip: (id, text) => {
        if (!normalize(text)) return get().removeChip(id);
        const current = get().chips.find((chip) => chip.id === id);
        if (!current) return Promise.resolve();
        const edited = { ...current, rawText: text.trim(), normText: normalize(text), matchedEntry: null, autoClassified: false, updatedAt: Date.now() };
        set((state) => ({ chips: state.chips.map((chip) => chip.id === id ? edited : chip) }));
        return save(() => repo.putMemos([persisted(edited)]), [id]);
      },
      removeChip: (id) => {
        set((state) => ({ chips: state.chips.filter((chip) => chip.id !== id) }));
        return save(() => repo.removeMemo(id), [id]);
      },
      clearAll: () => {
        set({ chips: [] });
        return save(() => repo.clearMemos(), []);
      },
      saveDictionary: (quadrant, label, rawText) => apply(async () => {
        const dictionary = { quadrant, label, entries: sanitizeEntries(rawText), updatedAt: Date.now() };
        await repo.saveDictionary(dictionary);
        const dictionaries = get().dictionaries.map((d) => d.quadrant === quadrant ? dictionary : d);
        set({ dictionaries, normalizedDicts: buildNormalizedDicts(dictionaries) });
      }),
      updateSettings: (patch) => apply(async () => {
        const settings = { ...get().settings, ...patch };
        settings.autoCommitMs = clampAutoCommitMs(settings.autoCommitMs);
        await repo.saveSettings(settings);
        set({ settings });
      }),
      importData: (input) => apply(async () => {
        const data = await repo.applyImport(input);
        set((state) => ({ dictionaries: data.dictionaries, normalizedDicts: buildNormalizedDicts(data.dictionaries),
          ...('memos' in input ? { settings: data.settings,
            chips: [...state.chips, ...skipExistingMemos(data.memos, state.chips.map((chip) => chip.id))]
              .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)) } : {}),
        }));
      }),
    };
  });
}
export const useAppStore = createAppStore();
