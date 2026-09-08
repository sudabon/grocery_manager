# QuadMemo（仮称）実装仕様書

- バージョン: 0.2（ドラフト。v0.2で §16 インフラ構築(Terraform) を追加）
- 作成日: 2026-09-08
- 対象プラットフォーム: iPhone（iOS Safari / ホーム画面追加PWA）

---

## 1. 概要

音声で発話した単語を、画面を座標平面のように4分割した各象限へ自動配置するメモアプリ。
各象限には事前定義された「辞書（単語リスト）」が紐づいており、発話単語がどの辞書にマッチするかで配置先が決まる。

- PWAとしてホーム画面にインストールして利用する（standaloneモード）
- サーバーサイド不要。データはすべて端末内（IndexedDB）に保存
- 完全オフライン動作（音声入力はiOSの端末内ディクテーションに依存）

## 2. 決定事項と前提

| # | 項目 | 内容 | 状態 |
|---|------|------|------|
| 1 | 音声入力方式 | **iOS標準のキーボード音声入力（ディクテーション）** を利用。アプリは入力欄に流れ込むテキストを解析する | 前提（要確認） |
| 2 | 未マッチ単語の扱い | **右下象限（Q4）をデフォルトとして配置** | 確定 |
| 3 | マッチ判定 | **正規化（NFKC・カタカナ→ひらがな・英字小文字化）後の完全一致**をデフォルト。部分一致は設定でON/OFF | 前提（要確認） |
| 4 | Whisper系API方式 | Phase 2の拡張として本仕様の付録に記載。Phase 1では実装しない | 前提 |

> **注意（方式1の制約）**: iOSにはディクテーションをJSから起動するAPIが存在しないため、
> 「マイクボタン」タップで入力欄にフォーカスを移し、ユーザーがキーボードのマイクキーを
> タップして発話する2段階UXとなる。純粋な1タップOn/Offトグルは方式1では実現不可。

## 3. 用語定義

| 用語 | 意味 |
|------|------|
| 象限（Quadrant） | 画面を2×2に分割した各領域。数学の座標平面に倣い、右上=Q1、左上=Q2、左下=Q3、右下=Q4 |
| 辞書（Dictionary） | 象限ごとに定義する単語リスト。Q1〜Q4の4つ |
| チップ（Chip） | 象限内に表示される1単語分のメモ要素 |
| コミット（Commit） | 入力欄のテキストを確定し、分割・分類・配置処理へ流すこと |
| トークン（Token） | コミットされたテキストを単語分割した1単位 |

## 4. 技術スタック

| レイヤ | 採用技術 | 備考 |
|--------|----------|------|
| フレームワーク | React 18 + TypeScript | |
| ビルド | Vite + vite-plugin-pwa（Workbox） | manifest生成・SW precacheを担う |
| 状態管理 | Zustand | 小規模のため軽量なもの |
| 永続化 | IndexedDB（`idb` ライブラリ） | localStorage不使用（容量・構造化のため） |
| 単語分割 | `Intl.Segmenter`（`granularity: 'word'`） | Safari 14.1+でネイティブ対応。形態素解析ライブラリ不要 |
| スタイル | CSS Modules（またはプレーンCSS） | Tailwind可。ライブラリ依存は最小に |
| テスト | Vitest（分類エンジンのユニットテスト必須） | |
| ホスティング | S3 + CloudFront + ACM（従量課金プラン） | 静的配信のみ。サブドメイン運用。IaCはTerraform（§16） |

## 5. 画面仕様

画面は3つ。ルーティングは軽量に（`/`, `/dictionaries`, `/settings`）。

### 5.1 メモ画面（メイン, `/`）

```
┌─────────────┬─────────────┐
│  Q2（左上）  │  Q1（右上）  │
│  label       │  label       │
│  [chip][chip]│  [chip]      │
├─────────────┼─────────────┤
│  Q3（左下）  │  Q4（右下）★ │
│  label       │  label       │
│  [chip]      │  [chip][chip]│
└─────────────┴─────────────┘
│      [ 🎤 音声メモ ]        │  ← 中央下部の大ボタン
└───────────────────────────┘
★ = デフォルト象限（未マッチはここへ）
```

