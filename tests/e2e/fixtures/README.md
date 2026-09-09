# E2E シード fixture 一覧

test-plan.md の「前提(fixture)」列に書いた fixture 名は、必ずこの表に登録すること。
表を見れば「そのテストがどんな状態から始まるか」が読み手に分かる状態を維持する。

## fixture 名 → 作られる状態

| fixture 名 | 作られる状態 | 使用する TP-ID | 方式 |
|-----------|-------------|---------------|------|
| `seed:empty-board` | IndexedDB に初期ラベル・空エントリの4辞書、既定設定、メモ0件を投入する (`memo`)。従来の辞書なし前提を維持 | add-quadmemo-quadrant-ui: TP-001〜TP-028 | fixture 直接方式 |
| `env:no-intl-segmenter` | addInitScript で Intl.Segmenter を無効化して開く (`noSegmenter`) | add-quadmemo-quadrant-ui: TP-012 | fixture 直接方式 |
| `env:reduced-motion` | reducedMotion: reduce で開く (`reducedMotionBoard`) | add-quadmemo-quadrant-ui: TP-027 | fixture 直接方式 |
| `env:no-dialog` | showModal を無効化してフォールバックを検証 (`noDialog`) | add-quadmemo-quadrant-ui: TP-026 | fixture 直接方式 |
| `env:deployed-origin` | `E2E_BASE_URL` の HTTPS 配信先を使用。未指定・HTTP 指定・パス/クエリ/ハッシュを含む指定の場合はネットワークアクセス前に skip。データ変更なし | setup-quadmemo-hosting: TP-001〜TP-006 | fixture 直接方式 |
| `seed:fresh-storage` | 新規ブラウザコンテキストの未作成DB。アプリ自身が初期シードを投入 | add-quadmemo-classification: TP-018 | fixture 直接方式 |
| `seed:dict-basic` | Q1: apple・会議・猫、Q2: ぱん、Q3: 牛乳、Q4: 空。既定設定・メモ0件 | add-quadmemo-classification: TP-001〜006, 011, 013〜015, 020, 023〜024 | fixture 直接方式 |
| `seed:dict-overlap-partial` | Q1: app、Q2: apple。部分一致ON | add-quadmemo-classification: TP-007 | fixture 直接方式 |
| `seed:dict-normalize-tie` | Q1: ＡＰＰＬＥ、Q2: apple。完全一致 | add-quadmemo-classification: TP-008 | fixture 直接方式 |
| `seed:settings-partial-match` | 基本辞書・部分一致ON | add-quadmemo-classification: TP-009〜010 | fixture 直接方式 |
| `seed:settings-no-duplicates` | 基本辞書・重複OFF・Q1にapple 1件 | add-quadmemo-classification: TP-012 | fixture 直接方式 |
| `seed:memos-across-quadrants` | 基本辞書・Q1 apple、Q2 ぱん、Q3 牛乳の3件 | add-quadmemo-classification: TP-016 | fixture 直接方式 |
| `seed:dict-custom-labels` | 保存ラベルを企画・暮らし・食品・保留へ差し替えるが表示には使わない（固定ラベルの検証用）。基本エントリ・部分一致ON・自動確定3000ms・ヒントOFF | add-quadmemo-classification: TP-017, 019 / update-quadmemo-fixed-labels: TP-002, 008 | fixture 直接方式 |
| `env:idb-write-failure` | 基本辞書をシードし読み取り専用 `__QUADMEMO_FAIL_WRITES__` フラグで更新処理を失敗させる（probe・ロードは成功） | add-quadmemo-classification: TP-021 | fixture 直接方式 |
| `env:idb-blocked` | indexedDB 取得時に SecurityError を発生させる | add-quadmemo-classification: TP-022 | fixture 直接方式 |

`env:deployed-origin` は `deployed-origin.ts` の自動 fixture `deployedOrigin` が実装する。
ホスティングのテストは同ファイルの `test` / `expect` を import する。

## 方式について

- **シードAPI方式**: テスト用エンドポイントにシード名を渡し、アプリ側のトランザクションで状態を作る。
  本番コードと同じ経路を通るので不整合が起きにくい。**サーバーを持つアプリでは原則こちらを使う。**
