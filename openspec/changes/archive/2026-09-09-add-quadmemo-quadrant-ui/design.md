## Context

`setup-quadmemo-hosting` により、リポジトリルートには `package.json`（`build` はプレースホルダーのコピー）、`infra/`、`scripts/deploy.sh`、`playwright.config.ts`（`chromium` / `mobile-safari` の 2 プロジェクト）がある。アプリコードはまだ無い。

動機は proposal.md - Why を参照。要求は specs/memo-board/spec.md が原本。

技術選定は仕様書 §4 で決まっている（React 18 + TypeScript / Vite / Zustand / `Intl.Segmenter` / Vitest）。本設計はその前提のもとで、**iOS Safari のキーボード制約に耐える UI 構造**と、**後続 change が差し込みやすい層分け**を決めることに焦点を置く。

## Goals / Non-Goals

**Goals:**

- ユーザージェスチャ内での同期 `focus()` が常に成立する DOM 構造にする（iOS でキーボードが出ない事故を構造的に防ぐ）
- コミット処理を「トークン化 → 配置先決定 → ボードへ追加」の 3 段に分け、後続 change が中央の 1 段だけを差し替えられるようにする
- 状態更新の入口を「保存を伴う操作」の粒度に揃え、次 change で永続化を挟むときにコンポーネントを触らずに済むようにする

**Non-Goals:**

- 辞書マッチング、正規化、重複判定（`add-quadmemo-classification`）
- IndexedDB・リロード復元（`add-quadmemo-classification`）
- 辞書編集画面・設定画面の中身（`add-quadmemo-dictionaries`）
- Service Worker・manifest・オフライン（`add-quadmemo-pwa-offline`）
- チップ 1000 件時の仮想化（仕様書 §12 のとおり CSS のみで担保し、仮想化は行わない）

## Decisions

### D1: ルーティングは History API ベース（ハッシュルーティングではない）

- **採用**: `react-router-dom` の `BrowserRouter` で `/`、`/dictionaries`、`/settings`
- **理由**: 配信側（`static-hosting`）が 403/404 → `/index.html` 200 のフォールバックを既に持つため、直リンク・リロードが成立する。ハッシュルーティングは PWA の `start_url` とスコープ指定が読みにくくなる
- **代替案**: 自前の `useState` による画面切り替え（URL を持たないため直リンクが成立せず、spec の「3 画面はそれぞれ固有のパスを持つ」を満たせない）

### D2: 入力欄は常時 DOM に置き、表示だけを切り替える

- **採用**: 入力バー（`<input type="text">` を含む）はメモ画面のマウント時から DOM に存在させ、idle 状態では視覚的に隠す（`visibility` / `transform` による退避。`display: none` や条件付きレンダリングは使わない）
- **理由**: iOS Safari では `focus()` がユーザージェスチャのハンドラ内で**同期的に**呼ばれないとキーボードが出ない。タップで入力バーを条件付きレンダリングしてから `focus()` すると、React のコミット後（＝次フレーム）になり失敗する
- **代替案**: `flushSync` でレンダリングを同期化（React の内部挙動に依存し、レイアウト計算のタイミングも読みにくい）

### D3: キーボード追従は `VisualViewport` + `transform`

- **採用**: `visualViewport` の `resize` / `scroll` を監視し、入力バーを `transform: translateY(...)` で「ビジュアルビューポートの下端」に合わせる。ボードの高さは `100dvh` を基準にする
- **理由**: iOS では `position: fixed; bottom: 0` はキーボード出現時に追従せず、入力バーがキーボードの裏に隠れる
- **トレードオフ**: `visualViewport` 未対応環境ではフォールバックとして `position: fixed` のままにする（デスクトップ Chromium ではキーボードが無いため実害なし）
- **検証の限界**: Playwright はソフトウェアキーボードを出せないため、この挙動は E2E で検証できない（test-plan で実機手動検証へ委譲）

### D4: コミット制御は setTimeout の張り直し + composition ガード

- **採用**: `input` イベントごとに既存タイマーを `clearTimeout` して張り直す。`compositionstart` で自動コミットを抑止し、`compositionend` でタイマーを再開する。確定ボタン・Enter・クローズ時は即時コミット
- **理由**: ディクテーション中の `input` は高頻度で発火するため、単純なデバウンスが最も素直（仕様書 §10-8）。IME 変換中のコミットは誤変換確定を招く
- **既知の割り切り**: ディクテーションは確定済みテキストを遡って修正することがあるが、自動コミット後の修正は反映しない（仕様書 §5.1 の注記どおり許容し、チップ編集で直す運用）
- **切り出し**: コミット制御（タイマー・composition ガード・コミット実行）は `useCommitController` として UI から切り離し、Vitest で単体検証する。IME 変換中の抑止は E2E からは合成イベントに頼らざるを得ず不安定なため、この単体テストが一次的な検証手段になる（test-plan で E2E 対象外として委譲）

### D5: コミットパイプラインは 3 段に分割し、中央だけを差し替える

```
commitText(text)
  → tokenize(text)            // src/core/tokenize.ts（本 change）
  → resolvePlacement(token)   // 本 change では既定象限を返すだけ
  → board.addChips(chips)     // Zustand ストアのアクション
```

- **理由**: `add-quadmemo-classification` は `resolvePlacement` を辞書マッチングの実装へ差し替えるだけでよく、UI とストアに触らずに済む。`memo-board` spec が「分類でマッチしなかったトークンは Q4」と書けているのは、この境界があるため
- **本 change の `resolvePlacement`**: 常に `{ quadrant: 'q4', matchedEntry: null }` を返す。辞書が存在しないため spec のシナリオ「辞書が無い状態ではすべて既定象限へ入る」と一致する

