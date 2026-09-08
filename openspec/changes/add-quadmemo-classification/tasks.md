## 1. 正規化と分類（core 層）

- [x] 1.1 `idb` と `ulid` を依存に追加し、`npm ls --depth=0` で解決できることを確認
- [x] 1.2 `src/core/normalize.ts` を実装（NFKC → `toLowerCase()` → カタカナ→ひらがな（`ァ-ヶ` を -0x60）→ `trim`）。順序を固定する理由をコメントに残す（design.md - D3）
- [x] 1.3 `src/core/__tests__/normalize.test.ts` を追加（半角カタカナ、全角英数、カタカナ→ひらがな、前後空白、長音符と漢字かなは吸収しないことの確認）。`npm test` が全通過することを確認
- [x] 1.4 `src/core/classify.ts` に型（`QuadrantId`、`NormalizedDicts`、`ClassifyResult`）と `buildNormalizedDicts()` を実装（完全一致用の Map と部分一致用の配列を同時に構築）（design.md - D2）
- [x] 1.5 `classify(token, dicts, partialMatch)` を実装（完全一致は Map 引き、部分一致は線形走査、最長は正規化後長で判定、同長は Q1 > Q2 > Q3 > Q4、未マッチは Q4 + `matchedEntry: null`、正規化後に空のトークンは破棄）
- [x] 1.6 `src/core/__tests__/classify.test.ts` を追加（完全一致 / 不一致 → Q4 / 正規化で同一になるエントリの象限優先 / 部分一致 ON の双方向一致と最長優先 / 部分一致 OFF では包含が一致しない / 空トークン破棄）。仕様書 §7.4 の観点をすべて含み `npm test` が全通過することを確認
- [x] 1.7 `resolvePlacement` スタブ（`add-quadmemo-quadrant-ui` で作成）を `classify` 呼び出しへ差し替え、正規化済み辞書キャッシュをストアから受け取る形にする。既存の E2E（`@add-quadmemo-quadrant-ui`）が引き続き全通過することを確認

## 2. 永続化層

- [x] 2.1 `src/db/schema.ts` に型定義（`MemoItem` / `Dictionary` / `AppSettings`。仕様書 §8.2 のとおり）と `openQuadmemoDb()`（DB `quadmemo` v1、`memos`（keyPath `id`、index `quadrant` / `createdAt`）、`dictionaries`（keyPath `quadrant`）、`settings`（keyPath `key`））を実装
- [x] 2.2 `src/db/repository.ts` に CRUD を実装（メモの一括追加は 1 トランザクション、象限別取得、更新・削除、辞書の取得・保存、設定の取得・保存）。リポジトリ単体テストで各操作を検証（fake-indexeddb 等のインメモリ実装を利用）
- [x] 2.3 初期データ投入を実装（`dictionaries` が空のときのみ仕様書 §5.2 のシード辞書、`settings` が空のときのみ既定設定を書き込む）。既存データがある場合に上書きしないことを単体テストで確認（design.md - D4）
- [x] 2.4 保存可否の probe 判定を実装（`settings` ストアへ probe を書いて読み戻し、例外・不整合なら「保存不可」と判定）。単体テストで成功・失敗両経路を確認（design.md - D7）
- [x] 2.5 `navigator.storage.persist()` の要求と結果（`granted` / `denied` / `unsupported`）の保持を実装。`persist` をモックした単体テストで 3 経路を確認（design.md - D8）
- [x] 2.6 ULID の生成に `monotonicFactory()` を用い、同一ミリ秒内に 50 件生成しても単調増加することを単体テストで確認（design.md - D5）

## 3. ストアと画面への接続

