import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { boardDateLabel, todayBoardDate } from '../core/boardDate';
import { useAppStore } from '../store/useAppStore';

export function HistoryPage() {
  // 読み込み前と 0 件を区別するため null から始める（読み込み中に「無い」と見せない）。
  const [dates, setDates] = useState<string[] | null>(null);
  useEffect(() => {
    let active = true;
    void useAppStore.getState().listBoardDates().then((result) => { if (active) setDates(result); });
    return () => { active = false; };
  }, []);
  const today = todayBoardDate();
  return <main className="secondary-page"><div className="page-content">
    <Link to="/">メモ画面へ戻る</Link><h2>日付の一覧</h2>
    <p>メモがある日付を新しい順に並べています。過去のボードは参照だけできます。</p>
    {dates === null ? <p>日付を読み込んでいます…</p> : <>
      <ul className="board-date-list" aria-label="ボードの日付">
        {dates.map((date) => <li key={date}>
          {/* 当日は既定の表示なのでクエリを付けない。付けたままにすると、戻る操作で当日へ復帰しなくなる。 */}
          <Link to={date === today ? '/' : `/?date=${date}`}>{boardDateLabel(date)}</Link>
        </li>)}
      </ul>
      {!dates.some((date) => date !== today) && <p>過去のボードはまだありません。</p>}
    </>}
  </div></main>;
}
