## Context

メモ・辞書・設定は IndexedDB にあり、JSON のエクスポートは `src/core/shareExport.ts` が Web Share API（`navigator.canShare({ files })`）優先、非対応時は `<a download>` にフォールバックする。`navigator.share` はユーザージェスチャ内から、`await` を挟まずに呼ぶ必要がある（`add-quadmemo-dictionaries` design - D5）。E2E は `env:web-share-stub` / `env:no-web-share` で共有経路を観測済みだが、現行スタブは `file.text()` で JSON 本文を読む前提である。

動機は proposal.md - Why を参照。要求の原本は specs/board-image-share/spec.md。

## Goals / Non-Goals

**Goals:**

- クリック 1 回で、表示中ボードの PNG を共有シート（またはダウンロード）へ渡す
- 画像内容を画面のスクリーンショットに依存させず、ストア上のラベルとチップから再現する
- 既存の JSON バックアップ経路と受け渡しヘルパを共用し、共有の判定ロジックを二重化しない

**Non-Goals:**

- 画像の永続化、共有履歴、相手側での取り込み
- html2canvas 等の DOM キャプチャライブラリ
- LINE など特定アプリへのディープリンク

## Decisions

### D1: データからキャンバスへ描画し、DOM は撮らない

画面の `quadrant-grid` をキャプチャすると、入力バー・ヘッダー・スクロール位置・はみ出したチップが写り込む。ストアの `chips` と辞書ラベルから 2×2 を描く方が、spec の「ボード以外の操作 UI を含めない」「全チップを含める」を構造として満たせる。

代替として DOM キャプチャは、ライブラリ依存と iOS での欠落リスクがあるため採らない。

象限の視覚配置は既存ボードと同じく左上 Q2・右上 Q1・左下 Q3・右下 Q4 とする。チップは象限内に追加順で並べ、件数に応じて画像高さを伸ばし、切り捨てない。フォントはアプリと同じシステムフォントスタックをキャンバスに指定する（外部フォントは使わない）。

### D2: PNG 生成は同期的に行い、`share()` を同一クリック内で呼ぶ

iOS ではユーザージェスチャが切れると共有シートが出ない。`HTMLCanvasElement#toDataURL('image/png')` は同期のため、クリックハンドラ内で「描画 → File 化 → `shareFile`」まで進める。`toBlob` や `OffscreenCanvas.convertToBlob` は非同期になりジェスチャを失いやすいので使わない。

代替としてプレビュー画面を出して 2 回目のタップで共有する案は、操作が増えるため採らない。

ファイル名は `quadmemo-board-<日付>.png`（日付は既存 `exportFileName` と同じ UTC 日付）。

### D3: `shareExport` を `File` 受け渡しに一般化する

```
shareFile(file: File): Promise<void>   // canShare({ files }) なら share、否则 download
shareExport(value, name)               // JSON File を組み立てて shareFile に委譲
```

JSON エクスポートの呼び出し側はファイル名と挙動を変えない。画像共有は PNG の `File` を直接 `shareFile` に渡す。キャンセル（`AbortError`）は現行どおり通知しない。

### D4: ボタンはメモ画面に置き、ヘッダーは触らない

ヘッダーは「辞書編集 / タイトル / 設定」の 3 列で、共有を足すとタップ領域が潰れる。メモ画面上部（ボードの直上またはヘッダー直下）に「画像で共有」を置く。マイクボタンや入力バーの位置は変えない。

### D5: 画像内容の正しさはユニット、受け渡しは E2E

PNG のピクセルから日本語を読むのは E2E に向かない。描画入力（象限ごとのラベルと本文配列）を純粋関数で組み立て、ユニットテストで全チップ・空ボード・配置を検証する。E2E はボタンの存在、共有スタブへの `image/png` 受け渡し、ダウンロードファイル名、共有後にチップが変わらないこと、オフラインで呼べることを見る。

`tests/e2e/mocks/web-share.ts` は `file.text()` 前提をやめ、`name` / `type` を記録する（JSON テストは `type` が `application/json` であること、または従来どおり text を追加で読む、で回帰させる）。

### D6: オフライン共有は既存 PWA 前提に乗る

画像生成と Web Share / ダウンロードはネットワークを使わない。E2E のオフライン観点は `pwa` プロジェクトの `env:built-app-offline` を再利用する（開発サーバーでは SW キャッシュが本番と一致しないため。`add-quadmemo-pwa-offline` design - D6）。通常の UI 観点は開発サーバーでよい。

## Risks / Trade-offs

- **ユーザージェスチャ切れで iOS の共有シートが出ない** → D2 の同期 `toDataURL`。実機でシートが出ることを受け入れ確認する
- **チップが多いと PNG が縦に長くなる** → 全件掲載を優先し、切り捨てない。極端な件数は実利用の買い物リストでは起きにくい
- **キャンバスの日本語が環境によって欠ける** → システムフォント指定。見た目の差は実機確認。内容の欠落はユニットのレイアウト関数で防ぐ
- **共有スタブ変更が JSON エクスポート E2E を壊す** → `name` に加え `type` を記録し、既存テストは JSON の `type` または text で通す
- **Canvas 非対応・汚染（taint）** → 外部画像を描かないので汚染は起きない。生成失敗時は既存トーストで案内し、DB は触らない

## Migration Plan

新規 UI のためデータ移行なし。ロールバックは共有ボタンと描画コードを戻せば足り、IndexedDB と JSON エクスポート形式は変わらない。

## Open Questions

なし
