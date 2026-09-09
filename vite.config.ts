import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    // manifest アイコンの自動追加と glob で PNG 2件が重複し、8件から10件になるのを防ぐ。
    // アイコンは下の precache glob で含める。
    includeManifestIcons: false,
    manifest: {
      name: 'QuadMemo', short_name: 'QuadMemo', lang: 'ja',
      display: 'standalone', orientation: 'portrait', start_url: '/', scope: '/',
      theme_color: '#1a1a2e', background_color: '#1a1a2e',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // precache は html/js/css/png/svg のみ。runtimeCaching を空にしているため、
      // このパターンから外れる配信物（.ico / .woff2 / .txt など）はオフラインで
      // フォールバック無しに失敗する。public/ に新しい種類の配信物を追加するときは
      // このパターンにも追加すること。
      globPatterns: ['**/*.{html,js,css,png,svg}'],
      navigateFallback: '/index.html',
      clientsClaim: true,
      skipWaiting: false,
      runtimeCaching: [],
    },
  })],
  server: { port: 3000, strictPort: true },
  preview: { port: 3001, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
