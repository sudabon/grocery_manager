## 1. 日付の算出

- [x] 1.1 `src/core/boardDate.ts` に `JST_OFFSET_MS`、`boardDateOf(epochMs): string`（JST の `YYYY-MM-DD`）、`todayBoardDate(now?): string` を追加する（design.md - D1）
- [x] 1.2 `src/core/__tests__/boardDate.test.ts` を追加し、JST 0:00 の直前・直後、UTC 15:00 前後、うるう日、端末のタイムゾーンを変えても同じ結果になることを検証する（test-plan.md の E2E 対象外 1 行目に対応）

## 2. スキーマと移行

- [x] 2.1 `src/db/schema.ts` の `MemoItem` に `boardDate: string` を追加し、`memos` の `indexes` に `boardDate` を加える
- [x] 2.2 `openQuadmemoDb` を version 2 へ上げ、`upgrade` で `boardDate` インデックスを追加し、既存レコードへ `boardDate = boardDateOf(createdAt)` を書き込む（design.md - D2）
- [x] 2.3 `src/db/__tests__/repository.test.ts` に、version 1 のデータから version 2 へ移行してメモが失われないこと・各メモの `boardDate` が作成時刻の JST 日付になることを検証するテストを追加する（test-plan.md の E2E 対象外 4 行目に対応）
- [x] 2.4 `src/db/repository.ts` のメモ読み出しを `boardDate` で絞れる形にし、チップがある日付の一覧を新しい順で返す関数を追加する

## 3. 表示中のボードと書き込み可否

- [x] 3.1 `src/store/useAppStore.ts` に `viewingBoardDate: string` を追加し、`initialize` で `todayBoardDate()` を解決して当日分のチップだけを読む（design.md - D3）
- [x] 3.2 ボードを切り替える操作（`viewBoard(date)`）を追加し、指定日付のチップを読み込む
- [x] 3.3 `addChips` / `editChip` / `moveChip` / `removeChip` の入口に「`viewingBoardDate === todayBoardDate()` でなければ何もしない」判定を入れる（design.md - D4）
- [x] 3.4 `addChips` が生成するチップに `boardDate = viewingBoardDate` を持たせる
- [x] 3.5 `src/store/__tests__/useAppStore.test.ts` に、過去ボード表示中の 4 経路がすべて状態を変えないこと、および書き込みの瞬間に日付が変わっていた場合も拒否されることを検証するテストを追加する（test-plan.md の E2E 対象外 2・3 行目に対応）

## 4. 画面

- [x] 4.1 `src/pages/MemoPage.tsx` に表示中のボードの日付を年月日で表示し、当日か過去かを区別できるようにする
- [x] 4.2 過去のボードを表示している間、入力バーとマイクボタンを提供しない（design.md の Open Questions で決めた形にする）
- [x] 4.3 過去のボードでチップをタップしてもアクションシートを開かないようにする
- [x] 4.4 `src/pages/HistoryPage.tsx` を追加し、チップがある日付を新しい順に並べて選択でパス `/history` から当日/過去のボードへ遷移できるようにする。過去のボードが無い場合はその旨を表示する
- [x] 4.5 `src/App.tsx` のルーティングに `/history` を追加し、メモ画面のヘッダーに日付の一覧への導線を追加する
- [x] 4.6 メモ画面へ戻ったときに当日のボードへ切り替わることを実装する（spec: 過去ボードから戻ると当日ボードが表示される）

## 5. エクスポート・インポートと共有画像

- [x] 5.1 `src/core/portability.ts` の `exportFileName` を JST 日付へ変更する（design.md - D6）。`src/core/__tests__/portability.test.ts` の期待値を更新する
- [x] 5.2 `fullExport` の出力に各メモの `boardDate` を含め、`schemaVersion` を 2 に上げる
- [x] 5.3 `parseFullImport` が `schemaVersion` 1 と 2 の両方を受け入れ、1 の場合は `createdAt` から `boardDate` を埋めるようにする。単体テストで両版数の受け入れを検証する
- [x] 5.4 `src/core/boardImage.ts` の `boardImageFile` に対象ボードの日付を渡し、画像に年月日を描く。帯を足す場合は canvas 高さの増分を `add-quadmemo-memo-length-limit` の最悪ケース計算（8,266px）に加算して iOS 面積上限内に収まることを確認する（design.md - D7）
- [x] 5.5 `boardImageLayout` が表示中のボードの日付のチップだけを返すことと、画像に日付が含まれることを単体テストで検証する（test-plan.md の E2E 対象外 6・7 行目に対応）
- [x] 5.6 共有画像のファイル名を対象ボードの日付にする（`exportFileName('board')` の引数化）

## 6. E2E fixture の追加

- [x] 6.1 `env:fixed-clock`（`addInitScript` で `Date.now` と `new Date()` を固定）を追加する。**本 change の実装で最初に用意すること**（test-plan.md のタグ対応の注記）
- [x] 6.2 `env:clock-advanced`（固定時刻を 2 つの日付にまたいで切り替えられる）を追加する
- [x] 6.3 `seed:boards-across-days`（複数の日付にチップがある状態）を追加する
- [x] 6.4 `seed:legacy-memos-without-date`（`boardDate` を持たない version 1 相当のメモ）を追加する
- [x] 6.5 `tests/e2e/fixtures/files/legacy-v1.json`（`schemaVersion` 1 の全データ JSON）を追加する
- [x] 6.6 追加した 5 つの fixture を `tests/e2e/fixtures/README.md` に、作られる状態と使用する TP-ID とともに登録する
- [x] 6.7 既存の全 change の E2E が日付越えで不安定にならないよう、`env:fixed-clock` を既存 fixture へ適用するかを判断し、必要なら適用する