#### レイアウト

- 4象限は `display: grid`（2×2）で等分割。境界に十字の区切り線を表示（座標軸風）
- 各象限の左上（内側）に象限ラベルを小さく表示（辞書のlabelを反映）
- チップは象限内で追加順に折り返し配置（flex-wrap）。あふれた場合は象限内で縦スクロール
- 最下部に高さ約88pxの操作エリアを固定配置し、中央に直径64px以上の円形マイクボタン
- `env(safe-area-inset-bottom)` を操作エリアのpaddingに加算（ホームバー回避）

#### マイクボタンの状態遷移

| 状態 | 表示 | 挙動 |
|------|------|------|
| idle | マイクアイコン（プライマリカラー） | タップで入力バーを表示し、入力欄へフォーカス（=キーボード起動） |
| inputting | 入力バー表示中はボタンを「閉じる」アイコンに変更 | タップで入力バーを閉じる（未確定テキストがあればコミットしてから閉じる） |

#### 入力バー（inputting時のみ表示）

- 画面下部にチャットアプリ風の入力バーを表示: `[テキスト入力欄][確定ボタン]`
- 入力欄は `<input type="text">`、**font-size: 16px以上**（iOSの自動ズーム防止）
- `VisualViewport` APIの `resize` / `scroll` イベントを監視し、キーボードの直上に入力バーを追従させる
- 入力欄の上に薄いヒント表示: 「キーボードのマイクキー🎤をタップして話してください」（初回のみ、設定で常時OFF可）

#### コミットのトリガー（いずれか早い方）

1. **自動コミット**: 最後の `input` イベントから `autoCommitMs`（デフォルト1500ms）経過し、かつIME変換中（composition中）でない場合
2. **手動コミット**: 確定ボタンのタップ、またはEnter（改行）キー
3. **クローズ時コミット**: 入力バーを閉じる操作時に未確定テキストが残っていた場合

コミット後は入力欄をクリアし、フォーカスは維持する（連続発話を可能にするため）。

> ディクテーションは確定済みテキストを遡って修正することがある。自動コミット後の修正は
> 反映されない仕様とする（許容する）。誤変換はチップの編集機能で直す運用。

#### チップの仕様

- 表示: 角丸の小さなタグ。テキストは `rawText`（発話原文）
- 自動分類されたチップ（`matchedEntry` あり）と、デフォルト配置されたチップ（Q4・未マッチ）は視覚的に区別する（例: 未マッチは点線ボーダー）
- **タップ**でアクションシートを表示: 「Q1へ移動 / Q2へ移動 / Q3へ移動 / Q4へ移動 / 編集 / 削除」（現在の象限は非活性）
- 手動移動したチップは `autoClassified: false` となり、以後の再分類対象外
- 配置時は軽いアニメーション（入力バー付近から対象象限へフェード+移動、200ms程度）。`prefers-reduced-motion` 時は無効化

#### ヘッダー（最小限）

- 左: 辞書編集画面へのリンク（📖）
- 右: 設定画面へのリンク（⚙️）
- 中央: アプリ名（またはメモ件数）

### 5.2 辞書編集画面（`/dictionaries`）

- Q1〜Q4のタブまたはアコーディオンで切替
- 各象限について編集できる項目:
  - `label`: 象限名（例: 仕事 / 家庭 / 買い物 / その他）。メモ画面の象限ラベルに反映
  - `entries`: 単語リスト。1行1語のテキストエリア編集（改行区切り）＋保存ボタン
- 保存時の処理: 空行除去 → 前後空白トリム → 正規化後の重複除去 → IndexedDBへ保存 → 正規化済みエントリのキャッシュ再構築
- 補助機能:
  - JSONエクスポート（4辞書一括、後述のスキーマ）
  - JSONインポート（バリデーション付き。不正時はエラー表示し何も変更しない）
- 辞書変更は**既存チップの再分類を行わない**（新規コミット分からのみ適用）

#### 初期シード辞書（例・初回起動時に投入）

