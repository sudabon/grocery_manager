## Context

- メモ画面は `app-shell`（`100dvh` の flex 列）→ `memo-page`（`flex: 1; min-height: 0` の flex 列）→ `quadrant-grid`（`flex: 1; min-height: 0`、2×2 グリッド、各象限が `overflow: auto`）の構造で、象限内スクロールは既に成立している（add-quadmemo-quadrant-ui）
- 入力ドック `.input-dock`（入力バー + マイク）は `position: fixed; bottom: 0` で画面に貼り付き、`memo-page` 側が固定値 `padding-bottom: calc(168px + env(safe-area-inset-bottom))` で場所を空けていた。ドックの実高さ（閉: 148px + セーフエリア、開: 同じ）と連動しない
- 入力バーは iOS でユーザージェスチャ内の同期 `focus()` を成立させるため常時マウントし、閉じている間は `visibility: hidden`（add-quadmemo-quadrant-ui D2）。フロー内に残るので 48px + gap 12px を常に占めていた
- `useVisualViewport` は `visualViewport.offsetTop + height - window.innerHeight` が負のときドックを `transform: translateY(負値)` で持ち上げていた（同 D3）。ボード側は縮まないので、キーボード表示中はドックがボードに重なり象限の末尾が隠れる
- Chrome / Playwright WebKit の iPhone 相当ビューポートでは、閉じた状態でボードとドックの間に 20px の余裕があり、実機（PWA）の「閉じた状態でもボードの下端が帯に隠れる」は再現できなかった。固定値と実機の位置基準（`innerHeight` / `visualViewport` / `fixed` の基準）のずれが疑われるが、値そのものは採取していない

## Goals / Non-Goals

**Goals:**

- ボードの表示領域が入力ドックの実際の描画位置・高さで決まる構造にし、閉じた状態・開いた状態・キーボード表示中のいずれでもボードがドックの裏に隠れないようにする
- 入力バーを閉じている間のドックの高さをマイクボタンと最小限の余白に収める
- 入力欄の常時マウントと同期 `focus()`、コミット制御を変えない

**Non-Goals:**

- キーボード表示中に見出し行やヘッダーを畳んでボードを広げること
- 辞書編集ページなどメモ画面以外のキーボード追従
- ドックのデザイン変更（マイクの大きさ、入力バーとマイクの並び）

## Decisions

### D1: 入力ドックを `position: fixed` からフロー内へ移す

- **採用**: `.input-dock` を `memo-page` の flex 列の最後の要素として `flex: none` で置く。`memo-page` の固定の下パディングは廃止する。ボード（`quadrant-grid` は `flex: 1; min-height: 0`）はドックの直上で終わる
- **理由**: 「ボードの表示領域 = ドックの上まで」を CSS の構造で保証でき、ドックの高さが変わっても（入力バーの開閉、実機の入力欄の高さ差、セーフエリア）追従する。固定値と実機の位置基準のずれという、再現できない不具合の原因を構造ごと無くせる
- **不採用: ドックを `fixed` のまま ResizeObserver でドックの実高さを測ってパディングに反映する**: 測定と反映の 2 系統が要り、キーボードの `transform` 分も別途足す必要がある。フロー配置なら測定が不要
- **`z-index: 2` と `position: relative` は残す**: ディクテーションのヒント（`.dictation-hint`、入力バーの上に絶対配置）がボードの上に重なって描画されるため

### D2: 閉じている入力バーは `collapsed` でフローから外す

