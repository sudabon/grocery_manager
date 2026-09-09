import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    // Keep the deployment entrypoint explicit, including when virtual:pwa-register is used.
    injectRegister: 'script-defer',
    includeManifestIcons: false, // Icons are already covered by the precache glob below.
    manifest: {
      name: 'QuadMemo', short_name: 'QuadMemo', lang: 'ja',
      display: 'standalone', orientation: 'portrait', start_url: '/', scope: '/',
      theme_color: '#1a1a2e', background_color: '#1a1a2e',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{html,js,css,png,svg}'],
      navigateFallback: '/index.html',
      clientsClaim: true,
      skipWaiting: false,
      runtimeCaching: [],
    },
  })],
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
