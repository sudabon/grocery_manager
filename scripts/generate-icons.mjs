// Local authoring tool only; deliberately not part of the application build.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const svg = await readFile(new URL('../design/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
try {
  for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon-180', 180]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>body{margin:0}svg{width:100vw;height:100vh;display:block}</style>${svg}`);
    await page.screenshot({ path: fileURLToPath(new URL(`../public/icons/${name}.png`, import.meta.url)) });
    await page.close();
  }
} finally { await browser.close(); }
