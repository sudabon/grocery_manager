import { afterEach, expect, it, vi } from 'vitest';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { createPwaClient } from '../registerSW';

afterEach(() => vi.unstubAllGlobals());
function setup() {
  let options: RegisterSWOptions = {};
  const apply = vi.fn().mockResolvedValue(undefined);
  const register = vi.fn((value: RegisterSWOptions = {}) => { options = value; return apply; });
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({}), controller: {} } });
  const client = createPwaClient(register);
  return { client, register, apply, options: () => options };
}
it('複数購読でも登録は一度、更新イベントを通知し解除と遅い購読を扱う', () => {
  const { client, register, apply, options } = setup();
  const first = vi.fn(); const second = vi.fn();
  const subscription = client.subscribeUpdates(first);
  client.subscribeUpdates(second);
  expect(register).toHaveBeenCalledTimes(1);
  options().onNeedRefresh?.();
  expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1);
  expect(client.getSnapshot().status).toBe('waiting');
  expect(apply).not.toHaveBeenCalled();
  subscription.unsubscribe(); options().onNeedRefresh?.();
  expect(first).toHaveBeenCalledTimes(1);
  const late = vi.fn(); client.subscribeUpdates(late); expect(late).toHaveBeenCalledTimes(1);
});
it('利用者の更新操作だけが更新を実行し、連打は一度にまとめる', async () => {
  const { client, apply, options } = setup();
  const subscription = client.subscribeUpdates(vi.fn());
  await subscription.update(); expect(apply).not.toHaveBeenCalled();
  options().onNeedRefresh?.();
  await Promise.all([subscription.update(), client.update()]);
  expect(apply).toHaveBeenCalledExactlyOnceWith(true);
});
it('更新失敗後も通知を保持し再試行できる', async () => {
  const { client, apply, options } = setup(); client.start(); options().onNeedRefresh?.();
  apply.mockRejectedValueOnce(new Error('offline'));
  await expect(client.update()).rejects.toThrow('offline');
  expect(client.getSnapshot().status).toBe('waiting');
  await client.update(); expect(apply).toHaveBeenCalledTimes(2);
});
it('登録済み・オフライン準備・登録失敗を購読できる', async () => {
  const { client, options } = setup(); const changed = vi.fn();
  const unsubscribe = client.subscribe(changed);
  options().onRegisteredSW?.('/sw.js', { waiting: null } as ServiceWorkerRegistration);
  await Promise.resolve();
  expect(client.getSnapshot()).toEqual({ status: 'registered', offlineReady: true });
  options().onRegisterError?.(new Error('failed'));
  expect(client.getSnapshot()).toEqual({ status: 'unregistered', offlineReady: false });
  unsubscribe(); const count = changed.mock.calls.length;
  options().onOfflineReady?.(); expect(changed).toHaveBeenCalledTimes(count);
});
it('既に更新待機中の登録を検出する', () => {
  const { client, options } = setup(); const refresh = vi.fn(); client.subscribeUpdates(refresh);
  options().onRegisteredSW?.('/sw.js', { waiting: {} } as ServiceWorkerRegistration);
  expect(refresh).toHaveBeenCalledTimes(1); expect(client.getSnapshot().status).toBe('waiting');
});
it('SW 非対応環境は登録せずオンラインのアプリを維持する', () => {
  const { client, register } = setup(); vi.stubGlobal('navigator', {});
  client.start(); expect(register).not.toHaveBeenCalled();
  expect(client.getSnapshot()).toEqual({ status: 'unregistered', offlineReady: false });
});
it('precache の有効化に加え、このページを制御するまで利用可にしない', async () => {
  const { client, options } = setup();
  const sw = Object.assign(new EventTarget(), { controller: null, ready: Promise.resolve({}) });
  vi.stubGlobal('navigator', { serviceWorker: sw });
  client.start(); options().onOfflineReady?.(); await Promise.resolve();
  expect(client.getSnapshot().offlineReady).toBe(false);
  sw.dispatchEvent(new Event('controllerchange'));
  expect(client.getSnapshot().offlineReady).toBe(true);
});
it('他タブの有効化では再読み込みせず、このタブで更新操作した後に再読み込みする', async () => {
  const { client, options } = setup(); const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  client.start(); options().onNeedRefresh?.(); options().onNeedReload?.();
  expect(reload).not.toHaveBeenCalled();
  await client.update(); options().onNeedReload?.(); expect(reload).toHaveBeenCalledTimes(1);
});
