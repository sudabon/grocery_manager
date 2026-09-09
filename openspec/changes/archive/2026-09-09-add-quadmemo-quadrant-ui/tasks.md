## 1. Vite + React プロジェクトの立ち上げ

- [x] 1.1 `react` / `react-dom` / `react-router-dom` / `zustand` と dev 依存（`vite`、`@vitejs/plugin-react`、`typescript`、`@types/react`、`@types/react-dom`、`vitest`）を導入し、`npm ls --depth=0` で解決できることを確認
- [x] 1.2 `tsconfig.json` を追加（`strict: true`、`jsx: react-jsx`、`moduleResolution: bundler`）し、`npx tsc --noEmit` が通ることを確認
- [x] 1.3 `index.html` をリポジトリルートに作成（`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`、`apple-touch-icon` の枠は `add-quadmemo-pwa-offline` で追加）。`npm run dev` で表示されることを確認
- [x] 1.4 `vite.config.ts` を作成（`@vitejs/plugin-react`、`server.port: 3000`、`preview.port: 3000`）。`npm run dev` がポート 3000 で起動することを確認
- [x] 1.5 `package.json` のスクリプトを更新（`dev`、`build` を Vite ビルドへ差し替え、`preview`、`test` = Vitest）。`npm run build` 後に `dist/index.html` とハッシュ付きアセットが生成されることを確認
- [x] 1.6 `public/placeholder/` を削除し、`npm run build` の出力に placeholder が含まれないことを確認
- [x] 1.7 `scripts/deploy.sh` を変更せずに `npm run build` の成果物が同期対象になることを確認（除外リスト 4 種のうち `index.html` のみ存在する状態で `[ -f ]` ガードが空振りすること）
- [x] 1.8 `README.md` に開発サーバー起動・ビルド・ユニットテストの手順を追記

## 2. アプリの骨格

- [x] 2.1 `src/main.tsx` と `src/App.tsx` を作成し、`BrowserRouter` で `/`（メモ）・`/dictionaries`・`/settings` の 3 ルートを定義。各パスへ直接アクセスして対応する画面が出ることを確認
- [x] 2.2 `src/pages/DictionariesPage.tsx` と `src/pages/SettingsPage.tsx` を骨組みとして作成（見出しとメモ画面へ戻る導線のみ）。両画面から戻れることを確認
- [x] 2.3 `src/store/useAppStore.ts` を作成し、公開アクションを `addChips` / `moveChip` / `editChip` / `removeChip` / `clearAll` に限定（design.md - D7）。ストアの単体テストで各アクションの結果を検証
- [x] 2.4 `src/components/Toast.tsx` を作成（`role="status"`、単一キュー、自動消滅）。表示・消滅を単体テストまたは Storybook 相当の手動確認で検証

## 3. トークン化（core 層）

- [x] 3.1 `src/core/tokenize.ts` を実装（`Intl.Segmenter('ja', { granularity: 'word' })` + `isWordLike` フィルタ + トリム + 空文字除去）
- [x] 3.2 `Intl.Segmenter` 未対応時のフォールバック（空白・`、。！？,.!?` での split）を実装
- [x] 3.3 `src/core/__tests__/tokenize.test.ts` を追加（句読点除去・空文字除去・複数単語分割・フォールバック経路）し、`npm test` が全通過することを確認

## 4. メモ画面のボード

- [x] 4.1 `src/components/QuadrantGrid.tsx` / `Quadrant.tsx` を実装（`display: grid` の 2×2 等分割、十字の区切り線、象限ラベル表示、`overscroll-behavior: contain` による象限内スクロール）。`mobile-safari` 相当のビューポートで 4 象限が等分割されることを確認
- [x] 4.2 象限ラベルの既定値（`仕事` / `家庭` / `買い物` / `その他`）をハードコードで表示（design.md - D11）。4 ラベルが表示されることを確認
- [x] 4.3 `src/components/Chip.tsx` を実装（角丸タグ、`rawText` 表示、未マッチは点線ボーダー + 未分類が分かるアクセシブルな表示、`-webkit-user-select: none` / `-webkit-touch-callout: none` / `touch-action: manipulation`）。未マッチ表示が区別できることを確認
- [x] 4.4 `src/pages/MemoPage.tsx` にヘッダー（辞書編集リンク・設定リンク・アプリ名）を実装し、両リンクからの遷移を確認
- [x] 4.5 チップの配置アニメーション（200ms 程度のフェード + 移動）を実装し、`prefers-reduced-motion: reduce` で無効化されることを確認

## 5. 入力バーとコミット制御