### D6: `tokenize` は `src/core/` の純粋関数として実装し、Vitest で単体検証する

- 仕様書 §7.1 のとおり `Intl.Segmenter('ja', { granularity: 'word' })` で `isWordLike` のみを採用し、未対応環境は空白・句読点（`、。！？,.!?`）での split にフォールバックする
- 複合語の分割粒度（「音声入力」→「音声」「入力」）は補正しない。辞書側を分割後の単位で登録する運用でカバーする（仕様書 §7.1）
- `normalize` / `classify` は次 change で同じディレクトリに追加する

### D7: ストアのアクションは「保存を伴う操作」の粒度に揃える

Zustand ストアの公開アクションは `addChips` / `moveChip` / `editChip` / `removeChip` / `clearAll` のみとする。コンポーネントから配列を直接書き換えない。次 change ではこれらのアクション内部に IndexedDB 書き込みを差し込むだけで永続化が成立する。

### D8: アクションシートはネイティブ `<dialog showModal>`

- **採用**: `<dialog>` の `showModal()`。フォーカストラップと Esc クローズ、背景の不活性化がブラウザ実装で得られる
- **理由**: 自前のフォーカストラップは実装量と抜け漏れが多い。`<dialog>` は iOS Safari 15.4+ で利用可能
- **リスク**: iOS 15.3 以下では動作しない → `HTMLDialogElement` の有無を判定し、非対応時は自前のオーバーレイ + フォーカストラップにフォールバックする
- **代替案**: ライブラリ（`radix-ui` 等）の導入（仕様書 §4 の「ライブラリ依存は最小に」に反する）

### D9: E2E は手入力経路のみを対象にする

- ディクテーション（キーボードのマイクキー）は OS 機能であり Playwright から起動できない。仕様書 §6 のとおり手入力も同じコミットパイプラインを通るため、E2E は入力欄への `fill` / `press` で全観点をカバーする
- `mobile-safari` プロジェクトはビューポート依存（4 象限のレイアウト、象限内スクロール、セーフエリア）の検証に使う。`chromium` は分岐の無いロジック系観点の高速な回帰に使う
- `playwright.config.ts` に `webServer` を追加する。`E2E_BASE_URL` が設定されている場合は起動しない（`setup-quadmemo-hosting` の配信先 E2E と共存させるため）

### D10: E2E fixture は「fixture 直接方式」を採る

`.claude/skills/e2e-conventions/SKILL.md` はシード API 方式を原則とするが、本アプリはサーバーを持たず状態は端末内（本 change ではメモリ、次 change 以降は IndexedDB）にしかない。したがってシード API を用意できないため、Playwright fixture からアプリの初期状態を作る「fixture 直接方式」を採用し、その理由を `tests/e2e/fixtures/README.md` に明記する。

### D11: 象限ラベルの既定値は仕様書のサンプルを採用する

仕様書 付録B-3 のとおりラベル初期値は暫定。本 change では辞書ストアが無いため、`仕事 / 家庭 / 買い物 / その他`（Q1〜Q4）をハードコード既定値として表示する。`add-quadmemo-dictionaries` で辞書の `label` を参照する実装へ切り替え、利用者が変更できるようにする。

### D13: 編集で空文字にした場合はチップを削除する（仕様上の判断）

仕様書には編集結果が空になった場合の記述がない。「空のチップをボードに残す」意味がないため、**編集確定時にテキストが空（空白のみ）ならチップを削除する**と決め、spec のシナリオとして明文化した。編集を取り消したい場合はアクションシートを閉じる操作で行える。

### D12: 同一単語の重複はチップを並べる（個数バッジにしない）

仕様書 付録B-4 の論点。現仕様どおり重複チップを並べる方式を採用する。個数バッジ（「牛乳 ×3」）は導入しない。

## Risks / Trade-offs

- **iOS でキーボードが出ない**（最も起きやすく、UI 構造の作り直しに直結） → D2 の常時マウント構造 + タップハンドラ内同期 `focus()`。実機確認を受け入れ条件に含める
- **入力バーがキーボードに隠れる** → D3。E2E では検出できないため実機手動検証に委譲（test-plan に明記）
- **自動コミットの取りこぼし・二重コミット**（タイマーとクローズ時コミットの競合） → コミット処理を単一の関数に集約し、実行時に必ずタイマーをクリアして入力欄を空にする。E2E で「クローズ時コミット」と「自動コミット」の両方を検証する
- **ディクテーションの遡り修正が失われる** → 仕様どおり許容。チップ編集で救済できることを E2E で確認する
- **`<dialog>` 非対応 iOS** → D8 のフォールバック
- **チップ 1000 件でのスクロール性能** → 仮想化しない方針のため、実機で 1000 件時の描画を確認する受け入れタスクを置く
- **`mobile-safari` プロジェクト追加による E2E 実行時間の増加とフレーク** → 既存の `retries: 1` でリトライ成功はフレークとして記録される。`waitForTimeout` 禁止規約を守り、自動コミット待ちは「チップが現れること」の expect リトライで待つ

## Open Questions

- 象限ラベルの実運用値（仕様書 付録B-3）は D11 のとおりサンプル値で進める。`add-quadmemo-dictionaries` で編集可能になるため、仕様・タスク分割には影響しない
