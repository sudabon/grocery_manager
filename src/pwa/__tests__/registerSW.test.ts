import { afterEach, expect, it, vi } from 'vitest';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { createPwaClient } from '../registerSW';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  let options: RegisterSWOptions = {};
  const apply = vi.fn().mockResolvedValue(undefined);
  const register = vi.fn((value: RegisterSWOptions = {}) => { options = value; return apply; });
  const sw = Object.assign(new EventTarget(), { ready: Promise.resolve({}), controller: {} as object | null });
  vi.stubGlobal('navigator', { serviceWorker: sw, onLine: true });
  const reload = vi.fn();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { reload } }));
  const client = createPwaClient(register);
  return { client, register, apply, sw, reload, options: () => options };
}
it('登録は一度だけ行う', () => {
  const { client, register, apply } = setup();
  client.subscribe(vi.fn());
  client.subscribe(vi.fn());
  expect(register).toHaveBeenCalledTimes(1);
  expect(apply).not.toHaveBeenCalled();
});
it('状態変化を全購読者へ通知する', () => {
  const { client, options, apply } = setup();
  const first = vi.fn(); const second = vi.fn();
  client.subscribe(first); client.subscribe(second);
  options().onNeedRefresh?.();
  expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1);
  expect(client.getSnapshot().status).toBe('waiting');
  expect(apply).not.toHaveBeenCalled();
  options().onNeedRefresh?.();
  const late = vi.fn(() => client.getSnapshot().status); client.subscribe(late);
  // 遅い購読者も通知の再送なしで、現在の snapshot を直ちに読める。
  expect(late()).toBe('waiting'); expect(late).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
});
it('解除後は通知しない', () => {
  const { client, options } = setup();
  const first = vi.fn(); const second = vi.fn();
  const subscription = client.subscribe(first); client.subscribe(second);
  options().onNeedRefresh?.();
  subscription(); options().onNeedRefresh?.();
  expect(first).toHaveBeenCalledTimes(1);
  options().onRegisterError?.(new Error('failed'));
  expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(2);
});
it('利用者の更新操作だけが更新を実行し、連打は一度にまとめる', async () => {
  const { client, apply, options, sw } = setup();
  client.subscribe(vi.fn());
  expect(await client.update()).toBe('skipped'); expect(apply).not.toHaveBeenCalled();
  options().onNeedRefresh?.();
  const pending = client.update();
  expect(client.update()).toBe(pending);
  sw.dispatchEvent(new Event('controllerchange'));
  expect(await pending).toBe('applied');
  expect(apply).toHaveBeenCalledOnce();
});
it('更新失敗後も通知を保持し再試行できる', async () => {
  const { client, apply, options, sw } = setup(); client.subscribe(() => {}); options().onNeedRefresh?.();
  apply.mockRejectedValueOnce(new Error('offline'));
  await expect(client.update()).rejects.toThrow('offline');
  expect(client.getSnapshot().status).toBe('waiting');
  const retry = client.update(); sw.dispatchEvent(new Event('controllerchange'));
  expect(await retry).toBe('applied'); expect(apply).toHaveBeenCalledTimes(2);
});
it('更新成功後も次の世代の更新を実行できる', async () => {
  const { client, apply, options, sw } = setup(); client.subscribe(() => {});
  options().onNeedRefresh?.();
  const first = client.update(); sw.dispatchEvent(new Event('controllerchange'));
  expect(await first).toBe('applied');
  options().onNeedRefresh?.();
  const next = client.update(); sw.dispatchEvent(new Event('controllerchange'));
  expect(await next).toBe('applied');
  expect(apply).toHaveBeenCalledTimes(2);
});
it('登録済み・オフライン準備・登録失敗を購読できる', async () => {
  const { client, options } = setup(); const changed = vi.fn();
  const unsubscribe = client.subscribe(changed);
  options().onRegisteredSW?.('/sw.js', { waiting: null } as ServiceWorkerRegistration);
  await Promise.resolve();
  expect(client.getSnapshot()).toEqual({ status: 'registered', offlineReady: true });
  options().onRegisterError?.(new Error('failed'));
  expect(client.getSnapshot()).toEqual({ status: 'failed', offlineReady: false });
  unsubscribe(); const count = changed.mock.calls.length;
  options().onOfflineReady?.(); expect(changed).toHaveBeenCalledTimes(count);
});
it('既に更新待機中の登録を検出する', () => {
  const { client, options } = setup(); const refresh = vi.fn(); client.subscribe(refresh);
  options().onRegisteredSW?.('/sw.js', { waiting: {} } as ServiceWorkerRegistration);
  expect(refresh).toHaveBeenCalledTimes(1); expect(client.getSnapshot().status).toBe('waiting');
});
it('SW 非対応環境は登録せずオンラインのアプリを維持する', () => {
  const { client, register } = setup(); vi.stubGlobal('navigator', {});
  client.subscribe(() => {}); expect(register).not.toHaveBeenCalled();
  expect(client.getSnapshot()).toEqual({ status: 'unsupported', offlineReady: false });
});
it('precache の有効化に加え、このページを制御するまで利用可にしない', async () => {
  const { client, options } = setup();
  const sw = Object.assign(new EventTarget(), { controller: null as object | null, ready: Promise.resolve({}) });
  vi.stubGlobal('navigator', { serviceWorker: sw });
  client.subscribe(() => {}); options().onOfflineReady?.(); await Promise.resolve();
  expect(client.getSnapshot().offlineReady).toBe(false);
  options().onRegisteredSW?.('/sw.js', { waiting: null } as ServiceWorkerRegistration);
  sw.controller = {};
  sw.dispatchEvent(new Event('controllerchange'));
  expect(client.getSnapshot().offlineReady).toBe(true);
  sw.controller = null; sw.dispatchEvent(new Event('controllerchange'));
  expect(client.getSnapshot().offlineReady).toBe(false);
});
it('他タブの有効化では再読み込みせず、このタブで更新操作した後に再読み込みする', async () => {
  const { client, options, sw } = setup(); const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  client.subscribe(() => {}); options().onNeedRefresh?.(); options().onNeedReload?.();
  expect(reload).not.toHaveBeenCalled();
  const pending = client.update(); options().onNeedReload?.(); expect(reload).toHaveBeenCalledTimes(1);
  sw.dispatchEvent(new Event('controllerchange')); await pending;
  const count = reload.mock.calls.length;
  options().onNeedReload?.(); expect(reload).toHaveBeenCalledTimes(count);
});
it('同意後の制御移行で再読み込みし、更新を繰り返してもリスナは累積しない', async () => {
  const { client, options } = setup(); const reload = vi.fn();
  const sw = Object.assign(new EventTarget(), { controller: null as object | null, ready: Promise.resolve({}) });
  vi.stubGlobal('navigator', { serviceWorker: sw });
  vi.stubGlobal('window', { location: { reload } });
  client.subscribe(() => {}); options().onNeedRefresh?.();
  sw.dispatchEvent(new Event('controllerchange'));
  expect(reload).not.toHaveBeenCalled();
  const first = client.update();
  sw.dispatchEvent(new Event('controllerchange')); expect(await first).toBe('applied');
  expect(reload).toHaveBeenCalledTimes(1);
  const next = client.update();
  sw.dispatchEvent(new Event('controllerchange')); expect(await next).toBe('applied');
  expect(reload).toHaveBeenCalledTimes(2);
  sw.dispatchEvent(new Event('controllerchange')); options().onNeedReload?.();
  expect(reload).toHaveBeenCalledTimes(2);
});
it('更新に失敗した後は制御移行と onNeedReload のどちらでも再読み込みしない', async () => {
  const { client, apply, options } = setup(); const reload = vi.fn();
  const sw = Object.assign(new EventTarget(), { controller: null as object | null, ready: Promise.resolve({}) });
  vi.stubGlobal('navigator', { serviceWorker: sw });
  vi.stubGlobal('window', { location: { reload } });
  client.subscribe(() => {}); options().onNeedRefresh?.();
  apply.mockRejectedValueOnce(new Error('offline'));
  await expect(client.update()).rejects.toThrow('offline');
  sw.dispatchEvent(new Event('controllerchange'));
  options().onNeedReload?.();
  expect(reload).not.toHaveBeenCalled();
});
it('制御移行が来なければタイムアウトを返し、同意を取り下げる', async () => {
  const { client, options, sw, reload, apply } = setup();
  vi.useFakeTimers();
  client.subscribe(() => {}); options().onNeedRefresh?.();
  const pending = client.update();
  await vi.advanceTimersByTimeAsync(9_999);
  expect(client.update()).toBe(pending);
  expect(reload).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe('timeout');
  expect(reload).not.toHaveBeenCalled();
  options().onNeedReload?.(); sw.dispatchEvent(new Event('controllerchange'));
  expect(reload).not.toHaveBeenCalled();
  expect(client.getSnapshot().status).toBe('waiting');
  const retry = client.update(); sw.dispatchEvent(new Event('controllerchange'));
  expect(await retry).toBe('applied');
  expect(apply).toHaveBeenCalledTimes(2);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('非対応環境と登録失敗を別の状態として区別する', () => {
  const { client, options } = setup();
  client.subscribe(() => {});
  options().onRegisterError?.(new Error('boom'));
  expect(client.getSnapshot().status).toBe('failed');
  const register = vi.fn(); const other = createPwaClient(register);
  vi.stubGlobal('navigator', {});
  const changed = vi.fn(); other.subscribe(changed); other.subscribe(() => {});
  expect(other.getSnapshot().status).toBe('unsupported');
  expect(register).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledTimes(1);
});
it('登録オブジェクトが無ければ failed にし、制御移行でも不正な利用可状態を作らない', async () => {
  const { client, options, sw } = setup();
  client.subscribe(() => {}); options().onOfflineReady?.();
  await Promise.resolve();
  options().onRegisteredSW?.('/sw.js', undefined);
  expect(client.getSnapshot()).toEqual({ status: 'failed', offlineReady: false });
  sw.dispatchEvent(new Event('controllerchange'));
  expect(client.getSnapshot()).toEqual({ status: 'failed', offlineReady: false });
});
it('表示復帰とオンライン復帰で再確認し、失敗後は直ちに再試行できる', async () => {
  const { client, options } = setup();
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', page);
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-09T00:00:00Z'));
  const check = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  client.subscribe(() => {});
  options().onRegisteredSW?.('/sw.js', { waiting: null, update: check } as unknown as ServiceWorkerRegistration);
  page.dispatchEvent(new Event('visibilitychange')); await Promise.resolve();
  expect(check).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('online')); await Promise.resolve();
  expect(check).toHaveBeenCalledTimes(2);
  page.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('online'));
  expect(check).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(3_600_000);
  page.visibilityState = 'hidden'; window.dispatchEvent(new Event('online'));
  expect(check).toHaveBeenCalledTimes(2);
  page.visibilityState = 'visible';
  vi.stubGlobal('navigator', { serviceWorker: navigator.serviceWorker, onLine: false });
  page.dispatchEvent(new Event('visibilitychange'));
  expect(check).toHaveBeenCalledTimes(2);
  vi.stubGlobal('navigator', { serviceWorker: navigator.serviceWorker, onLine: true });
  window.dispatchEvent(new Event('online'));
  expect(check).toHaveBeenCalledTimes(3);
});
