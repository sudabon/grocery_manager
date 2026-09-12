import { monotonicFactory } from 'ulid';
import { tokenize } from './tokenize';
import { resolvePlacement } from './resolvePlacement';
import { BOARD_READ_ONLY_MESSAGE, useAppStore } from '../store/useAppStore';
import { QUADRANT_LIMIT_MESSAGE } from './quadrantLength';
import { normalize } from './normalize';

const nextId = monotonicFactory();
export async function commitText(text: string, notify: (message: string) => void) {
  const { normalizedDicts, settings, addChips } = useAppStore.getState();
  const tokens = tokenize(text, normalizedDicts);
  if (!tokens.length) return;
  const now = Date.now();
  const result = await addChips(tokens.slice(0, 50).flatMap((rawText) => {
    const placement = resolvePlacement(rawText, normalizedDicts, settings.partialMatch);
    return placement ? [{
      id: nextId(now), rawText, normText: normalize(rawText), ...placement,
      autoClassified: true, createdAt: now, updatedAt: now,
    }] : [];
  }));
  const truncated = tokens.length > 50;
  // 表示したまま日付が変わった場合は、コミットの手段があるのに保存されないので理由を伝える（design.md - D4）。
  if (result.readOnly) {
    notify(BOARD_READ_ONLY_MESSAGE);
  } else if (result.rejected && !result.added) {
    notify(truncated ? `先頭50件のみ処理しました。${QUADRANT_LIMIT_MESSAGE}` : QUADRANT_LIMIT_MESSAGE);
  } else if (result.rejected || (truncated && result.added)) {
    notify('一部のみ登録しました。登録されなかった単語は、もう一度入力してください。');
  } else if (truncated) {
    notify('先頭50件のみ処理しました。登録されなかった単語は、もう一度入力してください。');
  }
}
