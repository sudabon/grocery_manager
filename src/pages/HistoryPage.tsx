import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { boardDateLabel, todayBoardDate } from '../core/boardDate';
import { useAppStore } from '../store/useAppStore';

export function HistoryPage() {
  // 3 状態を区別する: undefined = 読み込み中、null = 読み取り失敗、配列 = データ。
  // 読み込み中や読み取り失敗を「無い」と見せると、残っているボードが消えたと誤解される。
  const [dates, setDates] = useState<string[] | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void useAppStore.getState().listBoardDates().then((result) => { if (active) setDates(result); });
    return () => { active = false; };
  }, []);
  const today = todayBoardDate();
  return <main className="secondary-page"><div className="page-content">
    <Link to="/">メモ画面へ戻る</Link><h2>日付の一覧</h2>
    <p>メモがある日付を新しい順に並べています。過去のボードは参照だけできます。</p>
    {dates === undefined ? <p>日付を読み込んでいます…</p>
      : dates === null ? <p className="help-text">端末のデータを読み込めなかったため、日付の一覧を表示できません。</p> : <>
      <ul className="board-date-list" aria-label="ボードの日付">
        {dates.map((date) => <li key={date}>
          {/* 当日は既定の表示なのでクエリを付けない。付けたままにすると、戻る操作で当日へ復帰しなくなる。 */}
          <Link to={date === today ? '/' : `/?date=${date}`}>{boardDateLabel(date)}</Link>
        </li>)}
      </ul>
      {dates.every((date) => date === today) && <p>過去のボードはまだありません。</p>}
    </>}
  </div></main>;
}