```json
{
  "version": 1,
  "dictionaries": [
    { "quadrant": "q1", "label": "仕事",   "entries": ["会議", "資料", "メール", "レビュー"] },
    { "quadrant": "q2", "label": "家庭",   "entries": ["洗濯", "掃除", "料理", "保育園"] },
    { "quadrant": "q3", "label": "買い物", "entries": ["牛乳", "卵", "パン", "洗剤"] },
    { "quadrant": "q4", "label": "その他", "entries": [] }
  ]
}
```

### 5.3 設定画面（`/settings`）

| 設定項目 | 型 | デフォルト | 説明 |
|----------|----|-----------|------|
| partialMatch | boolean | false | 部分一致を許可（§7.3参照） |
| autoCommitMs | number | 1500 | 自動コミットまでの無入力時間（500〜5000msの範囲でスライダー） |
| allowDuplicates | boolean | true | 同一単語の重複チップ登録を許可。falseの場合、同象限に正規化一致するチップがあればスキップ |
| showDictationHint | boolean | true | 入力バーのヒント表示 |

その他の機能:

- メモ全削除（確認ダイアログ2段階）
- 全データエクスポート / インポート（メモ＋辞書＋設定のJSON）
- アプリバージョン・SW更新状態の表示

## 6. 音声入力フロー（Phase 1: キーボードディクテーション）

```
[ユーザー] 🎤ボタンをタップ
    → [アプリ] 入力バー表示・input要素にfocus() → キーボード出現
[ユーザー] キーボードのマイクキーをタップ → 発話
    → [iOS] ディクテーション結果をinput欄へ逐次挿入
    → [アプリ] inputイベントを監視（デバウンスタイマーをリセットし続ける）
[無入力1.5s経過 or 確定ボタン]
    → [アプリ] コミット処理:
         1. 入力欄のテキストを取得しクリア
         2. Intl.Segmenterで単語分割（§7.1）
         3. 各トークンを正規化（§7.2）
         4. 辞書マッチング（§7.3）→ 配置先象限を決定
         5. MemoItemを生成しIndexedDBへ保存
         6. チップを対象象限へアニメーション表示
[ユーザー] 続けて発話（フォーカス維持のため再タップ不要）または閉じるボタン
```

補足:

- ディクテーションの言語・オンライン/オフライン動作はiOS側の設定と機種に依存する（アプリからは制御不可・関知しない）
- 手入力（通常のキーボード入力）でも同じパイプラインを通る。音声専用の分岐は作らない

## 7. 分類エンジン仕様

分類エンジンはUI非依存の純粋関数群として `src/core/` に実装し、ユニットテストの対象とする。

### 7.1 単語分割

```ts
const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });

function tokenize(text: string): string[] {
  return [...segmenter.segment(text)]
    .filter(s => s.isWordLike)          // 句読点・空白・記号を除外
    .map(s => s.segment.trim())
    .filter(s => s.length > 0);
}
```

- `Intl.Segmenter` 未対応環境へのフォールバック: 空白・句読点（、。！？,.!?）でのsplit
- 分割が細かすぎる複合語（例:「音声入力」→「音声」「入力」）への対策は行わない。**辞書側を分割後の単位で登録する運用**でカバーする（辞書編集画面のヘルプに明記）

### 7.2 正規化

辞書エントリとトークンの両方に同一の正規化を適用する。

```ts
function normalize(s: string): string {
  return s
    .normalize('NFKC')                                  // 全角半角・互換文字の統一
    .toLowerCase()                                       // 英字小文字化
    .replace(/[\u30a1-\u30f6]/g,                         // カタカナ→ひらがな
      ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .trim();
}
```

- 長音符（ー）や漢字↔かなの表記ゆらぎ（例:「たまご」vs「卵」）は**吸収しない**。
  必要な場合はユーザーが辞書に両表記を登録する（例:「卵」「たまご」「タマゴ」→ 正規化により後者2つは同一化されるため実質2エントリ）

### 7.3 マッチング

