import { create } from 'zustand';
import { todayBoardDate } from '../core/boardDate';
import { buildNormalizedDicts, type NormalizedDicts, type QuadrantId } from '../core/classify';
import { sanitizeEntries } from '../core/dictEntries';
import { clampAutoCommitMs } from '../core/settings';
import { skipExistingMemos, type AppData } from '../core/portability';
import { assertQuadrantLimit, quadrantLength, QUADRANT_TEXT_LIMIT, QuadrantLimitError } from '../core/quadrantLength';
import { normalize } from '../core/normalize';
import { defaultSettings, QUADRANT_LABELS, seedDictionaries } from '../db/defaults';
import { repository, requestPersistence, type PersistencePermission, type Repository } from '../db/repository';
import type { AppSettings, Dictionary, MemoItem } from '../db/schema';

export type { MemoItem, QuadrantId };
export type ChipOpResult = { ok: true } | { ok: false; reason: 'quadrant-limit' | 'not-found' | 'read-only' };
export interface AddChipsResult { added: number; rejected: number; readOnly?: boolean }
/** 当日でないボードへの書き込みを断ったときの案内（design.md - Risks / Trade-offs）。 */
export const BOARD_READ_ONLY_MESSAGE = '日付が変わりました。次にメモ画面を開くと当日のボードが表示されます。';
export interface ChipItem extends MemoItem { unsaved?: boolean; highlighted?: boolean }
/** 追加時に渡すチップ。所属する日付は表示中のボードから決まるので呼び出し側は持たない（design.md - D4）。 */
export type NewMemo = Omit<MemoItem, 'boardDate'>;
interface AppStore {
  /** 表示中のボードの日付（JST の `YYYY-MM-DD`）。 */
  viewingBoardDate: string;
  /**
   * 表示中のボードが当日かどうか。ボードを選んだ時点の判定を保持する。
   * 表示中に日付が変わってもボードを切り替えない（spec: 表示中のボードは切り替えない）ため、
   * 画面の見え方はこの値に従い、書き込みの可否だけは毎回 `todayBoardDate()` で判定する。
   */
  viewingIsToday: boolean;
  chips: ChipItem[];
  dictionaries: Dictionary[];
  normalizedDicts: NormalizedDicts;
  settings: AppSettings;
  ready: boolean;
  dataLoaded: boolean;
  storageAvailable: boolean;
  persistencePermission: PersistencePermission | null;
  saveErrors: { text: string }[];
  pendingWrites: number;
  initialize: () => Promise<void>;
  viewBoard: (boardDate: string) => Promise<void>;
  listBoardDates: () => Promise<string[]>;
  listAllMemos: () => Promise<MemoItem[] | null>;
  dismissSaveError: () => void;
  addChips: (chips: NewMemo[]) => Promise<AddChipsResult>;
  moveChip: (id: string, quadrant: QuadrantId) => Promise<ChipOpResult>;
  editChip: (id: string, text: string) => Promise<ChipOpResult>;
  removeChip: (id: string) => Promise<void>;
  clearAll: () => Promise<boolean>;
  saveDictionary: (quadrant: QuadrantId, rawText: string) => Promise<boolean>;
  updateSettings: (patch: Partial<Omit<AppSettings, 'key' | 'installHintDismissed'>>) => Promise<boolean>;
  dismissInstallHint: () => Promise<void>;
  importData: (data: AppData | { dictionaries: Dictionary[] }) => Promise<boolean>;
}
// Strip transient display flags before writing a memo back to IndexedDB.
function persisted(chip: ChipItem): MemoItem {
  const { id, boardDate, rawText, normText, quadrant, matchedEntry, autoClassified, createdAt, updatedAt } = chip;
  return { id, boardDate, rawText, normText, quadrant, matchedEntry, autoClassified, createdAt, updatedAt };
}
export function createAppStore(repo: Repository = repository, persist = requestPersistence) {
  let initialization: Promise<void> | undefined;
  let writeQueue = Promise.resolve();
  let memoImport: Promise<boolean> | undefined;
  // メモを伴うインポートの完了を待つ。待機中に次のインポートが始まると memoImport は別の
  // Promise に差し替わる（importData の `if (memoImport === result)` ガードにより、先行分の
  // finally は後発分を解除しない）。これを捕まえるため if ではなく while で再評価する。
  // インポートが無いときは呼び出し側で await を省き、通常操作の即時状態更新を保つ。
  async function awaitMemoImport() { while (memoImport) await memoImport; }
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
    // apply() is pessimistic: state changes only after the write resolves, so a failure leaves state untouched and returns false.
    // It deliberately does NOT retry: the caller shows the failure and the user can repeat the action, because
    // nothing on screen changed. save() is optimistic and must retry, since it already committed the change to
    // the UI and a late failure would otherwise leave the screen disagreeing with the database.
    // `failureText: null` suppresses the notice while keeping the write queued and counted.
    // Use it for actions whose failure the user does not need to act on (see dismissInstallHint).
    // `limitText` は QuadrantLimitError 専用の差し替え文言。未指定なら failureText に落ちるため、上限超過であることは利用者に伝わらない。
    function apply(operation: () => Promise<void>, options: { failureText?: string | null; limitText?: string } = {}): Promise<boolean> {
      const failureText = options.failureText === undefined ? '保存できませんでした。変更は端末に保存されていません。' : options.failureText;
      set((state) => ({ pendingWrites: state.pendingWrites + 1 }));
      const result = writeQueue.then(async () => {
        try { await operation(); return true; }
        catch (error) {
          const message = error instanceof QuadrantLimitError && options.limitText ? options.limitText : failureText;
          if (message) set((state) => ({ saveErrors: [...state.saveErrors, { text: message }] }));
          return false;
        }
      }).finally(() => set((state) => ({ pendingWrites: state.pendingWrites - 1 })));
      writeQueue = result.then(() => {});
      return result;
    }
    async function writeSettings(patch: Partial<AppSettings>) {
      const settings = { ...get().settings, ...patch };
      settings.autoCommitMs = clampAutoCommitMs(settings.autoCommitMs);
      await repo.saveSettings(settings);
      set({ settings });
    }
    function highlight(id: string) {
      clearTimeout(highlights.get(id));
      highlights.set(id, setTimeout(() => {
        set((state) => ({ chips: state.chips.map((chip) => chip.id === id ? { ...chip, highlighted: false } : chip) }));
        highlights.delete(id);
      }, 1800));
    }
    // 書き込みは表示中のボードが当日のときだけ許す（design.md - D4）。判定は毎回いまの日付で行うので、
    // ボードを表示したまま日付が変わった場合も、その瞬間から前日のボードへは書けない。
    function writable() { return get().viewingBoardDate === todayBoardDate(); }
    return {
      viewingBoardDate: todayBoardDate(), viewingIsToday: true,
      chips: [], dictionaries: seedDictionaries(), normalizedDicts: buildNormalizedDicts([]),
      settings: { ...defaultSettings }, ready: false, dataLoaded: false, storageAvailable: true,
      persistencePermission: null, saveErrors: [], pendingWrites: 0,
      initialize: () => initialization ??= (async () => {
        // Persistence permission is independent and must not delay the memo board.
        void persist().then((persistencePermission) => set({ persistencePermission }));
        let storageAvailable = await repo.probeStorage();
        if (storageAvailable) {
          // Seeding is a write; its failure must not discard memos that can still be read.
          try { await repo.seed(); } catch { storageAvailable = false; }
        }
        // 起動時は必ず当日のボードを表示し、その日付のチップだけを読む（design.md - D3）。
        const viewingBoardDate = todayBoardDate();
        set({ viewingBoardDate, viewingIsToday: true });
        try {
          const [chips, dictionaries, settings] = await Promise.all([
            repo.getMemos({ boardDate: viewingBoardDate }), repo.getDictionaries(), repo.getSettings(),
          ]);
          const loadedDicts = dictionaries.length ? dictionaries : seedDictionaries();
          set({ chips, dictionaries: loadedDicts, normalizedDicts: buildNormalizedDicts(loadedDicts), settings: settings ?? { ...defaultSettings }, dataLoaded: true });
        } catch {
          storageAvailable = false;
          const dictionaries = seedDictionaries();
          set({ dictionaries, normalizedDicts: buildNormalizedDicts(dictionaries) });
        }
        set({ ready: true, storageAvailable });
      })(),
      viewBoard: async (boardDate) => {
        // 同じボードの読み直しはしない。保存に失敗して画面にだけ残るチップを消さないため。
        if (get().viewingBoardDate === boardDate) return;
        set({ viewingBoardDate: boardDate, viewingIsToday: boardDate === todayBoardDate(), chips: [] });
        try {
          const chips = await repo.getMemos({ boardDate });
          // 読み込み中に別のボードへ切り替わっていたら、古い結果は捨てる。
          if (get().viewingBoardDate === boardDate) set({ chips });
        } catch {
          set({ storageAvailable: false });
        }
      },
      listBoardDates: async () => {
        try { return await repo.getBoardDates(); }
        catch { set({ storageAvailable: false }); return []; }
      },
      // 全データのエクスポートは表示中のボードに限らない。chips は表示中のボードだけなので、
      // 全メモはここで読み直す。読めなかったことを空リストと区別できるよう null を返す。
      listAllMemos: async () => {
        try { return await repo.getMemos(); }
        catch { set({ storageAvailable: false }); return null; }
      },
      dismissSaveError: () => set((state) => ({ saveErrors: state.saveErrors.slice(1) })),
      addChips: async (incoming) => {
        if (memoImport) await awaitMemoImport();
        if (!writable()) return { added: 0, rejected: 0, readOnly: true };
        const { settings, viewingBoardDate } = get();
        const chips = [...get().chips];
        const added: MemoItem[] = [];
        let rejected = 0;
        for (const item of incoming) {
          const normText = normalize(item.rawText);
          if (!normText) continue;
          const existing = !settings.allowDuplicates ? chips.findIndex((chip) => chip.quadrant === item.quadrant && chip.normText === normText) : -1;
          if (existing !== -1) {
            chips[existing] = { ...chips[existing], highlighted: true };
            highlight(chips[existing].id);
          } else {
            const chip = persisted({ ...item, normText, boardDate: viewingBoardDate });
            if (quadrantLength([...chips, chip], chip.quadrant) > QUADRANT_TEXT_LIMIT) { rejected++; continue; }
            chips.push(chip); added.push(chip);
          }
        }
        set({ chips });
        if (added.length) await save(() => repo.putMemos(added), added.map((chip) => chip.id));
        return { added: added.length, rejected };
      },
      moveChip: async (id, quadrant) => {
        if (memoImport) await awaitMemoImport();
        if (!writable()) return { ok: false, reason: 'read-only' };
        const current = get().chips.find((chip) => chip.id === id);
        if (!current) return { ok: false, reason: 'not-found' };
        if (current.quadrant === quadrant) return { ok: true };
        const moved = { ...current, quadrant, autoClassified: false, updatedAt: Date.now() };
        const chips = get().chips.map((chip) => chip.id === id ? moved : chip);
        if (quadrantLength(chips, quadrant) > QUADRANT_TEXT_LIMIT) return { ok: false, reason: 'quadrant-limit' };
        set({ chips });
        await save(() => repo.putMemos([persisted(moved)]), [id]);
        return { ok: true };
      },
      editChip: async (id, text) => {
        if (memoImport) await awaitMemoImport();
        if (!writable()) return { ok: false, reason: 'read-only' };
        if (!normalize(text)) { await get().removeChip(id); return { ok: true }; }
        const current = get().chips.find((chip) => chip.id === id);
        if (!current) return { ok: false, reason: 'not-found' };
        const edited = { ...current, rawText: text.trim(), normText: normalize(text), matchedEntry: null, autoClassified: false, updatedAt: Date.now() };
        const chips = get().chips.map((chip) => chip.id === id ? edited : chip);
        const before = quadrantLength(get().chips, current.quadrant);
        const after = quadrantLength(chips, current.quadrant);
        // 旧データの超過を救済するため、超過状態でも本文が短くなる編集は通す。moveChip は必ず増加側なので同じ救済を持たない。
        if (after > QUADRANT_TEXT_LIMIT && after > before) return { ok: false, reason: 'quadrant-limit' };
        set({ chips });
        await save(() => repo.putMemos([persisted(edited)]), [id]);
        return { ok: true };
      },
      removeChip: async (id) => {
        if (memoImport) await awaitMemoImport();
        if (!writable()) return;
        set((state) => ({ chips: state.chips.filter((chip) => chip.id !== id) }));
        await save(() => repo.removeMemo(id), [id]);
      },
      clearAll: () => apply(async () => {
        await repo.clearMemos();
        set({ chips: [] });
      }, { failureText: 'メモを削除できませんでした。メモは削除されていません。' }),
      saveDictionary: (quadrant, rawText) => apply(async () => {
        const dictionary = { quadrant, label: QUADRANT_LABELS[quadrant], entries: sanitizeEntries(rawText), updatedAt: Date.now() };
        await repo.saveDictionary(dictionary);
        const dictionaries = get().dictionaries.map((d) => d.quadrant === quadrant ? dictionary : d);
        set({ dictionaries, normalizedDicts: buildNormalizedDicts(dictionaries) });
      }),
      updateSettings: (patch) => apply(() => writeSettings(patch)),
      // 利用者は何も保存していないため汎用の保存失敗通知は出さない。ただし書き込み自体は
      // apply() のキューと pendingWrites に載せる（保存前に再読み込みされると案内が復活するため）。
      // 保存不可環境ではフラグを残せず次回起動時にも案内が出ることを許容する。
      // apply() のキューに載せるのは、保存完了を pendingWrites 経由で観測可能にするため
      // （E2E の TP-010 が閉じた後の再読み込みでこれに依存する）。副作用として
      // 設定画面の保存系ボタンが書き込み中だけ disabled になることを許容する。
      dismissInstallHint: async () => {
        await apply(async () => {
          try { await writeSettings({ installHintDismissed: true }); }
          catch (error) {
            // 利用者には通知しないが、恒久的に書けない端末を切り分けられるよう痕跡は残す。
            console.warn('[settings] install hint dismissal not persisted', error);
            throw error;
          }
        }, { failureText: null });
      },
      importData: (input) => {
        const result = apply(async () => {
          if ('memos' in input) {
            const chips = get().chips;
            // 保存失敗で画面にだけ残るメモも容量に含める。保存層では別途、実データを同一 tx 内で確認する。
            assertQuadrantLimit([...chips, ...skipExistingMemos(input.memos, chips.map((chip) => chip.id))]);
          }
          const data = await repo.applyImport(input);
          set((state) => ({ dictionaries: data.dictionaries, normalizedDicts: buildNormalizedDicts(data.dictionaries),
            ...(data.settings ? { settings: data.settings,
              // 取り込んだメモのうち、表示中のボードの日付のものだけを画面へ載せる。
              // 他の日付のメモは保存済みで、その日付のボードを開いたときに現れる。
              chips: [...state.chips, ...skipExistingMemos(data.memos, state.chips.map((chip) => chip.id))
                .filter((memo) => memo.boardDate === state.viewingBoardDate)]
                .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)) } : {}),
          }));
        }, {
          failureText: 'インポートできませんでした。データは変更されていません。',
          limitText: `インポートできませんでした。象限の${QUADRANT_TEXT_LIMIT}文字上限を超えています。データは変更されていません。`,
        });
        if ('memos' in input) {
          memoImport = result;
          void result.finally(() => { if (memoImport === result) memoImport = undefined; });
        }
        return result;
      },
    };
  });
}
export const useAppStore = createAppStore();