- [x] 5.1 `src/components/MicButton.tsx` を実装（idle / inputting の 2 状態、`aria-label`、直径 64px 以上、セーフエリア分の余白加算）。状態でアイコンとラベルが切り替わることを確認
- [x] 5.2 `src/components/InputBar.tsx` を実装。入力欄は**常時 DOM に置き表示のみ切り替える**構造とし（design.md - D2）、`font-size: 16px` 以上を指定。マイクボタンの click ハンドラ内で同期的に `focus()` することを確認
- [x] 5.3 `VisualViewport` の `resize` / `scroll` を監視して入力バーをビジュアルビューポート下端へ追従させる（未対応環境は `position: fixed` へフォールバック）。Chromium の DevTools でビューポートを縮めて追従することを確認
- [x] 5.4 `src/hooks/useCommitController.ts` を実装（`setTimeout` 張り直しによる自動コミット、`compositionstart` / `compositionend` によるガード、確定ボタン / Enter / クローズ時の即時コミット、コミット後の入力欄クリアとフォーカス維持）
- [x] 5.5 `src/hooks/__tests__/useCommitController.test.ts` を追加（自動コミット発火、変換中は発火しない、変換確定後に再開する、多重コミットが起きない）。`npm test` が全通過することを確認
- [x] 5.6 コミットパイプライン（`tokenize` → `resolvePlacement` → `addChips`）を実装。`resolvePlacement` は常に既定象限（Q4）を返すスタブとし、`add-quadmemo-classification` で差し替える旨をコメントで明示（design.md - D5）
- [x] 5.7 1 コミット 50 トークン超過時に先頭 50 件のみ処理し、トーストで通知することを実装。51 語のコミットで 50 件に止まることを確認
- [x] 5.8 0 トークンのコミットで何も起きない（トーストも出さない）ことを実装・確認
- [x] 5.9 ヒント表示（「キーボードのマイクキー🎤をタップして話してください」）を初回のみ表示する実装。表示条件は設定値 `showDictationHint`（既定 true）を参照するが、設定 UI は `add-quadmemo-dictionaries` で追加する

## 6. チップの操作

- [x] 6.1 `src/components/ChipActionSheet.tsx` を実装（`<dialog showModal>` によるフォーカストラップ、非対応環境は自前オーバーレイへフォールバック（design.md - D8）、Q1〜Q4 移動・編集・削除、現在の象限は非活性）
- [x] 6.2 移動・編集・削除をストアのアクション経由で反映し、手動移動・編集で自動分類対象外（`autoClassified: false` 相当）になることを実装。ストアの単体テストで確認
- [x] 6.3 編集確定時にテキストが空（空白のみ）ならチップを削除する（design.md - D13）。単体テストで確認

## 7. E2E 実行環境

- [x] 7.1 `playwright.config.ts` に `webServer` を追加（`npm run dev`、ポート 3000、`E2E_BASE_URL` が設定されている場合は起動しない）。`npx playwright test --list` が両プロジェクトで解決できることを確認
- [x] 7.2 `tests/e2e/pages/MemoBoardPage.ts` を作成（マイクボタン、入力欄、確定ボタン、象限、チップ、アクションシート、トーストへの getByRole / getByLabel ベースのアクセサ）
- [x] 7.3 `tests/e2e/pages/AppShellPage.ts`（`setup-quadmemo-hosting` で作成済み）にヘッダー導線と辞書編集・設定画面への遷移操作を追加

## E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う（getByRole / getByLabel / getByText 優先、`page.locator()`・XPath 禁止、`waitForTimeout` 禁止、1 テスト = 1 検証意図、タグ必須）。すべてのテストに `@add-quadmemo-quadrant-ui` を付与する。

