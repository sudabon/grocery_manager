## Context

現在 `MemoItem`（`src/db/schema.ts:4`）は日付を持たず、`memos` ストアに `id` をキーとして全件が入る。`useAppStore` の `chips` は全件を保持し、`QuadrantGrid` が象限で振り分けるだけで日付の概念が無い。IndexedDB は version 1 で、`memos` に `quadrant` と `createdAt` のインデックスがある（`schema.ts:42-44`）。

`exportFileName`（`src/core/portability.ts:82`）は `date.toISOString().slice(0, 10)` で UTC 日付を使っており、JST 0:00〜9:00 に出力すると前日の日付になる。

動機と決定済みの前提（JST 固定・日付越えでボードを維持・過去は読み取り専用）は proposal.md を参照。

## Goals / Non-Goals

**Goals:**

- 日付の判定が 1 箇所に集まり、端末のタイムゾーン設定に依存しないこと
- 表示中のボードが「当日か過去か」で書き込みの可否が決まり、その判定が store の 1 箇所で効くこと
- 既存メモを失わずに日付へ振り分けられること
- 当日ボードの読み書きが、日付導入前と同じ操作感で動くこと

**Non-Goals:**

- 日付をまたぐチップの移動・コピー（買い忘れの繰り越しなど）
- ボードの削除・アーカイブ・容量管理
- 日付の一覧でのカレンダー表示や検索

## Decisions

### D1: JST 日付は文字列 `YYYY-MM-DD` として持ち、算出は 1 つの純粋関数に閉じる

`src/core/boardDate.ts` に次を置く。

```
JST_OFFSET_MS = 9 * 60 * 60 * 1000
boardDateOf(epochMs: number): string   // JST の YYYY-MM-DD
todayBoardDate(now?: number): string
```

`new Date(epochMs + JST_OFFSET_MS).toISOString().slice(0, 10)` で求める。`toLocaleDateString` に `timeZone: 'Asia/Tokyo'` を渡す案もあるが、環境によって出力形式が揺れるため採らない。固定オフセットで足りる（日本に夏時間は無い）。

日付を `Date` ではなく文字列で持つのは、IndexedDB のキーとして直接使えて辞書順が時系列順に一致するため。

### D2: `MemoItem` に `boardDate` を追加し、`memos` にインデックスを張る

`boards` ストアを新設して親子構造にする案は採らない。ボードはチップの集合以外に属性を持たず（タイトルは日付そのもの）、空のボードを永続化する必要も無い（spec: チップ 0 件の日付は一覧に含めない）。`MemoItem.boardDate` にインデックスを張れば、日付での絞り込みと日付一覧の取得が 1 ストアで済む。

IndexedDB を version 2 へ上げ、`upgrade` で `memos` に `boardDate` インデックスを追加し、既存レコードに `boardDate = boardDateOf(createdAt)` を書き込む（spec: 既存メモの日付への移行）。移行は `upgrade` の中で行い、部分適用が残らないようにする。

### D3: `chips` は「表示中のボードのチップ」に絞り、`viewingBoardDate` を状態に持つ

`useAppStore` に `viewingBoardDate: string` を加え、`chips` はその日付のチップだけを保持する。`initialize` は `todayBoardDate()` を解決して当日分だけを読む。

全件を保持して表示時に絞る案は採らない。日数が増えるとメモリと初期化時間が線形に伸び、当日分しか使わない大半のケースで無駄になる。

「日付越えでボードを維持する」（proposal.md）ので、`viewingBoardDate` は `initialize` とボード切り替えのときだけ更新する。時刻を監視するタイマーは置かない。

### D4: 書き込み可否は `viewingBoardDate === todayBoardDate()` で判定し、store 側で拒否する

`addChips` / `editChip` / `moveChip` / `removeChip` の入口で判定し、過去ボードなら何もせず返す。UI 側（入力バーやアクションシートの非表示）は spec の要求（過去では操作手段を提供しない）を満たすために別途行うが、store 側の判定を最後の砦として残す。

`removeChip` も拒否する（proposal.md の「完全に読み取り専用」）。