```ts
type QuadrantId = 'q1' | 'q2' | 'q3' | 'q4';
const DEFAULT_QUADRANT: QuadrantId = 'q4';
const QUADRANT_ORDER: QuadrantId[] = ['q1', 'q2', 'q3', 'q4']; // 同点時の優先順

interface ClassifyResult {
  quadrant: QuadrantId;
  matchedEntry: string | null;   // マッチした辞書エントリ（原文）
}

function classify(token: string, dicts: NormalizedDict[], partialMatch: boolean): ClassifyResult {
  const norm = normalize(token);
  let best: { q: QuadrantId; entry: string; len: number } | null = null;

  for (const q of QUADRANT_ORDER) {
    for (const e of dicts[q].normalizedEntries) {
      const hit = partialMatch
        ? norm === e.norm || norm.includes(e.norm) || e.norm.includes(norm)
        : norm === e.norm;
      if (hit && (best === null || e.norm.length > best.len)) {
        best = { q, entry: e.raw, len: e.norm.length };
      }
    }
  }
  return best
    ? { quadrant: best.q, matchedEntry: best.entry }
    : { quadrant: DEFAULT_QUADRANT, matchedEntry: null };
}
```

ルールの明文化:

1. 複数辞書にマッチした場合は**正規化後のエントリ長が最長**のものを採用（より具体的な語を優先）
2. 同長の場合は **Q1 > Q2 > Q3 > Q4** の優先順
3. どの辞書にもマッチしない場合は **Q4（右下）** へ配置し、`matchedEntry: null` とする
4. 部分一致モードでは「トークン⊇エントリ」「エントリ⊇トークン」の双方向を許可
5. 空トークン・正規化後に空になるトークンは破棄

### 7.4 ユニットテスト観点（Vitest・必須）

- 完全一致 / 不一致（→Q4）/ カタカナ・全角半角ゆらぎの一致
- 複数辞書マッチ時の最長優先・同長時の象限優先順
- 部分一致ON時の双方向マッチ、OFF時に部分一致しないこと
- tokenizeの句読点除去・空文字除去
- allowDuplicates=false時のスキップ判定

## 8. データモデル / 永続化

IndexedDB データベース名: `quadmemo`、バージョン: 1。

### 8.1 オブジェクトストア

| ストア | keyPath | インデックス | 内容 |
|--------|---------|--------------|------|
| memos | id | quadrant, createdAt | チップ本体 |
| dictionaries | quadrant | - | 4件固定 |
| settings | key | - | `key: 'app'` の1件 |

### 8.2 型定義

```ts
interface MemoItem {
  id: string;              // ULID（時系列ソート可能）
  rawText: string;         // 発話・入力の原文トークン
  normText: string;        // 正規化済み（重複判定用）
  quadrant: QuadrantId;    // 現在の配置象限
  matchedEntry: string | null;
  autoClassified: boolean; // 手動移動でfalseに
  createdAt: number;       // epoch ms
  updatedAt: number;
}

interface Dictionary {
  quadrant: QuadrantId;
  label: string;
  entries: string[];       // 原文のまま保存。正規化はロード時にメモリ上で実施
  updatedAt: number;
}

interface AppSettings {
  key: 'app';
  partialMatch: boolean;
  autoCommitMs: number;
  allowDuplicates: boolean;
  showDictationHint: boolean;
}
```

### 8.3 エクスポート/インポート スキーマ

```json
{
  "app": "quadmemo",
  "schemaVersion": 1,
  "exportedAt": "2026-09-08T12:00:00+09:00",
  "dictionaries": [ { "quadrant": "q1", "label": "...", "entries": ["..."] } ],
  "memos": [ { "id": "...", "rawText": "...", "quadrant": "q1", "...": "..." } ],
  "settings": { "partialMatch": false, "autoCommitMs": 1500, "allowDuplicates": true }
}
```

- インポート時は `schemaVersion` を検証。メモは既存IDと衝突しないものだけ追加（辞書・設定は上書き確認ダイアログ）
- エクスポートはWeb Share API（`navigator.share` でファイル共有）を第一手段、非対応時は `<a download>` フォールバック

### 8.4 データ保全