- **fixture 直接方式**: Playwright の fixture から環境やストレージへ直接書き込む。
  シードAPIを用意できない場合に使う。

QuadMemo はサーバーサイドを持たず状態は端末内にしかないため（`quadmemo-spec.md` §1）、
シードAPIを用意できない。したがって**本リポジトリの fixture はすべて fixture 直接方式**になる。
後続 change（`add-quadmemo-quadrant-ui` design - D10 ほか）もこの方式を前提に設計されている。

fixture は各テストの前にべき等に状態を作り直し、テスト間で状態を共有しないこと。

ボード用 fixture は `memo-board.ts` に定義。サーバーを持たずシードAPIを設置できないため、design.md D10 に従いページロードとブラウザ環境設定で準備する。

分類用 fixture は `classification.ts` の `classificationSeed` オプションで上表の名前を選択する。共通の `indexed-db.ts` は `addInitScript` で DB 作成時の upgrade トランザクションにシードを投入し、アプリの接続より先にコミットする。各テストは独立したコンテキストを使い、同一テスト内のリロードでは再シードせず実際の保存結果を検証する。

## 辞書・設定・入出力（add-quadmemo-dictionaries）

`dictionaries.ts` は既存の `classificationSeed` と Page Object を再利用する。

| fixture 名 | 作られる状態 | 使用する TP-ID |
|---|---|---|
| `seed:dict-all-empty` | 初期ラベル・4 象限とも空エントリ・既定設定・メモ 0 件 | TP-009, TP-010 |
| `env:no-web-share` | navigator.share / canShare を無効化（shareMode の既定値） | TP-021, TP-024, TP-028 |
| `env:web-share-stub` | share / canShare をスタブし、渡されたファイルの name / type / size を記録（内容は JSON のときのみ） | TP-029 |
| `seed:dict-basic`（再利用） | 基本辞書と既定設定 | TP-001〜006, TP-008, TP-011〜016, TP-019〜023, TP-028〜030 |
| `seed:memos-across-quadrants`（再利用） | Q1 apple / Q2 ぱん / Q3 牛乳 | TP-007, TP-017〜018, TP-024〜027 |

| 固定ファイル | 用途 |
|---|---|
| `files/dictionaries.json` | 正常な 4 象限辞書。Q1 orange、ラベル 企画・暮らし・食品・保留 |
| `files/broken.json` | 壊れた JSON の拒否と無変更を検証 |
| `files/unsupported.json` | schemaVersion 99 の全データを拒否 |
| `files/collision.json` | 既存 apple と同じ ID で本文・正規化本文が「上書き禁止」のメモと、新しい orange の ID を含む。既存 apple を上書きせず衝突をスキップし新規だけ追加 |
| `files/all-data.json` | 正常な全データ。上書き確認の中止、復元に使用 |

## ボード画像共有（add-quadmemo-board-image-share）

`board-image-share.ts` は `classification.ts` を拡張し、状態は `classificationSeed`、共有環境は `shareMode` で選ぶ。
`memo` fixture（シード投入・遷移・ボード表示待ち）と `externalRequests` は `classification.ts` のものをそのまま継承する。
オフライン観点は `board-image-share-pwa.ts`（`pwa.ts` に共有スタブを重ねたもの）で `pwa` プロジェクトから実行する。

| fixture 名 | 作られる状態 | 使用する TP-ID |
|---|---|---|
| `env:web-share-abort` | `navigator.share` が受け渡しを記録したあと `AbortError` で拒否する（利用者による中止） | TP-005 |
| `env:web-share-failure` | `navigator.share` が受け渡しを記録したあと AbortError 以外のエラーで失敗する | TP-007 |
| `seed:dict-all-empty`（再利用） | 初期ラベル・4 象限とも空エントリ・既定設定・メモ 0 件（spec ファイル冒頭の `test.use` で指定） | TP-001, TP-002 |
| `seed:memos-across-quadrants`（再利用） | Q1 apple / Q2 ぱん / Q3 牛乳 | TP-003〜TP-007, TP-009 |
| `env:web-share-stub`（再利用） | share / canShare をスタブする。PNG は本文を読まず `name` / `type` / `size` を記録する（`shareMode` の既定値） | TP-002, TP-003, TP-006, TP-008, TP-009 |
| `env:no-web-share`（再利用） | navigator.share / canShare を無効化しダウンロードへ固定 | TP-004 |
| `env:built-app-offline`（再利用） | 下表の PWA fixture。共有スタブを重ねて切断状態から実行する | TP-008 |

