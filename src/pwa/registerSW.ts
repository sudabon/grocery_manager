import { registerSW } from 'virtual:pwa-register';

export type PwaState =
  | { status: 'checking'; offlineReady: false }
  | { status: 'unsupported'; offlineReady: false }
  | { status: 'failed'; offlineReady: false }
  | { status: 'registered'; offlineReady: boolean }
  | { status: 'waiting'; offlineReady: boolean };

export type UpdateResult = 'applied' | 'timeout' | 'skipped';
const CONTROL_TIMEOUT_MS = 10_000;

// One registration and one set of browser listeners, shared by all UI subscribers.
// The factory lets unit tests exercise the real subscription layer with an injected registrar.
export function createPwaClient(register = registerSW) {
  let state: PwaState = { status: 'checking', offlineReady: false };
  const listeners = new Set<() => void>();
  let started = false;
  let applyUpdate: ReturnType<typeof registerSW> | undefined;
  let updating: Promise<UpdateResult> | undefined;
  let consented = false;
  let lastUpdateCheck = 0;
  let observing = false;
  function publish(next: PwaState) {
    if (next.status === state.status && next.offlineReady === state.offlineReady) return;
    state = next;
    listeners.forEach((listener) => listener());
  }
  const controlled = () => typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
  function needRefresh() {
    publish({ status: 'waiting', offlineReady: state.offlineReady });
  }
  function observeOfflineReady() {
    if (observing) return;
    observing = true;
    void navigator.serviceWorker.ready.then(() => {
      const mark = () => {
        if (state.status !== 'registered' && state.status !== 'waiting') return;
        publish({ status: state.status, offlineReady: controlled() });
      };
      navigator.serviceWorker.addEventListener('controllerchange', mark);
      mark();
    }).catch((error: unknown) => { console.warn('[pwa] service worker never became ready', error); });
  }
  function start() {
    if (started) return;
    started = true;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      publish({ status: 'unsupported', offlineReady: false }); return;
    }
    applyUpdate = register({
      immediate: true,
      onNeedRefresh: needRefresh,
      // ライブラリ既定の無条件 reload を抑止し、同意済みのタブだけ再読み込みする。
      // isUpdate が true の通常更新ではこちらが、false の初回訪問セッションでは
      // update() 内の controllerchange 待ちが reload を担う。
      onNeedReload: () => { if (consented) window.location.reload(); },
      onOfflineReady: observeOfflineReady,
      onRegisteredSW: (_url, registration) => {
        if (!registration) {
          console.error('[pwa] service worker registered without a registration object');
          publish({ status: 'failed', offlineReady: false });
          return;
        }
        if (registration.waiting) needRefresh();
        else if (state.status !== 'waiting') publish({ status: 'registered', offlineReady: controlled() });
        // ready resolves after precaching and activation, including on return visits.
        observeOfflineReady();
        // Recheck when a long-lived standalone app returns to the foreground.
        const recheck = () => {
          if (document.visibilityState !== 'visible' || !navigator.onLine) return;
          if (Date.now() - lastUpdateCheck < 3_600_000) return;
          const startedAt = Date.now();
          lastUpdateCheck = startedAt;
          void registration.update().catch((error: unknown) => {
            // 一過性の失敗で 1 時間ロックアウトしないよう、失敗したら次回の再確認を許す。
            if (lastUpdateCheck === startedAt) lastUpdateCheck = 0;
            console.warn('[pwa] update check failed', error);
          });
        };
        document.addEventListener('visibilitychange', recheck);
        window.addEventListener('online', recheck);
      },
      onRegisterError: (error: unknown) => {
        console.error('[pwa] service worker registration failed', error);
        publish({ status: 'failed', offlineReady: false });
      },
    });
  }
  function update(): Promise<UpdateResult> {
    if (updating) return updating;
    if (!applyUpdate || state.status !== 'waiting') return Promise.resolve('skipped');
    updating = (async (): Promise<UpdateResult> => {
      consented = true;
      let settle!: (value: 'applied') => void;
      const controlChanged = new Promise<'applied'>((resolve) => { settle = resolve; });
      const onControllerChange = () => settle('applied');
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await applyUpdate!(true);
        const timedOut = new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), CONTROL_TIMEOUT_MS);
        });
        const result = await Promise.race([controlChanged, timedOut]);
        if (result === 'applied') window.location.reload();
        return result;
      } finally {
        // 同意はこの試行だけに限定し、後の外部有効化へ持ち越さない。
        consented = false;
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        updating = undefined;
      }
    })();
    return updating;
  }
  return {
    getSnapshot: (): PwaState => state,
    subscribe(listener: () => void) { listeners.add(listener); start(); return () => { listeners.delete(listener); }; },
    update,
  };
}

export const pwaClient = createPwaClient();
export const update = pwaClient.update;