- 起動時に `navigator.storage.persist()` を要求し、結果を設定画面に表示
- iOSはインストール済みWebアプリでも長期未使用時等にストレージが削除されるリスクがゼロではないため、**エクスポート機能をバックアップ手段として位置づけ、設定画面で定期バックアップを促す文言を表示**

## 9. PWA要件

### 9.1 manifest.webmanifest

```json
{
  "name": "QuadMemo",
  "short_name": "QuadMemo",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "/",
  "scope": "/",
  "theme_color": "#1a1a2e",
  "background_color": "#1a1a2e",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- 加えて `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">`（180×180）を必ず設置

### 9.2 Service Worker（vite-plugin-pwa / Workbox）

- アプリシェル（HTML/JS/CSS/アイコン）をprecache。戦略はCacheFirst
- 外部リソース依存なし（フォントもシステムフォント使用）のため、ランタイムキャッシュは最小
- 更新検知時（`registerType: 'prompt'`）は画面上部にトースト「新しいバージョンがあります [更新]」を表示し、タップで `skipWaiting` → リロード

### 9.3 インストール導線

- iOSには自動インストールプロンプトがないため、Safariで閲覧中（`display-mode: browser` を検出）かつ未インストール時に、初回のみ案内バナーを表示:
  「共有ボタン → “ホーム画面に追加” でアプリとして使えます」
- `matchMedia('(display-mode: standalone)')` で判定

## 10. iOS固有の実装注意点

1. **入力欄のfont-sizeは16px以上**（フォーカス時の自動ズーム防止）
2. `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` とし、`env(safe-area-inset-*)` でノッチ・ホームバーを回避
3. 高さは `100dvh` を基本とし、キーボード出現時は `VisualViewport` で入力バー位置を補正（`position: fixed; bottom` はキーボードに追従しないため）
4. `focus()` はユーザージェスチャ（ボタンのclickハンドラ）内で同期的に呼ぶこと（非同期後のfocusはキーボードが出ない）
5. スクロールチェイニング防止: 象限内スクロール要素に `overscroll-behavior: contain`
6. 長押しでのテキスト選択・コールアウト抑止: チップに `-webkit-user-select: none; -webkit-touch-callout: none`
7. ダブルタップズーム抑止: 操作要素に `touch-action: manipulation`
8. ディクテーション中の `input` イベントは高頻度で発火するため、デバウンス処理は `setTimeout` の張り直しで実装（rAF不要）

## 11. エラー・エッジケース

| ケース | 挙動 |
|--------|------|
| コミット結果が0トークン | 何もしない（トースト等も出さない） |
| 1コミットで大量トークン（>50） | 先頭50件のみ処理し「50件を超えたため一部のみ登録しました」をトースト表示 |
| IndexedDB書き込み失敗 | チップは画面に残しリトライ（1回）。失敗時はエラートースト＋該当チップに⚠マーク |
| 辞書が全空 | 全トークンがQ4へ。メモ画面に導線「辞書を設定すると自動で振り分けられます」 |
| プライベートブラウズ等でIndexedDB不可 | 起動時に検出し、全画面で「このモードではデータを保存できません」と案内 |
| Intl.Segmenter非対応 | §7.1のフォールバックsplitを使用（機能は継続） |
| 同一normTextの重複（allowDuplicates=false時） | 保存スキップ＋既存チップを一瞬ハイライト |

## 12. 非機能要件

- 初期ロード（キャッシュ済み）: 1秒以内に操作可能
- チップ1000件までスクロール・描画が破綻しないこと（象限単位の仮想化は行わず、CSSのみで担保。超過時は古いものから非表示にせず全件表示）
- 外部送信ゼロ: アナリティクス等を含め、ネットワーク送信を行わない（プライバシー方針として設定画面に明記）
- アクセシビリティ: マイクボタン・チップに `aria-label`、アクションシートはフォーカストラップ

## 13. ディレクトリ構成

