import { useCallback, useEffect, useRef, useState } from 'react';

// iOS のディクテーションは composition イベントを出さず、通常の insertText として文字が届く。
// 自動コミットで入力欄を空にすると iOS は途中結果の更新を止め、発話区切りの確定時に
// 「コミット時点の文字列 + その後の発話」を累積で書き戻す（実機ログで確認。書き戻しは
// 数秒〜十数秒後で、イベント種別でも時間でも区別できない）。そのため、コミット時点の
// 表示文字列を echo として覚え、それで始まる入力は先頭部分を除いた残りだけをコミットする。
// 表示は iOS が書き込んだままにし（書き込み途中に DOM を書き換えない）、次のコミットで空にする。
export function useCommitController(onCommit: (text: string) => void, delay = 1500) {
  const [text, setText] = useState('');
  const shown = useRef('');
  const pending = useRef('');
  const echo = useRef('');
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const callback = useRef(onCommit);
  callback.current = onCommit;
  const cancel = useCallback(() => { clearTimeout(timer.current); timer.current = undefined; }, []);
  const commit = useCallback(() => {
    cancel();
    const committed = pending.current;
    echo.current = shown.current;
    shown.current = ''; pending.current = '';
    setText('');
    if (committed) callback.current(committed);
  }, [cancel]);
  // 書き戻しだけ（残りが空）でも表示は残るので、表示がある限りタイマーを張って空にする。
  const schedule = useCallback(() => {
    cancel();
    if (!composing.current && shown.current) timer.current = setTimeout(commit, delay);
  }, [cancel, commit, delay]);
  const change = (next: string) => {
    shown.current = next;
    pending.current = echo.current && next.startsWith(echo.current) ? next.slice(echo.current.length) : next;
    setText(next); schedule();
  };
  // 書き戻しが来ない契機（blur・キー入力・途中結果の範囲置換）で echo を捨てる。
  const reset = useCallback(() => { echo.current = ''; }, []);
  const compositionStart = () => { composing.current = true; cancel(); };
  const compositionEnd = (next: string) => { composing.current = false; change(next); };
  useEffect(() => cancel, [cancel]);
  return { text, change, commit, reset, compositionStart, compositionEnd, isComposing: () => composing.current };
}
