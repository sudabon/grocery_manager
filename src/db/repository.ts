import type { IDBPDatabase } from 'idb';
import { validateAppData, skipExistingMemos, type AppData } from '../core/portability';
import type { QuadrantId } from '../core/classify';
import { defaultSettings, seedDictionaries } from './defaults';
import { getQuadmemoDb, type AppSettings, type Dictionary, type MemoItem, type QuadmemoDb } from './schema';

declare global {
  interface Window { readonly __QUADMEMO_FAIL_WRITES__?: boolean }
}
const byCreation = (a: MemoItem, b: MemoItem) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createRepository(connect: () => Promise<IDBPDatabase<QuadmemoDb>> = getQuadmemoDb) {
  function checkWrite() {
    // Read-only fault injection: no callbacks, data access, or network side effects.
    if (typeof window !== 'undefined' && window.__QUADMEMO_FAIL_WRITES__) throw new Error('Injected write failure');
  }
  return {
    async getAllData(): Promise<AppData> {
      const db = await connect();
      const tx = db.transaction(['memos', 'dictionaries', 'settings']);
      const [memos, dictionaries, settings] = await Promise.all([
        tx.objectStore('memos').getAll(), tx.objectStore('dictionaries').getAll(), tx.objectStore('settings').get('app'),
      ]);
      await tx.done;
      if (!settings || !('partialMatch' in settings)) throw new Error('Settings missing');
      return { memos: memos.sort(byCreation), dictionaries, settings };
    },
    async applyImport(input: AppData | { dictionaries: Dictionary[] }) {
      // Validate the complete input before opening a write transaction.
      const full = 'memos' in input;
      const data = validateAppData(full ? input : { ...input, memos: [], settings: defaultSettings });
      checkWrite();
      const db = await connect();
      const tx = db.transaction(full ? ['memos', 'dictionaries', 'settings'] : ['dictionaries'], 'readwrite');
      const completion = tx.done;
      void completion.catch(() => {});
      try {
        for (const dictionary of data.dictionaries) await tx.objectStore('dictionaries').put(dictionary);
        let added: MemoItem[] = [];
        if (full) {
          const currentSettings = await tx.objectStore('settings').get('app');
          if (currentSettings && 'installHintDismissed' in currentSettings) {
            data.settings.installHintDismissed = currentSettings.installHintDismissed;
          }
          await tx.objectStore('settings').put(data.settings);
          const store = tx.objectStore('memos');
          added = skipExistingMemos(data.memos, await store.getAllKeys());
          for (const memo of added) await store.add(memo);
        }
        await completion;
        return { ...data, memos: added };
      } catch (error) {
        try { tx.abort(); } catch { /* Already aborted or completed. */ }
        await completion.catch(() => {});
        throw error;
      }
    },
    async getMemos(quadrant?: QuadrantId) {
      const db = await connect();
      return (await (quadrant ? db.getAllFromIndex('memos', 'quadrant', quadrant) : db.getAll('memos'))).sort(byCreation);
    },
    async putMemos(memos: MemoItem[]) {
      checkWrite();
      const db = await connect();
      const tx = db.transaction('memos', 'readwrite');
      const completion = tx.done;
      void completion.catch(() => {});
      try {
        for (const memo of memos) await tx.store.put(memo);
        await completion;
      } catch (error) {
        // DataError/DataCloneError can throw synchronously without aborting IDB.
        // Explicitly abort so even that path cannot leave a partially saved batch.
        try { tx.abort(); } catch { /* Already aborted or completed. */ }
        await completion.catch(() => {});
        throw error;
      }
    },
    async removeMemo(id: string) { checkWrite(); await (await connect()).delete('memos', id); },
    async clearMemos() { checkWrite(); await (await connect()).clear('memos'); },
    async getDictionaries() { return (await connect()).getAll('dictionaries'); },
    async saveDictionary(dictionary: Dictionary) { checkWrite(); await (await connect()).put('dictionaries', dictionary); },
    async getSettings(): Promise<AppSettings | undefined> {
      const value = await (await connect()).get('settings', 'app');
      return value && 'partialMatch' in value ? value : undefined;
    },
    async saveSettings(settings: AppSettings) { checkWrite(); await (await connect()).put('settings', settings); },
    async seed() {
      const db = await connect();
      const tx = db.transaction(['dictionaries', 'settings'], 'readwrite');
      // Keep the transaction alive using IDB requests only, and observe aborts via tx.done.
      await Promise.all([tx.done, (async () => {
        const dictionaries = tx.objectStore('dictionaries');
        if (await dictionaries.count() === 0) for (const dict of seedDictionaries()) await dictionaries.put(dict);
        const settings = tx.objectStore('settings');
        if (await settings.count() === 0) await settings.put(defaultSettings);
      })()]);
    },
    async probeStorage(): Promise<boolean> {
      try {
        const db = await connect();
        const token = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
        const key = `probe:${token()}`;
        const probe = token();
        await db.put('settings', { key, probe });
        const result = await db.get('settings', key);
        await db.delete('settings', key);
        return !!result && 'probe' in result && result.probe === probe;
      } catch { return false; }
    },
  };
}
export const repository = createRepository();
export type Repository = ReturnType<typeof createRepository>;
export type PersistencePermission = 'granted' | 'denied' | 'unsupported';
export async function requestPersistence(): Promise<PersistencePermission> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try { return await navigator.storage.persist() ? 'granted' : 'denied'; }
  catch { return 'denied'; }
}
