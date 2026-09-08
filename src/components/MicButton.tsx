export function MicButton({ inputting, onClick }: { inputting: boolean; onClick: () => void }) {
  return <button type="button" className={`mic-button${inputting ? ' inputting' : ''}`} onClick={onClick}
    aria-label={inputting ? '入力バーを閉じる' : '音声メモ開始'} aria-expanded={inputting} aria-controls="memo-input-bar">
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      {inputting ? <path d="m6 6 12 12M18 6 6 18" /> : <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>}
    </svg>
  </button>;
}