```
quadmemo/
├── public/
│   └── icons/
├── src/
│   ├── core/                 # UI非依存・テスト対象
│   │   ├── tokenize.ts
│   │   ├── normalize.ts
│   │   ├── classify.ts
│   │   └── __tests__/
│   ├── db/
│   │   ├── schema.ts         # 型定義・DB初期化・シード
│   │   └── repository.ts     # memos/dictionaries/settingsのCRUD
│   ├── store/
│   │   └── useAppStore.ts    # Zustand
│   ├── components/
│   │   ├── QuadrantGrid.tsx
│   │   ├── Quadrant.tsx
│   │   ├── Chip.tsx
│   │   ├── MicButton.tsx
│   │   ├── InputBar.tsx      # VisualViewport追従・コミット制御
│   │   ├── ChipActionSheet.tsx
│   │   └── Toast.tsx
│   ├── pages/
│   │   ├── MemoPage.tsx
│   │   ├── DictionariesPage.tsx
│   │   └── SettingsPage.tsx
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts            # vite-plugin-pwa設定
├── package.json
├── infra/                    # Terraform一式（§16）
│   ├── versions.tf
│   ├── providers.tf
│   ├── variables.tf
│   ├── acm.tf
│   ├── s3.tf
│   ├── cloudfront.tf
│   └── outputs.tf
└── scripts/
    └── deploy.sh             # ビルド→S3同期→キャッシュ無効化（§16.5）
```

## 14. 開発マイルストーン

| M | 内容 | 完了条件 |
|---|------|----------|
| M0 | インフラ構築（Terraform, §16） | サブドメインのHTTPSでプレースホルダーページが配信される |
| M1 | 静的UI: 4象限グリッド・チップ・入力バー・画面遷移 | 手入力テキストがチップとしてQ4に置ける |
| M2 | 分類エンジン＋IndexedDB永続化 | ユニットテスト全通過。リロード後もチップが復元される |
| M3 | 辞書編集・設定・エクスポート/インポート | 辞書変更が次コミットから反映される |
| M4 | PWA化＋実機検証 | 後述の受け入れ基準をiPhone実機（ホーム画面追加）で全通過 |
| M5 | （任意）Phase 2: Whisper録音モード | 付録A参照 |

## 15. 受け入れ基準（実機・standaloneモードで検証）

- [ ] ホーム画面追加後、オフライン状態で起動・全機能が動作する
- [ ] 🎤ボタン → キーボードマイクキー → 発話で、単語がチップとして正しい象限に配置される
- [ ] 辞書のどれにも無い単語が右下（Q4）に配置され、未マッチの見た目で区別できる
- [ ] カタカナ/ひらがな・全角/半角のゆらぎがある発話結果でもマッチする
- [ ] 連続発話（コミット→継続入力）がフォーカス再タップなしで行える
- [ ] チップのタップ→移動/編集/削除ができ、リロード後も反映されている
- [ ] キーボード出現時に入力バーが隠れない（VisualViewport追従）
- [ ] セーフエリア（ホームバー）にマイクボタンが被らない
- [ ] エクスポートしたJSONを初期化後にインポートして完全復元できる
- [ ] SW更新トーストから新バージョンへ更新できる
- [ ] `https://<サブドメイン>/` で配信され、HTTPアクセスはHTTPSへリダイレクトされる
- [ ] SPAルート（`/dictionaries` 等）の直リンク・リロードで画面が正しく表示される
- [ ] `deploy.sh` 実行後、ブラウザ再読み込みで新バージョンが反映される

## 16. インフラ構築（Terraform）

採用構成（従量課金プラン）: **S3（非公開・OAC経由）+ CloudFront + ACM（us-east-1）**。
DNSは外部レジストラで管理し、サブドメイン（例: `quadmemo.example.com`）のCNAMEでCloudFrontへ向ける。**Route 53は使用しない**。

### 16.1 方針

- Terraform >= 1.10 / AWS Provider `~> 6.0`
- tfstateはS3バックエンド + `use_lockfile = true`（S3ネイティブロック。DynamoDBロックテーブル不要）
- 環境は本番1面のみ（workspace・環境分割はしない）
- CloudFront用のACM証明書は**us-east-1必須**のため、providerエイリアスで対応
- ACMのDNS検証レコードと配信用CNAMEの2レコードは**レジストラ側で手動登録**（Terraform管理外）。検証レコードは証明書の自動更新にも使われるため削除しないこと
- 価格クラスは `PriceClass_200`（日本を含む。恒久無料枠は価格クラスに関係なく適用される）

