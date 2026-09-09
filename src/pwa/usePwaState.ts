import { useSyncExternalStore } from 'react';
import { pwaClient } from './registerSW';

export function usePwaState() {
  return useSyncExternalStore(pwaClient.subscribe, pwaClient.getSnapshot);
}
