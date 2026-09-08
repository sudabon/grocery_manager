# E2E シード fixture 一覧

test-plan.md の「前提(fixture)」列に書いた fixture 名は、必ずこの表に登録すること。
表を見れば「そのテストがどんな状態から始まるか」が読み手に分かる状態を維持する。

## fixture 名 → 作られる状態

| fixture 名 | 作られる状態 | 使用する TP-ID | 方式 |
|-----------|-------------|---------------|------|
| `seed:empty-board` | メモリ上の空のボードをページロードで用意する (`memo`) | add-quadmemo-quadrant-ui: TP-001〜TP-028 | fixture 直接方式 |
| `env:no-intl-segmenter` | addInitScript で Intl.Segmenter を無効化して開く (`noSegmenter`) | add-quadmemo-quadrant-ui: TP-012 | fixture 直接方式 |
| `env:reduced-motion` | reducedMotion: reduce で開く (`reducedMotionBoard`) | add-quadmemo-quadrant-ui: TP-027 | fixture 直接方式 |
| `env:no-dialog` | showModal を無効化してフォールバックを検証 (`noDialog`) | add-quadmemo-quadrant-ui: TP-026 | fixture 直接方式 |
| `env:deployed-origin` | `E2E_BASE_URL` の HTTPS 配信先を使用。未指定・HTTP 指定・パス/クエリ/ハッシュを含む指定の場合はネットワークアクセス前に skip。データ変更なし | setup-quadmemo-hosting: TP-001〜TP-006 | fixture 直接方式 |

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