- [x] 3.1 起動時ロードを実装（メモ・辞書・設定を読み込み、正規化済み辞書キャッシュを構築してストアへ格納）。リロードで状態が戻ることを手動確認
- [x] 3.2 `addChips` / `moveChip` / `editChip` / `removeChip` / `clearAll` の内部に永続化を追加（楽観的更新 → 失敗時 1 回リトライ → なお失敗なら `unsaved` フラグ + エラートースト）（design.md - D6）。ストア単体テストで成功・リトライ成功・リトライ失敗の 3 経路を確認
- [x] 3.3 重複抑止を実装（`allowDuplicates` が false のとき、配置先象限に正規化一致するチップがあれば追加をスキップし、既存チップを一時的に強調表示）。単体テストで判定を確認
- [x] 3.4 象限ラベルの取得元をハードコード既定値から辞書データへ切り替え（`add-quadmemo-quadrant-ui` design - D11 の解消）。ラベル変更済みデータで表示が変わることを手動確認
- [x] 3.5 `src/components/Chip.tsx` に `unsaved` 警告表示と重複時のハイライトを追加。両表示にアクセシブルな名前を付ける
- [x] 3.6 保存不可環境の案内バナーをメモ画面に実装（閉じても再訪時に再表示）。`env:idb-blocked` 相当の状態で表示されることを手動確認
- [x] 3.7 保存失敗を注入するテストフック（読み取り専用のフラグ）を実装し、fixture から有効化できることを確認（design.md - Risks）

## E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う（getByRole / getByLabel / getByText 優先、`page.locator()`・XPath 禁止、`waitForTimeout` 禁止、1 テスト = 1 検証意図）。すべてのテストに `@add-quadmemo-classification` を付与する。

- [x] E1 IndexedDB へ直接シードする共通ヘルパを `tests/e2e/fixtures/` に実装（`addInitScript` で `quadmemo` DB を初期化し、辞書・設定・メモを書き込む）
- [x] E2 fixture `seed:fresh-storage`（保存データ無し）を実装し `tests/e2e/fixtures/README.md` へ登録
- [x] E3 fixture `seed:dict-basic`（Q1: 半角英字エントリと漢字エントリ、Q2: ひらがなエントリ、Q3: 標準エントリ、Q4: 空。設定は既定値）を実装し README へ登録
- [x] E4 fixture `seed:dict-overlap-partial`（部分一致 ON、短いエントリと長いエントリを別象限に配置）を実装し README へ登録
- [x] E5 fixture `seed:dict-normalize-tie`（正規化すると同一になるエントリを Q1 と Q2 に配置）を実装し README へ登録
- [x] E6 fixture `seed:settings-partial-match`（部分一致 ON + 辞書）を実装し README へ登録
- [x] E7 fixture `seed:settings-no-duplicates`（重複許可 OFF + 同語のチップ 1 件）を実装し README へ登録
- [x] E8 fixture `seed:memos-across-quadrants`（複数象限にチップ 3 件）を実装し README へ登録
- [x] E9 fixture `seed:dict-custom-labels`（ラベル変更済みの 4 辞書）を実装し README へ登録
- [x] E10 fixture `env:idb-write-failure`（保存が必ず失敗する状態）を実装し README へ登録
- [x] E11 fixture `env:idb-blocked`（端末内保存が利用できない状態）を実装し README へ登録
- [x] E12 `tests/e2e/pages/MemoBoardPage.ts` に、象限ごとのチップ取得・自動分類/未マッチ/警告表示の判別・強調表示の判別を追加
- [x] E13 TP-001: 全角入力が半角エントリに一致して該当象限へ入る（tag: `@TP-001`）
- [x] E14 TP-002: カタカナ入力がひらがなエントリに一致して該当象限へ入る（tag: `@TP-002`）
- [x] E15 TP-003: かな表記が漢字エントリに一致せず Q4 へ入る（tag: `@TP-003`）
- [x] E16 TP-004: 辞書登録語が該当象限へ自動分類される（tag: `@TP-004`）
- [x] E17 TP-005: 未登録語が Q4 へ未マッチとして入る（tag: `@TP-005`）
- [x] E18 TP-006: 自動分類チップと未マッチチップが見た目で区別できる（tag: `@TP-006`）
- [x] E19 TP-007: 部分一致時に最長エントリの象限が選ばれる（tag: `@TP-007`）
- [x] E20 TP-008: 正規化同一エントリの競合で象限優先順が適用される（tag: `@TP-008`）
- [x] E21 TP-009: 部分一致 ON でトークンがエントリを含む場合に一致する（tag: `@TP-009`）
- [x] E22 TP-010: 部分一致 ON でエントリがトークンを含む場合に一致する（tag: `@TP-010`）
- [x] E23 TP-011: 部分一致 OFF では包含で一致しない（tag: `@TP-011`）
- [x] E24 TP-012: 重複許可 OFF で追加がスキップされ既存チップが強調される（tag: `@TP-012`）
- [x] E25 TP-013: 重複許可 ON で同語チップが 2 件並ぶ（tag: `@TP-013`）
- [x] E26 TP-014: 同じ語を 3 回コミットしても配置先が変わらない（tag: `@TP-014`）
- [x] E27 TP-015: リロード後もチップが復元される（tag: `@TP-015`）
- [x] E28 TP-016: 移動・編集・削除がリロード後も維持される（tag: `@TP-016`）
- [x] E29 TP-017: 保存済み辞書のラベルが表示され分類に使われる（tag: `@TP-017`）
- [x] E30 TP-018: 初回起動で初期ラベルが表示され初期エントリが分類に効く（tag: `@TP-018`）
- [x] E31 TP-019: 再読み込みで初期データに戻らない（tag: `@TP-019`）
- [x] E32 TP-020: チップの並び順がリロード後も同じ（tag: `@TP-020`）
- [x] E33 TP-021: 保存失敗時にチップが残り警告と通知が出る（tag: `@TP-021`）
- [x] E34 TP-022: 保存不可環境で案内が表示される（tag: `@TP-022`）
- [x] E35 TP-023: 一連の操作で配信元以外へのリクエストが発生しない（tag: `@TP-023`）
- [x] E36 TP-024: 50 件の一括コミットがリロード後も欠けなく復元される（tag: `@TP-024`）
- [x] E37 `npx playwright test --grep @add-quadmemo-classification` を chromium / mobile-safari の両プロジェクトで実行し全件パス（フレーク 0 件）を確認
- [x] E38 既存タグ（`@add-quadmemo-quadrant-ui`）のテストも併せて実行し、回帰が無いことを確認
- [x] E39 `bash scripts/check-test-plan.sh` が通ることを確認

