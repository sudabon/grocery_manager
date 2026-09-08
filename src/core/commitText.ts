import { monotonicFactory } from 'ulid';
import { tokenize } from './tokenize';
import { resolvePlacement } from './resolvePlacement';
import { useAppStore } from '../store/useAppStore';

const nextId = monotonicFactory();
export function commitText(text: string, notify: (message: string) => void) {
  const tokens = tokenize(text);
  if (!tokens.length) return;
  const now = Date.now();
  useAppStore.getState().addChips(tokens.slice(0, 50).map((rawText) => ({
    id: nextId(), rawText, normText: rawText, ...resolvePlacement(rawText),
    autoClassified: true, createdAt: now, updatedAt: now,
  })));
  if (tokens.length > 50) notify('先頭50件のみ登録しました。残りの単語はもう一度入力してください。');
}