### 16.2 Terraformコード

#### versions.tf

```hcl
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "<tfstate用バケット名>"   # 事前に手動作成（バージョニング有効）
    key          = "quadmemo/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}
```

#### providers.tf

```hcl
provider "aws" {
  region = "ap-northeast-1"
}

# CloudFrontに紐づけるACM証明書はus-east-1でのみ発行可能
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}
```

#### variables.tf

```hcl
variable "app_name" {
  type    = string
  default = "quadmemo"
}

variable "domain_name" {
  type        = string
  description = "配信用サブドメイン（例: quadmemo.example.com）"
}
```

#### acm.tf

```hcl
resource "aws_acm_certificate" "app" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# 検証用CNAMEをレジストラに登録した後、発行完了（ISSUED）まで待機する。
# validation_record_fqdnsはRoute 53管理時のみ必要。外部DNSの場合は省略し、
# ステータスのポーリングのみ行わせる（デフォルトタイムアウト75分）。
resource "aws_acm_certificate_validation" "app" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.app.arn
}
```

#### s3.tf

```hcl
resource "aws_s3_bucket" "app" {
  bucket = "${var.app_name}-app-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket                  = aws_s3_bucket.app.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront（OAC）からのGetObjectのみ許可
data "aws_iam_policy_document" "app_bucket" {
  statement {
    sid       = "AllowCloudFrontOAC"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.app.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.app.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "app" {
  bucket = aws_s3_bucket.app.id
  policy = data.aws_iam_policy_document.app_bucket.json
}
```

#### cloudfront.tf

```hcl
resource "aws_cloudfront_origin_access_control" "app" {
  name                              = var.app_name
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# no-cache を尊重し、ヘッダー未指定でもキャッシュしない
resource "aws_cloudfront_cache_policy" "app" {
  name        = "${var.app_name}-origin-cache-control"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = var.app_name
  default_root_object = "index.html"
  aliases             = [var.domain_name]
  price_class         = "PriceClass_200" # 日本を含む

  origin {
    domain_name              = aws_s3_bucket.app.bucket_regional_domain_name
    origin_id                = "s3-app"
    origin_access_control_id = aws_cloudfront_origin_access_control.app.id
  }

  default_cache_behavior {
    target_origin_id           = "s3-app"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.app.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
  }

  # SPAルーティング対策: /dictionaries 等の直リンク・リロードをindex.htmlへ
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.app.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
```

> カスタムポリシーの最低・既定 TTL は 0 秒、最大 TTL は 31536000 秒とし、
> 実際のキャッシュ制御はデプロイ時に S3 オブジェクトへ付与するヘッダー（§16.5）で行う。
> `Managed-CachingOptimized` は `no-cache` でも最低 1 秒キャッシュするため使用しない。
> 403/404 フォールバックのエラー TTL は 0 秒とするが、S3 に対して AWS が適用する最小 1 秒のエッジキャッシュのみ許容する。
> この例外は通常のエントリポイント応答には適用せず、ブラウザには `no-cache` を返す。

#### outputs.tf

```hcl
output "acm_validation_records" {
  description = "レジストラに登録する証明書検証用CNAME"
  value = {
    for o in aws_acm_certificate.app.domain_validation_options :
    o.domain_name => {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  }
}

output "cloudfront_domain_name" {
  description = "レジストラでサブドメインのCNAME先に設定する値"
  value       = aws_cloudfront_distribution.app.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "app_bucket" {
  value = aws_s3_bucket.app.id
}
```

### 16.3 構築手順（初回のみ）

証明書検証とディストリビューション作成に依存関係があるため、初回のみ2段階で適用する。

1. tfstate用S3バケットを手動作成（バージョニング有効）→ `terraform init`
2. `terraform apply -target=aws_acm_certificate.app` で証明書のみ先行作成
   （`-target` はこのブートストラップに限った例外的な使用とする）