- [x] E1 fixture `seed:empty-board` を実装（アプリを初期状態で開く。IndexedDB 導入前のためページロードのみ）し、`tests/e2e/fixtures/README.md` の表へ登録（方式: fixture 直接方式、理由は design.md - D10）
- [x] E2 fixture `env:no-intl-segmenter` を実装（`addInitScript` で `Intl.Segmenter` を無効化した状態でアプリを開く）し、`tests/e2e/fixtures/README.md` へ登録
- [x] E3 fixture `env:reduced-motion` を実装（`reducedMotion: 'reduce'` を適用してアプリを開く）し、`tests/e2e/fixtures/README.md` へ登録
- [x] E4 TP-001: 初期表示で 4 象限とラベルが見え、チップが 0 件（tag: `@TP-001`）
- [x] E5 TP-002: あふれた象限内だけがスクロールし末尾チップに到達できる（tag: `@TP-002`）
- [x] E6 TP-003: マイクボタンのタップで入力バーが開き入力欄がフォーカスを持つ（tag: `@TP-003`）
- [x] E7 TP-004: 入力バーを閉じるとマイクボタンが idle 表示に戻る（tag: `@TP-004`）
- [x] E8 TP-005: 無入力の経過で自動コミットされチップが追加される（tag: `@TP-005`）
- [x] E9 TP-006: 確定ボタンで即時コミットされる（tag: `@TP-006`）
- [x] E10 TP-007: Enter キーでコミットされる（tag: `@TP-007`）
- [x] E11 TP-008: コミット後に再タップせず連続入力でき 2 件目のチップが追加される（tag: `@TP-008`）
- [x] E12 TP-009: 入力バーを閉じる操作で未コミットテキストがコミットされる（tag: `@TP-009`）
- [x] E13 TP-010: 複数単語のコミットで単語ごとのチップが順に並ぶ（tag: `@TP-010`）
- [x] E14 TP-011: 句読点のチップが生成されない（tag: `@TP-011`）
- [x] E15 TP-012: 単語分割 API 無効環境でもチップが生成される（tag: `@TP-012`）
- [x] E16 TP-013: 辞書が無い状態で全チップが Q4 に入り他象限が 0 件（tag: `@TP-013`）
- [x] E17 TP-014: 未マッチチップに未分類が分かるアクセシブルな表示が付く（tag: `@TP-014`）
- [x] E18 TP-015: 記号のみのコミットでチップも通知も出ない（tag: `@TP-015`）
- [x] E19 TP-016: 51 語のコミットでチップが 50 件に止まり通知が出る（tag: `@TP-016`）
- [x] E20 TP-017: アクションシートで現在の象限への移動が選択できない（tag: `@TP-017`）
- [x] E21 TP-018: チップを別象限へ移動でき元象限から消える（tag: `@TP-018`）
- [x] E22 TP-019: チップのテキストを編集すると表示が変わる（tag: `@TP-019`）
- [x] E23 TP-020: チップを削除しても他のチップが残る（tag: `@TP-020`）
- [x] E24 TP-021: 編集で空文字にするとチップが削除される（tag: `@TP-021`）
- [x] E25 TP-022: 辞書編集画面へ遷移して戻れる（tag: `@TP-022`）
- [x] E26 TP-023: 設定画面へ遷移して戻れる（tag: `@TP-023`）
- [x] E27 TP-024: 入力欄の実効フォントサイズが 16px 以上（tag: `@TP-024`、`mobile-safari` で実行）
- [x] E28 TP-025: マイクボタンとチップがロール・アクセシブルネームで一意に取得できる（tag: `@TP-025`）
- [x] E29 TP-026: アクションシート表示中にフォーカスがシート外へ出ない（tag: `@TP-026`）
- [x] E30 TP-027: モーション低減環境でチップが待ち時間なく表示される（tag: `@TP-027`）
- [x] E31 TP-028: 確定ボタン連打でチップが重複追加されない（tag: `@TP-028`）
- [x] E32 `npx playwright test --grep @add-quadmemo-quadrant-ui` を chromium / mobile-safari の両プロジェクトで実行し、全件パス（リトライ成功＝フレークが 0 件）であることを確認
- [x] E33 `bash scripts/check-test-plan.sh` が通ることを確認

## 8. 実機手動検証（E2E 対象外の受け入れ）

- [x] 8.1 iPhone 実機の Safari でマイクボタン → キーボード出現 → キーボードのマイクキーで発話 → チップ生成まで通ることを確認
- [x] 8.2 キーボード表示中に入力バーと確定ボタンが隠れないことを実機で確認（test-plan の委譲項目）
- [x] 8.3 マイクボタンがセーフエリア（ホームバー）に被らないことを実機で確認（test-plan の委譲項目）
- [x] 8.4 入力欄フォーカス時に画面が自動拡大されないことを実機で確認（test-plan の委譲項目）
- [x] 8.5 チップ 1000 件を投入し、象限内スクロールと描画が破綻しないことを実機で確認（仕様書 §12）

## 実装時の検証記録（2026-09-08）

- `npm ls --depth=0`、`npx tsc --noEmit`、`npm run build`: 成功。dist は index.html とハッシュ付き JS/CSS のみ。deploy.sh は変更なし。
- `npm test`: 17件成功（IME・多重確定・ストア・トークン化・通知キュー・VisualViewport と未対応時フォールバック）。
- `npm run test:scripts`: 既存80件成功。
- `npx playwright test --grep @add-quadmemo-quadrant-ui`: Chromium / mobile-safari 合計58件成功、リトライ成功0件。TP-001〜TP-028 と dialog 未対応環境を検証。
- `node scripts/e2e-report.mjs add-quadmemo-quadrant-ui --max-age 900`: カバレッジ欠落0件、失敗0件、スキップ0件、フレーク0件。
- `bash scripts/check-test-plan.sh`: 差分0件でskip。未コミットの本変更は `--change add-quadmemo-quadrant-ui` を指定して検証成功。
- `openspec validate add-quadmemo-quadrant-ui --strict`: 成功。
- Chromium の390×844 / 390×460で実画面確認。縮小後の入力ドック下端は460pxでビジュアルビューポート下端と一致。
- 8.1〜8.5はiPhone実機にアクセスできないため未実施。WebKitエミュレーションを実機の受け入れ成功として扱っていない。
