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
| `seed:dict-custom-labels` | ラベル: 企画・暮らし・食品・保留。基本エントリ・部分一致ON・自動確定3000ms・ヒントOFF | add-quadmemo-classification: TP-017, 019 | fixture 直接方式 |
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