判定に `todayBoardDate()` を毎回呼ぶのは、D3 でタイマーを置かない代わりに「書き込みの瞬間に日付が変わっていたら拒否される」挙動になる。これは spec の「表示中のボードを切り替えない」と両立し、前日のボードへ書き込み続けることを防ぐ。この副作用を tasks で明示的にテストする。

### D5: 日付一覧は別画面（`/history`）にする

メモ画面内のドロワーにする案もあるが、spec で固有のパスを要求しており（memo-board の画面遷移）、既存の辞書編集・設定と同じ `secondary-page` の構造に乗せられる。一覧は `boardDate` インデックスの `getAllKeys` 相当で重複を除いて降順に並べる。

### D6: エクスポートは `schemaVersion` を 2 に上げ、版数 1 も受け入れる

メモに `boardDate` が加わるので出力形式が変わる。`parseFullImport` は `schemaVersion` が 1 または 2 を受け入れ、1 の場合は各メモの `createdAt` から `boardDate` を埋める（spec: 日付を持たない旧版のファイルをインポートできる）。

`exportFileName` は JST 日付へ変更する（proposal.md の BREAKING）。これにより辞書エクスポート・全データエクスポート・共有画像のファイル名がすべて JST 基準で揃う。

### D7: 共有画像は日付を描き、ファイル名も対象ボードの日付にする

`boardImageFile` に日付を渡し、見出し領域に年月日を描く。ファイル名は `exportFileName('board')` が「生成日」を使っているため、対象ボードの日付を引数で受け取る形へ変える。

画像内の日付の描画位置は、既存の 4 象限レイアウトの上に帯を足すか、Q2 の見出しに併記するかを実装時に決める。帯を足すと canvas 高さが増えるので、`add-quadmemo-memo-length-limit` の上限計算（高さ 8,266px が最悪ケース）に帯の高さを加算して再確認する。

## Risks / Trade-offs

- **IndexedDB の移行が失敗すると当日ボードも開けない** → `upgrade` 内で完結させ、失敗時は既存の `storageAvailable = false` の経路（保存できない環境の案内）に乗る。移行前のデータは破壊しない（インデックス追加とフィールド追記のみ）
- **`schemaVersion` を上げると新しいエクスポートを旧版アプリで読めない** → 一方向の互換とする。旧版へ戻す運用は想定しない
- **`exportFileName` の JST 化で既存ファイル名の規則が変わる** → JST 0:00〜9:00 に出力したファイルだけが 1 日ずれる。E2E がファイル名の正規表現で日付を検証しているため、固定時刻を注入できる形にする必要がある
- **日付越えの書き込み拒否（D4）が利用者には唐突に見える** → 拒否時に「日付が変わりました」と案内し、次に開いたときに当日ボードへ切り替わることを示す。文言は実装時に決める
- **`add-quadmemo-memo-length-limit` との相互作用** → 上限は「象限ごと」だが、日付で分かれると「日付 × 象限」ごとになる。両方の change を入れる場合、上限の数え方が表示中のボードに閉じることを確認する
- **既存 E2E のほぼ全観点が当日ボードの前提で動く** → 日付を固定できないと、日付越えの瞬間にテストが不安定になる。テスト時に時刻を注入する仕組みが必要（tasks で扱う）

## Migration Plan

1. IndexedDB を version 2 へ上げ、`upgrade` で `boardDate` インデックスを追加し既存レコードへ `boardDateOf(createdAt)` を書き込む
2. `exportFileName` を JST 日付へ変更する
3. `schemaVersion` を 2 に上げ、インポートは 1 と 2 を受け入れる

ロールバックは version 2 のスキーマを残したまま `boardDate` の参照をやめれば表示は元に戻る（フィールドとインデックスが残るだけで害はない）。ただし version 2 のエクスポート JSON は旧版アプリで読めないため、ロールバック時は新しい形式のファイルを取り込めないことを許容する。

## Open Questions

- 日付の一覧に表示する日付の書式（`2026-09-09` か `2026年9月9日` か）。表示のみの選択で、spec の「年月日で読み取れる」を満たす範囲であればどちらでもよい
- 過去ボードで入力バーを隠すか、無効化して残すか。spec は「手段が提供されない」ことだけを要求しており、どちらでも満たせる
