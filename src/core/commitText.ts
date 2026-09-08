import { monotonicFactory } from 'ulid';
import { tokenize } from './tokenize';
import { resolvePlacement } from './resolvePlacement';
import { useAppStore } from '../store/useAppStore';
import { normalize } from './normalize';

const nextId = monotonicFactory();
export function commitText(text: string, notify: (message: string) => void) {
  const tokens = tokenize(text);
  if (!tokens.length) return;
  const now = Date.now();
  const { normalizedDicts, settings, addChips } = useAppStore.getState();
  void addChips(tokens.slice(0, 50).flatMap((rawText) => {
    const placement = resolvePlacement(rawText, normalizedDicts, settings.partialMatch);
    return placement ? [{
      id: nextId(now), rawText, normText: normalize(rawText), ...placement,
      autoClassified: true, createdAt: now, updatedAt: now,
    }] : [];
  }));
  if (tokens.length > 50) notify('先頭50件のみ登録しました。残りの単語はもう一度入力してください。');
}