## 7. E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う。全テストに `@add-quadmemo-daily-boards` と `@TP-NNN` を付与する。

- [x] 7.1 TP-001: 日付が変わったあとに開くと白紙のボードと当日の年月日が表示される（`@TP-001`、fixture `env:clock-advanced` + `seed:boards-across-days`）
- [x] 7.2 TP-002: コミットしたチップが当日のボードに属し、日付の一覧に当日が現れる（`@TP-002`、fixture `env:fixed-clock`）
- [x] 7.3 TP-003: 表示したまま日付を進めてもボードとチップが変わらない（`@TP-003`、fixture `env:clock-advanced`）
- [x] 7.4 TP-004: 日付の一覧がチップのある日付だけを新しい順に並べる（`@TP-004`、fixture `seed:boards-across-days` + `env:fixed-clock`）
- [x] 7.5 TP-005: 一覧から過去のボードを開くとその日付のチップと日付が表示され、当日でないことが区別できる（`@TP-005`、同上）
- [x] 7.6 TP-006: 過去のボードが無い状態で一覧を開くとその旨が表示される（`@TP-006`、fixture `env:fixed-clock`）
- [x] 7.7 TP-007: 過去のボードでは入力してコミットする手段が提供されない（`@TP-007`、fixture `seed:boards-across-days` + `env:fixed-clock`）
- [x] 7.8 TP-008: 過去のボードでチップを選んでもアクションシートが開かない（`@TP-008`、同上）
- [x] 7.9 TP-009: 一覧へ遷移し過去のボードを開いたあとメモ画面へ戻ると当日のボードになる（`@TP-009`、同上）
- [x] 7.10 TP-010: 端末のタイムゾーンを JST 以外にしても表示される日付が JST の日付である（`@TP-010`、fixture `env:fixed-clock`）
- [x] 7.11 TP-011: 当日のチップが再読み込み後も同じ象限・同じ順序・同じ日付で復元される（`@TP-011`、fixture `env:fixed-clock`）
- [x] 7.12 TP-012: 当日のチップの移動・編集・削除が再読み込み後も維持される（`@TP-012`、fixture `env:fixed-clock`）
- [x] 7.13 TP-013: 再読み込み後も過去の日付のチップが復元され、他の日付が混ざらない（`@TP-013`、fixture `seed:boards-across-days` + `env:fixed-clock`）
- [x] 7.14 TP-014: 日付を持たない既存メモが作成日の JST 日付のボードへ振り分けられ件数が一致する（`@TP-014`、fixture `seed:legacy-memos-without-date`）
- [x] 7.15 TP-015: 全データのエクスポートと復元で各メモが元の日付のボードに戻る（`@TP-015`、fixture `seed:boards-across-days` + `env:web-share-stub` + `env:fixed-clock`）
- [x] 7.16 TP-016: `schemaVersion` 1 の JSON をインポートすると各メモが作成日の JST 日付へ振り分けられる（`@TP-016`、fixture `files/legacy-v1.json` + `env:fixed-clock`）
- [x] 7.17 TP-017: 対応しない版数のインポートが拒否され既存データが変わらない（`@TP-017`、fixture `files/unsupported.json` + `env:fixed-clock`）
- [x] 7.18 TP-018: エクスポートの共有が JST 日付を含むファイル名で呼び出される（`@TP-018`、fixture `env:web-share-stub` + `env:fixed-clock`）
- [x] 7.19 TP-019: 共有非対応環境で JST 日付を含むファイル名でダウンロードできる（`@TP-019`、fixture `env:no-web-share` + `env:fixed-clock`）
- [x] 7.20 TP-020: 当日のボードの画像共有が当日の日付を含むファイル名で呼び出される（`@TP-020`、fixture `env:web-share-stub` + `env:fixed-clock`）
- [x] 7.21 TP-021: 過去のボードの画像共有がその日付のファイル名になり、チップが変わらない（`@TP-021`、fixture `seed:boards-across-days` + `env:web-share-stub` + `env:fixed-clock`）
- [x] 7.22 TP-022: メモ 0 件の当日ボードでも画像共有がエラーにならない（`@TP-022`、fixture `env:fixed-clock`）
- [x] 7.23 TP-023: ヘッダーから辞書編集・設定へ遷移して戻れる（`@TP-023`、fixture `env:fixed-clock`）

## 8. 検証

- [x] 8.1 `npx tsc --noEmit` が exit 0 であることを確認
- [x] 8.2 `npx vitest run` が全件パスすることを確認
- [x] 8.3 `bash scripts/check-test-plan.sh --change add-quadmemo-daily-boards` が全 TP-ID の対応を報告することを確認
- [x] 8.4 `npx playwright test --grep "@add-quadmemo-daily-boards"` が全件パス（フレーク 0 件）することを確認
- [x] 8.5 `npx playwright test` の全件実行で既存の全 change に回帰が無いことを確認。特に `add-quadmemo-quadrant-ui`（コミット・チップ操作・画面遷移）、`add-quadmemo-classification`（永続化）、`add-quadmemo-dictionaries`（全データの往復とファイル名）、`add-quadmemo-board-image-share`（共有画像のファイル名）
- [ ] 8.6 実機の iPhone で、当日ボードの作成・過去ボードの参照・過去ボードからの画像共有が動くことを確認
- [ ] 8.7 実機で、JST 0:00 をまたいでアプリを開き直すと当日の白紙ボードから始まることを確認
