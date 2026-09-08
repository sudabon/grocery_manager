import { useRef, useState } from 'react';
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
  const dockRef = useVisualViewport();
  const controller = useCommitController(onCommit, settings.autoCommitMs);
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
  return <div className="input-dock" ref={dockRef}>
    <div id="memo-input-bar" className="input-bar" ref={barRef} style={{ visibility: open ? 'visible' : 'hidden' }}>
      {hint && <p className="dictation-hint" id="dictation-hint">キーボードのマイクキー🎤をタップして話してください</p>}
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label className="sr-only" htmlFor="memo-input">メモを入力</label>
        <input id="memo-input" ref={inputRef} type="text" placeholder="話す、または入力する" value={controller.text}
          autoComplete="off" enterKeyHint="done" aria-describedby={hint ? 'dictation-hint' : undefined}
          onChange={(event) => controller.change(event.currentTarget.value)}
          onCompositionStart={controller.compositionStart}
          onCompositionEnd={(event) => controller.compositionEnd(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || controller.isComposing())) event.preventDefault();
          }} />
        <button type="submit" className="commit-button" onPointerDown={(event) => event.preventDefault()}>確定</button>
      </form>
    </div>
    <MicButton inputting={open} onClick={toggle} />
  </div>;
}
