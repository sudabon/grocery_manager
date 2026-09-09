import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoPage } from '../MemoPage';
import { defaultSettings, seedDictionaries } from '../../db/defaults';
import { useAppStore } from '../../store/useAppStore';
import { boardDateLabel, todayBoardDate } from '../../core/boardDate';
import { boardImageFile } from '../../core/boardImage';
import { shareFile } from '../../core/shareExport';
import { commitText } from '../../core/commitText';

// 画像の内容は boardImage.test.ts が担保する。ここでは失敗が利用者に案内されることだけを見る。
vi.mock('../../core/boardImage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../core/boardImage')>(),
  boardImageFile: vi.fn(),
}));
vi.mock('../../core/shareExport', () => ({ shareFile: vi.fn() }));
vi.mock('../../core/commitText', () => ({ commitText: vi.fn() }));

const PNG = () => new File([new Uint8Array([137, 80, 78, 71])], 'quadmemo-board-2026-09-09.png', { type: 'image/png' });
// 当日のボードを表示している状態から始める（MemoPage は開くたびに当日のボードへ切り替える）。
const TODAY = todayBoardDate();
const PAST = '2026-09-08';

beforeEach(() => {
  vi.mocked(boardImageFile).mockReset();
  vi.mocked(shareFile).mockReset();
  vi.mocked(commitText).mockReset().mockResolvedValue(undefined);
  useAppStore.setState({
    settings: { ...defaultSettings }, dictionaries: seedDictionaries(), chips: [],
    pendingWrites: 0, saveErrors: [], dataLoaded: true, storageAvailable: true,
    viewingBoardDate: TODAY, viewingIsToday: true,
  });
});

const shareImage = () => {
  render(<MemoryRouter><MemoPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: '画像で共有' }));
};

it('画像の組み立てに失敗すると案内を表示し、共有処理を開始しない', () => {
  vi.mocked(boardImageFile).mockImplementation(() => { throw new Error('画像を書き出せませんでした。'); });
  expect(shareImage).not.toThrow();
  expect(screen.getByRole('status')).toHaveTextContent('画像を作成できませんでした。もう一度お試しください。');
  expect(shareFile).not.toHaveBeenCalled();
});

it('受け渡しに失敗すると案内を表示する', async () => {
  vi.mocked(boardImageFile).mockReturnValue(PNG());
  vi.mocked(shareFile).mockRejectedValue(new Error('share failed'));
  shareImage();
  expect(await screen.findByText('画像を共有できませんでした。もう一度お試しください。')).toBeInTheDocument();
});

it('成功時は案内を表示せず、生成した PNG をそのまま受け渡す', async () => {
  const file = PNG();
  vi.mocked(boardImageFile).mockReturnValue(file);
  vi.mocked(shareFile).mockResolvedValue(undefined);
  shareImage();
  // File は構造比較だと別インスタンスでも一致してしまうため、参照同一性で見る。
  expect(vi.mocked(shareFile).mock.calls).toHaveLength(1);
  expect(vi.mocked(shareFile).mock.calls[0][0]).toBe(file);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('保存済みの旧ラベルに関係なく固定ラベルの描画入力を共有へ渡す', () => {
  const dictionaries = seedDictionaries(1).map((dict) => ({ ...dict, label: '旧ラベル' }));
  useAppStore.setState({ dictionaries });
  vi.mocked(boardImageFile).mockReturnValue(PNG());
  vi.mocked(shareFile).mockResolvedValue(undefined);
  shareImage();
  expect(vi.mocked(boardImageFile).mock.calls[0][0].map(({ label }) => label))
    .toEqual(['野菜', 'それ以外', '肉類・乳製品', 'ドラッグストア']);
  expect(useAppStore.getState().dictionaries).toEqual(dictionaries);
});

it('各象限の見出しで改行込みの残量を確認でき、超過済みデータは残り0文字になる', () => {
  const chip = (id: string, rawText: string, quadrant: 'q1' | 'q2') =>
    ({ id, boardDate: TODAY, rawText, normText: rawText, quadrant, matchedEntry: null, autoClassified: false, createdAt: 1, updatedAt: 1 });
  useAppStore.setState({ chips: [chip('a', 'a'.repeat(95), 'q1'), chip('b', 'b', 'q1'), chip('old', 'x'.repeat(101), 'q2')] });
  render(<MemoryRouter><MemoPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: /Q1\s*それ以外\s*残り2文字/ })).toBeVisible();
  expect(screen.getByRole('heading', { name: /Q2\s*野菜\s*残り0文字/ })).toBeVisible();
  expect(screen.getByRole('heading', { name: /Q3\s*肉類・乳製品\s*残り100文字/ })).toBeVisible();
});