- **採用**: 入力バーに `open` に応じて `collapsed` クラスを付け、`.input-bar.collapsed { position: absolute; bottom: 100%; visibility: hidden; }` でフローから外す。閉じている間のドックの高さは `12px + 64px（マイク）+ 12px + セーフエリア`
- **理由**: `display: none` や条件付きレンダリングは D2（常時マウント）に反する。絶対配置なら DOM に残したまま高さを持たない
- **表示と配置のタイミングを分ける**: 表示（`visibility`）は iOS の同期 `focus()` のために従来どおりタップハンドラ内で同期的に切り替える。配置（`collapsed`）は React のコミットで足りる。タップ（discrete event）内の state 更新は描画前に同期でコミットされるため、絶対配置のまま描画される瞬間は無い
- **不採用: `height: 0; overflow: hidden`**: gap の打ち消しが要り、クリップされた入力欄への `focus()` で iOS がキーボードを出すかは未検証。絶対配置 + `visibility` は現状の性質（非表示・非フォーカス・支援技術から除外）をそのまま保つ

### D3: キーボード追従は「ドックの transform」ではなく「メモ画面の下パディング」で行う（add-quadmemo-quadrant-ui D3 を置き換える）

- **採用**: `useVisualViewport(active)` が、レイアウトの下端（`document.documentElement.getBoundingClientRect().bottom` = `100dvh`）と視覚ビューポートの下端（`visualViewport.offsetTop + height`）の差を `--keyboard-inset` として html に公開する。`.memo-page { padding-bottom: var(--keyboard-inset, 0px) }` で、フロー内のドックがキーボードの上へ押し上げられ、同時にボードが縮む
- **理由**: `transform` はレイアウトを変えないのでボードがドックの裏に残る。パディングならボードが縮み、象限内スクロールで末尾まで到達できる。ドックの位置は「レイアウトの下端 − キーボード分」で、従来の `transform` 量と同じ
- **基準を `window.innerHeight` ではなく自分のレイアウトの下端にする**: 求めたいのは「自分のレイアウトのうち視覚ビューポートの外にある量」。iOS が `innerHeight` と `visualViewport` の基準をずらしていても、この差は正しく取れる
- **入力バーが開いている間だけ追従する**: キーボードは入力欄のフォーカスでしか出ない。閉じている間は購読せず `--keyboard-inset` を外す。実機の `visualViewport` の値にずれがあっても、閉じた状態のボードの余白には混入しない
- **持ち上がっている間はセーフエリア分の下余白を付けない**: `.input-dock` の下パディングを `12px + max(0, セーフエリア − キーボード分)` にする。キーボードの上にあるときホームバーは関係なく、ボードに 34px（iPhone）を返せる
- **トレードオフ**: `transform` は合成のみで済むがパディングは再レイアウトを伴う。象限は数十チップで、iOS の `resize` はキーボードのアニメーション中に数回しか来ないので実害はない
- **検証の限界**: Playwright はソフトウェアキーボードを出せない。量の算出は単体テスト、量を与えたときの配置は E2E（`--keyboard-inset` を直接セット）、実機のキーボード表示は手動検証に委ねる

### D4: 画面が足りないときの振る舞い

- キーボード分のパディングを足すと、ボードを 0 まで縮めても他の要素（辞書の案内・日付行・ドック）が収まらない場合、ドックはパディングの分だけ押し下げられキーボードに一部隠れる。iPhone SE 相当（667px）でも `ヘッダー 68 + 日付行 56 + ドック 148 + キーボード約 305` は収まるため、要素を畳む対策は入れない（Non-Goals）

## Risks / Trade-offs

- **実機の iOS でキーボード表示時の配置が変わる**（`transform` → パディング） → 位置の計算式は同じで、ボードが縮む点だけが違う。実機手動検証を tasks に置く
- **`open` の state と同期 DOM 操作（`visibility`）の二重管理** → 従来からの構造。`collapsed` は state だけで決まるので新たな二重管理は増やさない
- **`--keyboard-inset` を html に置くことで、メモ画面以外に漏れる** → 消費するのは `.memo-page` だけ。入力バーのアンマウントでプロパティを外す

## Migration Plan

データ・設定・スキーマの変更はない。CSS と入力バー、フックの差し替えのみ。

## Open Questions

なし。
