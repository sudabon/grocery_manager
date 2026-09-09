import type { Page } from '@playwright/test';

export async function displayMode(page: Page, mode: 'browser' | 'media' | 'ios') {
  await page.addInitScript((mode) => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = original(query);
      if (query === '(display-mode: standalone)') Object.defineProperty(result, 'matches', { value: mode === 'media' });
      return result;
    };
    Object.defineProperty(navigator, 'standalone', { value: mode === 'ios', configurable: true });
  }, mode);
}

// D7: inject the browser's waiting state, keeping registration and precache real.
// This exercises notification UI only; applying a real second generation is a device acceptance test.
export async function waitingServiceWorker(page: Page) {
  await page.addInitScript(() => {
    const original = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = async (...args) => {
      const registration = await original(...args);
      const waiting = Object.assign(new EventTarget(), {
        state: 'installed', scriptURL: new URL('/sw.js', location.href).href,
      });
      Object.defineProperty(registration, 'waiting', { get: () => waiting, configurable: true });
      return registration;
    };
  });
}