it('コミットが失敗すると案内を表示する', async () => {
  vi.mocked(commitText).mockRejectedValue(new Error('commit failed'));
  render(<MemoryRouter><MemoPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: '音声メモ開始' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'メモを入力' }), { target: { value: '牛乳' } });
  fireEvent.click(screen.getByRole('button', { name: '確定' }));
  expect(await screen.findByText('登録できませんでした。もう一度お試しください。')).toBeInTheDocument();
});

it('当日のボードは年月日と今日であることを示し、入力と操作を提供する', () => {
  const chip = (id: string, rawText: string, quadrant: 'q1') =>
    ({ id, boardDate: TODAY, rawText, normText: rawText, quadrant, matchedEntry: null, autoClassified: false, createdAt: 1, updatedAt: 1 });
  useAppStore.setState({ chips: [chip('a', '牛乳', 'q1')] });
  render(<MemoryRouter><MemoPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: `${boardDateLabel(TODAY)}（今日）` })).toBeVisible();
  expect(screen.getByRole('button', { name: '音声メモ開始' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'メモ「牛乳」（未分類）' })).toBeEnabled();
});
it('過去のボードは日付と過去であることを示し、入力とチップ操作を提供しない', () => {
  const chip = (id: string, rawText: string, quadrant: 'q1') =>
    ({ id, boardDate: PAST, rawText, normText: rawText, quadrant, matchedEntry: null, autoClassified: false, createdAt: 1, updatedAt: 1 });
  useAppStore.setState({ chips: [chip('a', '牛乳', 'q1')], viewingBoardDate: PAST, viewingIsToday: false });
  // クエリで過去の日付を指定した状態。MemoPage の切り替えはこの日付と一致するので読み直さない。
  render(<MemoryRouter initialEntries={[`/?date=${PAST}`]}><MemoPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: `${boardDateLabel(PAST)}（過去のボード）` })).toBeVisible();
  expect(screen.queryByRole('button', { name: '音声メモ開始' })).toBeNull();
  expect(screen.queryByRole('textbox', { name: 'メモを入力' })).toBeNull();
  const chipButton = screen.getByRole('button', { name: 'メモ「牛乳」（未分類）' });
  expect(chipButton).toBeDisabled();
  expect(chipButton).not.toHaveAttribute('aria-haspopup');
  fireEvent.click(chipButton);
  expect(screen.queryByRole('dialog')).toBeNull();
  // 参照専用でも画像共有は提供する（spec: 過去のボードからも画像を共有できる）。
  expect(screen.getByRole('button', { name: '画像で共有' })).toBeEnabled();
  expect(screen.getByRole('link', { name: '当日のボードへ戻る' })).toBeVisible();
});
it('画像共有は表示中のボードの日付とそのチップだけを渡す', () => {
  const chip = (id: string, boardDate: string) =>
    ({ id, boardDate, rawText: id, normText: id, quadrant: 'q1' as const, matchedEntry: null, autoClassified: false, createdAt: 1, updatedAt: 1 });
  useAppStore.setState({ chips: [chip('today', TODAY), chip('past', PAST)] });
  vi.mocked(boardImageFile).mockReturnValue(PNG());
  vi.mocked(shareFile).mockResolvedValue(undefined);
  shareImage();
  const [layout, name, boardDate] = vi.mocked(boardImageFile).mock.calls[0];
  expect(boardDate).toBe(TODAY);
  expect(name).toBe(`quadmemo-board-${TODAY}.png`);
  expect(layout.find((cell) => cell.quadrant === 'q1')!.texts).toEqual(['today']);
});
