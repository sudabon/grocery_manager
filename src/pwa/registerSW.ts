import { registerSW } from 'virtual:pwa-register';

export interface PwaState {
  status: 'unregistered' | 'registered' | 'waiting';
  offlineReady: boolean;
}

// One registration and one set of browser listeners, shared by all UI subscribers.
// The factory lets unit tests exercise the real subscription layer with an injected registrar.
export function createPwaClient(register = registerSW) {
  let state: PwaState = { status: 'unregistered', offlineReady: false };
  const listeners = new Set<() => void>();
  const updates = new Set<() => void>();
  let started = false;
  let applyUpdate: ReturnType<typeof registerSW> | undefined;
  let updating: Promise<void> | undefined;
  let waitingForControl = false;
  function publish(patch: Partial<PwaState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  function needRefresh() {
    publish({ status: 'waiting' });
    updates.forEach((listener) => listener());
  }
  function observeOfflineReady() {
    if (waitingForControl) return;
    waitingForControl = true;
    void navigator.serviceWorker.ready.then(() => {
      if (navigator.serviceWorker.controller) publish({ offlineReady: true });
      else navigator.serviceWorker.addEventListener('controllerchange', () => publish({ offlineReady: true }), { once: true });
    });
  }
  function start() {
    if (started || !('serviceWorker' in navigator)) return;
    started = true;
    applyUpdate = register({
      immediate: true,
      onNeedRefresh: needRefresh,
      // Another tab may activate a worker. Reload this tab only after its own explicit consent.
      onNeedReload: () => { if (updating) window.location.reload(); },
      onOfflineReady: observeOfflineReady,
      onRegisteredSW: (_url, registration) => {
        if (!registration) return;
        if (registration.waiting) needRefresh();
        else if (state.status !== 'waiting') publish({ status: 'registered' });
        // ready resolves after precaching and activation, including on return visits.
        observeOfflineReady();
        // Recheck when a long-lived standalone app returns to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void registration.update().catch(() => { /* Offline or transient failure: keep the current app. */ });
          }
        });
      },
      onRegisterError: () => publish({ status: 'unregistered', offlineReady: false }),
    });
  }
  function update(): Promise<void> {
    if (updating) return updating;
    if (!applyUpdate || state.status !== 'waiting') return Promise.resolve();
    updating = applyUpdate(true).catch((error: unknown) => { updating = undefined; throw error; });
    return updating;
  }
  return {
    start,
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); start(); return () => { listeners.delete(listener); }; },
    subscribeUpdates(onNeedRefresh: () => void) {
      updates.add(onNeedRefresh);
      if (state.status === 'waiting') onNeedRefresh();
      start();
      return { update, unsubscribe: () => { updates.delete(onNeedRefresh); } };
    },
    update,
  };
}

export const pwaClient = createPwaClient();
export const subscribeUpdates = pwaClient.subscribeUpdates;
export const update = pwaClient.update;
