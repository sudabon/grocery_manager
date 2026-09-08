import { readFile } from 'node:fs/promises';
import { test as base, expect } from './classification';
import { DictionariesPage } from '../pages/DictionariesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { configureShare, sharedFiles } from '../mocks/web-share';
import type { Download } from '@playwright/test';
export const test = base.extend<{
  shareMode: 'env:no-web-share' | 'env:web-share-stub'; shareEnvironment: void;
  dictionaries: DictionariesPage; settingsPage: SettingsPage; readSharedFiles: () => ReturnType<typeof sharedFiles>;
}>({
  shareMode: ['env:no-web-share', { option: true }],
  shareEnvironment: [async ({ page, shareMode }, use) => { await configureShare(page, shareMode); await use(); }, { auto: true }],
  dictionaries: async ({ page, memo }, use) => { void memo; await use(new DictionariesPage(page)); },
  settingsPage: async ({ page, memo }, use) => { void memo; await use(new SettingsPage(page)); },
  readSharedFiles: async ({ page }, use) => { await use(() => sharedFiles(page)); },
});
export async function readDownload(download: Download) { return JSON.parse(await readFile((await download.path())!, 'utf8')); }
export const fixtureFile = (name: string) => new URL(`./files/${name}`, import.meta.url).pathname;
export { expect };
