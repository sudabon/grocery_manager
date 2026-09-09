## Why

`add-quadmemo-quadrant-ui` の時点では、コミットされた単語はすべて既定象限（Q4）に置かれ、リロードすると消える。QuadMemo の価値は「発話した単語が辞書に従って自動で振り分けられ、あとで見返せる」ことにあるため、分類エンジンと端末内永続化を入れて初めてメモアプリとして成立する。

分類は UI から独立した純粋関数として実装し、正規化・マッチング規則をユニットテストで固定する（仕様書 §7.4 で必須とされている）。永続化を同じ change に含めるのは、「分類結果として決まった象限」が保存対象であり、両者を分けると保存すべきデータ形が二度変わるため。

## What Changes

- `src/core/normalize.ts` を追加し、NFKC 正規化・英字小文字化・カタカナ→ひらがな変換・前後空白除去を実装する（仕様書 §7.2）
- `src/core/classify.ts` を追加し、辞書マッチングによる配置先決定を実装する（完全一致既定、最長一致優先、同長時は Q1 > Q2 > Q3 > Q4、未マッチは Q4）（仕様書 §7.3）
- 部分一致モード（設定 `partialMatch`）で双方向の包含一致を許可する
- `add-quadmemo-quadrant-ui` で置いた `resolvePlacement` スタブを、実際の分類処理へ差し替える
- IndexedDB（DB 名 `quadmemo`、バージョン 1）に `memos` / `dictionaries` / `settings` の 3 ストアを作り、CRUD を担うリポジトリ層を追加する（仕様書 §8.1）
- 初回起動時に 4 象限の辞書（ラベル・初期エントリ）と既定設定をシード投入する（仕様書 §5.2）
- チップの追加・移動・編集・削除を永続化し、リロード後に復元する。メモの識別子は時系列ソート可能な ULID とする
- 象限ラベルの表示元をハードコード既定値から辞書データへ切り替える
- 重複抑止（設定 `allowDuplicates` が false のとき、同象限に正規化一致するチップがあれば保存をスキップし既存チップをハイライト）を実装する
- 書き込み失敗時のリトライ（1 回）とエラー通知・該当チップへの警告表示を実装する（仕様書 §11）
- IndexedDB が使えない環境（プライベートブラウズ等）を起動時に検出し、保存できない旨を案内する
- 起動時に `navigator.storage.persist()` を要求し、結果を参照できる状態で保持する（表示は `add-quadmemo-dictionaries` の設定画面で行う）
- ネットワーク送信を一切行わないことを、E2E で観測可能な形で担保する（仕様書 §12）

本 change の範囲外（後続 change）:

- 辞書エントリ・ラベル・設定値の編集 UI、辞書変更時の振る舞い、エクスポート/インポート（`add-quadmemo-dictionaries`）
- manifest / Service Worker / オフライン起動（`add-quadmemo-pwa-offline`）

## Capabilities

### New Capabilities

- `word-classification`: 入力トークンを正規化し、4 つの辞書と照合して配置先象限を決定する規則。設定による部分一致・重複抑止の振る舞いを含む
- `memo-persistence`: メモ・辞書・設定を端末内に保存し復元する振る舞い。初期データ投入、保存失敗時の扱い、保存不可環境の案内、外部送信ゼロを含む

### Modified Capabilities

（なし。`memo-board` の要求は変わらない。`memo-board` は「分類でマッチしなかったトークンは既定象限へ配置する」と定義しており、本 change はその「分類」の中身を初めて実体化する）

## Impact

- **新規**: `src/core/normalize.ts`、`src/core/classify.ts`、`src/db/schema.ts`、`src/db/repository.ts`、各 `__tests__`
- **変更**: `src/store/useAppStore.ts`（アクション内での永続化・起動時ロード）、`src/pages/MemoPage.tsx`（象限ラベルの取得元、保存不可の案内、チップの警告表示）、`src/components/Chip.tsx`（警告マーク・ハイライト）
- **依存追加**: `idb`（IndexedDB ラッパー）、`ulid`（時系列ソート可能な識別子）
- **データ**: IndexedDB `quadmemo` v1 を新規作成。初回起動でシードが入る。以後の change はこのスキーマを前提にする
- **プライバシー**: 保存先は端末内のみ。ネットワーク送信は行わない
- **既知の制約**: iOS では長期未使用時にストレージが削除されるリスクがあるため、バックアップ手段（エクスポート）は `add-quadmemo-dictionaries` で提供する
