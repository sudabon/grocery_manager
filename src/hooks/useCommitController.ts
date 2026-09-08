import { useCallback, useEffect, useRef, useState } from 'react';

export function useCommitController(onCommit: (text: string) => void, delay = 1500) {
  const [text, setText] = useState('');
  const value = useRef('');
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const callback = useRef(onCommit);
  callback.current = onCommit;
  const cancel = useCallback(() => { clearTimeout(timer.current); timer.current = undefined; }, []);
  const commit = useCallback(() => {
    cancel();
    const pending = value.current;
    value.current = '';
    setText('');
    if (pending) callback.current(pending);
  }, [cancel]);
  const schedule = useCallback(() => {
    cancel();
    if (!composing.current && value.current) timer.current = setTimeout(commit, delay);
  }, [cancel, commit, delay]);
  const change = (next: string) => { value.current = next; setText(next); schedule(); };
  const compositionStart = () => { composing.current = true; cancel(); };
  const compositionEnd = (next: string) => { composing.current = false; change(next); };
  useEffect(() => cancel, [cancel]);
  return { text, change, commit, compositionStart, compositionEnd, isComposing: () => composing.current };
}
