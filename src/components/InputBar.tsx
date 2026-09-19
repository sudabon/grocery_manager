import { useEffect, useRef, useState } from 'react';
import { useCommitController } from '../hooks/useCommitController';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { useAppStore } from '../store/useAppStore';
import { MicButton } from './MicButton';

// Session-only, like the board. Persistence is introduced by the classification change.
let hintSeen = false;
export function InputBar({ onCommit }: { onCommit: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const settings = useAppStore((state) => state.settings);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useVisualViewport(open);
  const controller = useCommitController(onCommit, settings.autoCommitMs);
  // 途中結果の範囲置換（選択範囲を持つ beforeinput）は iOS がライブで更新している証拠で、書き戻しは
  // 来ない。React の onBeforeInput は native の beforeinput ではなく textInput 由来なので、直接購読する。
  const reset = controller.reset;
  useEffect(() => {
    const input = inputRef.current!;
    const onBeforeInput = () => { if (input.selectionStart !== input.selectionEnd) reset(); };
    input.addEventListener('beforeinput', onBeforeInput);
    return () => input.removeEventListener('beforeinput', onBeforeInput);
  }, [reset]);
  const submit = () => { controller.commit(); inputRef.current?.focus({ preventScroll: true }); };
  const toggle = () => {
    if (open) {
      controller.commit();
      inputRef.current?.blur();
      barRef.current!.style.visibility = 'hidden';
      setOpen(false);
      setHint(false);
    } else {
      // Reveal the already-mounted input BEFORE synchronous focus (iOS user activation).
      barRef.current!.style.visibility = 'visible';
      inputRef.current?.focus({ preventScroll: true });
      setOpen(true);
      if (settings.showDictationHint && !hintSeen) { setHint(true); hintSeen = true; }
    }
  };
  // 閉じている間の入力バーは visibility で隠すだけでなく collapsed でフローからも外し、ドックの高さをマイクに合わせる。
  // 表示は focus の前に同期で切り替える必要があるが（iOS）、配置は React のコミットで足りる。
  return <div className="input-dock">
    <div id="memo-input-bar" className={`input-bar${open ? '' : ' collapsed'}`} ref={barRef} style={{ visibility: open ? 'visible' : 'hidden' }}>
      {hint && settings.showDictationHint && <p className="dictation-hint" id="dictation-hint">キーボードのマイクキー🎤をタップして話してください</p>}
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label className="sr-only" htmlFor="memo-input">メモを入力</label>
        <input id="memo-input" ref={inputRef} type="text" placeholder="話す、または入力する" value={controller.text}
          autoComplete="off" enterKeyHint="done" aria-describedby={hint && settings.showDictationHint ? 'dictation-hint' : undefined}
          onChange={(event) => controller.change(event.currentTarget.value)}
          onCompositionStart={controller.compositionStart}
          onCompositionEnd={(event) => controller.compositionEnd(event.currentTarget.value)}
          onBlur={controller.reset}
          onKeyDown={(event) => {
            controller.reset();
            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || controller.isComposing())) event.preventDefault();
          }} />
        <button type="submit" className="commit-button" onPointerDown={(event) => event.preventDefault()}>確定</button>
      </form>
    </div>
    <MicButton inputting={open} onClick={toggle} />
  </div>;
}
