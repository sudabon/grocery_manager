import { monotonicFactory } from 'ulid';
import { tokenize } from './tokenize';
import { resolvePlacement } from './resolvePlacement';
import { useAppStore } from '../store/useAppStore';
import { QUADRANT_LIMIT_MESSAGE } from './quadrantLength';
import { normalize } from './normalize';

const nextId = monotonicFactory();
export async function commitText(text: string, notify: (message: string) => void) {
  const tokens = tokenize(text);
  if (!tokens.length) return;
  const now = Date.now();
  const { normalizedDicts, settings, addChips } = useAppStore.getState();
  const result = await addChips(tokens.slice(0, 50).flatMap((rawText) => {
    const placement = resolvePlacement(rawText, normalizedDicts, settings.partialMatch);
    return placement ? [{
      id: nextId(now), rawText, normText: normalize(rawText), ...placement,
      autoClassified: true, createdAt: now, updatedAt: now,
    }] : [];
  }));
  const truncated = tokens.length > 50;
  if (result.rejected && !result.added) {
    notify(truncated ? `先頭50件のみ処理しました。${QUADRANT_LIMIT_MESSAGE}` : QUADRANT_LIMIT_MESSAGE);
  } else if (result.rejected || (truncated && result.added)) {
    notify('一部のみ登録しました。登録されなかった単語は、もう一度入力してください。');
  } else if (truncated) {
    notify('先頭50件のみ処理しました。登録されなかった単語は、もう一度入力してください。');
  }
}