## PWA fixtures

`pwa.ts` の fixture 直接方式。`pwa` プロジェクト（iPhone 13 の表示・タッチ条件 / Chromium）は開発サーバーではなく
ポート 3001 のビルド成果物を使う。`E2E_PWA_BASE_URL` 指定時は `pwa` が指定先を使い、preview は起動しない。
`E2E_BASE_URL` は既存プロジェクトの接続先と dev の起動省略を制御する。両指定時のみローカルサーバーを両方とも起動しない。
Safari 固有の Service Worker・オフライン動作は iPhone 実機で確認する（design.md - D6）。

| 状態名 | fixture | 作られる状態 | 使用する TP-ID |
|---|---|---|---|
| `env:built-app` | `builtApp` | アプリの「オフライン利用可」表示を待った状態（fixture からページ制御を直接は待たない） | TP-001 / TP-002 / TP-003 / TP-007 / TP-012 |
| `env:built-app-offline` | `builtAppOffline` | 上記の完了後に context をオフラインへ切り替える | TP-003 / TP-004 / TP-005 / TP-006 |
| `env:built-app-offline-first-visit` | `builtAppOfflineFirstVisit` | テスト専用 context の別ページでオフライン初回起動を試み、ナビゲーション失敗とアプリシェルの非表示を記録する | TP-013 |
| `env:sw-update-available` | `swUpdateAvailable` | 実 SW を登録し、ブラウザ API の waiting 状態を注入。通知と非更新時の入力維持を確認する。実適用は実機検証 | TP-007 / TP-008 |
| `env:display-mode-browser` | `displayModeApp` / `swUpdateAvailable`（`displayModeName: 'browser'`、既定値） | matchMedia と navigator.standalone の両方が false、未案内の初期状態 | TP-007 / TP-008 / TP-009 / TP-010 |
| `env:display-mode-standalone` | `displayModeApp`（`displayModeName: 'media'` / `'ios'`） | media のみ true / iOS フラグのみ true を別々に検証 | TP-011 |

`externalRequests` は自動 fixture として初回ナビゲーション前から context の要求を収集する。
各テストは独立した context を使うため、キャッシュや IndexedDB を他テストから引き継がない。

## 固定ラベル（update-quadmemo-fixed-labels）

`dictionaries.ts` の Page Object と登録済み fixture を再利用する。

| fixture | TP-ID |
|---------|-------|
| `seed:dict-basic` | TP-001, 003, 004, 005, 006, 007, 009, 010, 011 |
| `seed:dict-custom-labels` | TP-002, 008（保存ラベルを変えたまま固定表示を検証） |
| `env:web-share-stub` | TP-007 |
| `files/dictionaries.json` | TP-008, 010（旧ラベルを含む正常 JSON） |
| `files/broken.json` | TP-009 |

## メモ文字数上限（add-quadmemo-memo-length-limit）

| fixture | 作られる状態 | TP-ID |
|---------|-------------|-------|
| `seed:quadrant-at-limit` | 基本辞書、Q1 に100文字のメモ、Q2に「ぱん」。Q1 の残り0文字 | TP-002, 004, 005, 011 |
| `seed:quadrant-near-limit` | 基本辞書、Q1 に95文字のメモ、Q2に「ぱん」。Q1 の残り5文字 | TP-001, 003, 006 |
| `files/over-limit.json` | Q1 に101文字のメモ、変更される辞書・設定を含む全データ。原子的な拒否を確認 | TP-011 |
| `seed:dict-basic`（再利用） | 基本辞書・既定設定・空ボード | TP-007, 008, 011 |
| `seed:memos-across-quadrants`（再利用） | 基本辞書とQ1/Q2/Q3の3メモ | TP-009, 010, 012 |
| `env:web-share-stub`（再利用） | JSON共有内容を記録し、拒否前後の全データ比較と復元に利用 | TP-011, 012 |
| `files/all-data.json`（再利用） | ファイル自体は上限内。既存メモと統合すると超過するケース | TP-011 |
