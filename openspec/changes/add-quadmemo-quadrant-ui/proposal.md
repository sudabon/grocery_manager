## Why

QuadMemo の中心的な体験は「発話（または手入力）した単語が、4 分割された画面の適切な象限にチップとして並ぶ」ことにある。この体験の骨格＝ボード表示・入力バー・コミット制御・チップ操作を先に確定させることで、後続の分類エンジン・永続化・辞書編集・PWA 化はそれぞれ独立した層として載せられる。

特に iOS Safari 特有の制約（入力欄フォーカス時の自動ズーム、`position: fixed` がキーボードに追従しない、セーフエリア、ユーザージェスチャ内でしか `focus()` が効かない）は、あとから対処すると UI 構造の作り直しになる。したがって M1 の段階でキーボード周りの土台まで作り切る。

## What Changes

- リポジトリを Vite + React 18 + TypeScript プロジェクトとして立ち上げ、`setup-quadmemo-hosting` で置いたプレースホルダー用 `build` スクリプトを Vite ビルドへ差し替える
- 状態管理に Zustand、テストに Vitest を導入する（分類エンジンのユニットテストは次 change で載せる）
- 3 画面のルーティング（`/`、`/dictionaries`、`/settings`）を追加する。辞書編集画面・設定画面は本 change では遷移先の骨組みのみ（内容は `add-quadmemo-dictionaries`）
- メモ画面に 4 象限グリッド（2×2 等分割・十字の区切り線・象限ラベル）とチップ表示を実装する
- 画面下部にマイクボタンと入力バー（テキスト入力欄＋確定ボタン）を実装し、コミットのトリガー 3 種（自動 / 手動 / クローズ時）を実装する
- コミットされたテキストを単語単位のトークンへ分割し、トークンごとにチップを生成してボードへ配置する。本 change では辞書が存在しないため、すべて既定象限（Q4）へ配置される
- チップのタップでアクションシート（象限移動 / 編集 / 削除）を表示する
- トースト表示の仕組みを追加し、1 コミット 50 トークン超過時の通知に使う
- iOS 対応: 入力欄 `font-size: 16px` 以上、`viewport-fit=cover` + `env(safe-area-inset-*)`、`VisualViewport` による入力バー追従、`touch-action: manipulation`、チップの長押しコールアウト抑止
- `prefers-reduced-motion` 尊重、マイクボタン・チップの `aria-label`、アクションシートのフォーカストラップ
- `playwright.config.ts` に `webServer` を追加し、`E2E_BASE_URL` 未指定時はローカルの Vite サーバー（ポート 3000）を自動起動する

本 change の範囲外（後続 change）:

- 辞書とのマッチングによる象限振り分け（`add-quadmemo-classification`）
- IndexedDB への永続化・リロード後の復元（`add-quadmemo-classification`）
- 辞書編集画面・設定画面の中身、エクスポート/インポート（`add-quadmemo-dictionaries`）
- manifest / Service Worker / オフライン動作（`add-quadmemo-pwa-offline`）

## Capabilities

### New Capabilities

- `memo-board`: メモ画面のボード表示、入力バーとコミットの制御、チップの生成・配置・操作、画面遷移、モバイル入力時の操作性に関する外部観測可能な振る舞い

### Modified Capabilities

（なし。`static-hosting` の要求は変わらない）

## Impact

- **新規**: `index.html`、`vite.config.ts`、`src/`（`main.tsx`、`App.tsx`、`pages/`、`components/`、`store/`）、`src/core/tokenize.ts`
- **変更**: `package.json`（Vite・React・Zustand・Vitest の追加、`build` を Vite ビルドへ差し替え、`dev` / `preview` / `test` スクリプト追加）、`playwright.config.ts`（`webServer` 追加）、`README.md`（開発サーバーの起動手順）
- **削除**: `public/placeholder/`（Vite ビルドの成果物が配信物になるため不要）
- **依存**: `react` / `react-dom` / `react-router-dom`（軽量ルーティング）/ `zustand`、dev に `vite` / `@vitejs/plugin-react` / `typescript` / `vitest`
- **後続 change への影響**: 本 change で `dist/` の中身が実アセットになるため、`scripts/deploy.sh` のハッシュ付きアセット長期キャッシュが初めて実効化する（`sw.js` 系の除外は `add-quadmemo-pwa-offline` で確認）
- **データ**: 本 change ではチップはメモリ上のみで保持し、リロードで消える（永続化は次 change）