## 4. 実機手動検証（E2E 対象外の受け入れ）

- [ ] 4.1 iPhone 実機で発話 → 辞書に応じた象限へ配置されることを確認（カタカナ/ひらがな・全角/半角のゆらぎを含む発話で確認）
- [ ] 4.2 iPhone 実機でリロード後にチップ・辞書・設定が復元されることを確認
- [ ] 4.3 iOS のプライベートブラウズで保存不可の案内が出ることを確認
- [ ] 4.4 `navigator.storage.persist()` の結果が期待どおり取得できることを実機で確認（表示は次 change）

## 実装時の検証記録（2026-09-08）

- `npm ls --depth=0`: idb 8.0.3 / ulid 3.0.2 / fake-indexeddb 6.2.5 の依存解決を確認。
- `npm test`: 10ファイル・76件通過。保存の成功／リトライ成功／リトライ失敗、50件の原子的保存、正規化・分類・重複抑止を含む。
- `npm run build`: TypeScript・Vite production build 成功。
- `npm run test:e2e -- --grep '@add-quadmemo-classification|@add-quadmemo-quadrant-ui' --workers=4`: Chromium / Mobile Safari 計106件通過、フレーク0件（分類48件・既存UI58件）。ブラウザ起動はサンドボックス外で実行。
- `bash scripts/check-test-plan.sh --change add-quadmemo-classification`: 通過。引数なしでは未コミット変更を検査しないため change を明示。
- `openspec validate add-quadmemo-classification --strict`: 通過。
- 390×844のブラウザで、会議・牛乳・未登録語の配置とリロード復元、DBに保存したラベル「企画」の反映、保存不可バナー、保存失敗の警告を目視確認。
- 4.1〜4.4 は未実施。利用環境に iPhone 実機を操作する手段がなく、`xcrun devicectl` も利用不可。Mobile Safari のエミュレーションを実機確認の代替として完了扱いにはしていない。