3. `terraform output acm_validation_records` の内容を**レジストラのDNSにCNAME登録**
4. `terraform apply` — 検証完了を `aws_acm_certificate_validation` が待機し、完了後にディストリビューションまで作成される
5. `terraform output cloudfront_domain_name` の値を、**レジストラのDNSでサブドメインのCNAME**として登録
   （例: `quadmemo` → `dxxxxxxxxxxxx.cloudfront.net`）
6. `https://<サブドメイン>/` の疎通を確認（DNS伝播まで数分〜）

2回目以降は通常の `terraform apply` のみ。

### 16.4 CI/CD（任意）

個人開発のためローカルからのデプロイを基本とするが、自動化する場合はGitHub Actions + OIDC（`aws_iam_openid_connect_provider` + デプロイ用ロール）を追加する。ロールに付与する権限は対象バケットへの `s3:PutObject/DeleteObject/ListBucket` と対象ディストリビューションへの `cloudfront:CreateInvalidation` に限定する。

### 16.5 デプロイスクリプト（scripts/deploy.sh）

実装の正本は [scripts/deploy.sh](scripts/deploy.sh)。初回構築と DNS 伝播後に次を実行する。

```bash
./scripts/deploy.sh
```

- Terraform 出力から配信先を取得し、ビルド成功・非空の `dist/index.html` を確認してから同期する。
- ハッシュ付きアセットは `public, max-age=31536000, immutable` で `--delete` 付き同期する。
- エントリポイント 4 種は `no-cache` で個別にアップロードする。成果物にないものは明示的に削除する（同期からの除外対象は `--delete` でも削除されない）。
- 通常はエントリポイント 4 パス、削除がある場合は `/*` も無効化する。S3 の削除だけでは古いアセットが CDN に残るため、無効化完了までをデプロイに含める。
- **sw.jsを長期キャッシュしないこと**が最重要（古いSWが残ると更新が届かなくなる）
- Vite出力のファイル名は`vite-plugin-pwa`の設定により変わるため、除外リストはビルド成果物に合わせて調整する

---

## 付録A: Phase 2 — Whisper系API方式（1タップトグル）

Phase 1のUX制約（2タップ・キーボード占有）を解消したい場合の拡張。**分類エンジン以降（§7〜8）は共通**で、入力ソースだけ差し替える。

### A.1 構成

```
[PWA] getUserMedia → MediaRecorder（audio/mp4, iOS Safari）
   │  マイクOffタップ or 無音検知で録音停止
   ▼
[API Gateway + Lambda]（APIキー秘匿のためのプロキシ。Go実装可）
   ▼
[STT API]（OpenAI Whisper系 等）→ 転写テキスト
   ▼
[PWA] 既存のコミットパイプライン（tokenize → normalize → classify）へ投入
```

### A.2 要点

- インストール済みPWAでも `getUserMedia` によるマイク利用は可能（初回に許可ダイアログ）
- マイクボタンが真のOn/Offトグルになる。録音中はボタンを赤く点滅＋経過秒数表示
- 録音上限（例: 60秒）とファイルサイズ上限を設ける
- オフライン時は方式1（キーボード入力）へフォールバック
- Lambda側でレート制限（IP/日次）と音声長バリデーションを実装
- 設定画面に「音声認識モード: キーボード / クラウド」の切替を追加

### A.3 追加コスト

- STT API利用料（従量）、API Gateway + Lambdaの運用
- プライバシー方針の変更（音声データが外部送信される旨の明記が必要）

---

## 付録B: 未確定事項（要フィードバック）

1. 音声入力方式をキーボードディクテーション（Phase 1）で確定してよいか
2. マッチ判定のデフォルト（正規化＋完全一致、部分一致は設定制）でよいか
3. 象限ラベルの初期値（仕事/家庭/買い物/その他 はサンプル。実際の用途に合わせて変更可）
4. チップに個数バッジ方式（同一単語をまとめて「牛乳 ×3」表示）の要否 — 現仕様は重複チップを並べる
