# static-hosting Specification

## Purpose
TBD - created by archiving change setup-quadmemo-hosting. Update Purpose after archive.
## Requirements
### Requirement: HTTPS でのアプリ配信

配信基盤は、設定された配信用サブドメインに対する HTTPS リクエストへ、アプリシェル（`index.html`）を返さなければならない（MUST）。HTTP でのリクエストは HTTPS へリダイレクトしなければならない（MUST）。TLS は 1.2 以上のみを受け付けなければならない（MUST）。

#### Scenario: HTTPS のルートアクセスでアプリシェルが返る

- **WHEN** 利用者が `https://<配信サブドメイン>/` を要求する
- **THEN** ステータス 200 でアプリシェルの HTML が返る

#### Scenario: HTTP アクセスが HTTPS へリダイレクトされる

- **WHEN** 利用者が `http://<配信サブドメイン>/` を要求する
- **THEN** HTTPS の同一パスへリダイレクトされ、最終的に 200 でアプリシェルが返る

### Requirement: SPA ルートの直リンク解決

配信基盤は、実体ファイルが存在しないパスへの GET に対して、ステータス 200 でアプリシェル（`/index.html`）を返さなければならない（MUST）。この応答は `Cache-Control: no-cache` を返さなければならない（MUST）。CloudFront のエラーキャッシュ TTL は 0 秒に設定しなければならない（MUST）。ただし、S3 オリジンのエラーに対して AWS が適用する最小 1 秒のエッジキャッシュに限り許容する（MAY）。それ以外の再検証なしのキャッシュは許容しない（MUST NOT）。

#### Scenario: アプリ内ルートへの直リンク

- **WHEN** 利用者が `https://<配信サブドメイン>/dictionaries` を直接開く
- **THEN** ステータス 200 でアプリシェルの HTML が返り、ルーティングはクライアント側で解決される

#### Scenario: アプリ内ルートでのリロード

- **WHEN** 利用者が `/settings` を表示した状態でブラウザをリロードする
- **THEN** ステータス 200 でアプリシェルの HTML が返り、404 のエラーページは表示されない

### Requirement: オリジンの非公開

配信基盤のオリジンストレージは、直接の匿名アクセスを拒否しなければならない（MUST）。配信経路からの読み取りのみを許可しなければならない（MUST）。

#### Scenario: オリジンへの直接アクセスが拒否される

- **WHEN** オリジンストレージの URL へ配信経路を経由せず匿名でアクセスする
- **THEN** アクセスは拒否され（403）、オブジェクトの内容は返らない

### Requirement: 更新が届くキャッシュ制御

配信基盤は、エントリポイント資産（`index.html`、`sw.js`、`manifest.webmanifest`、`icons/icon-192.png`、`icons/icon-512.png`、`icons/apple-touch-icon-180.png`）を再検証なしでキャッシュしてはならない（MUST NOT）。内容ハッシュをファイル名に含むアセットは長期・不変としてキャッシュしなければならない（MUST）。

キャッシュポリシーの最低 TTL と既定 TTL は 0 秒、最大 TTL は 31536000 秒に設定し、オリジンの `Cache-Control` を尊重しなければならない（MUST）。SPA フォールバックに対する上記の最小 1 秒の例外は、通常のエントリポイント応答には適用しない（MUST NOT）。

#### Scenario: エントリポイントは毎回再検証される

- **WHEN** `index.html` を取得する
- **THEN** レスポンスの `Cache-Control` が再検証を要求する値（`no-cache`）である

#### Scenario: ハッシュ付きアセットは長期キャッシュされる

- **WHEN** 内容ハッシュをファイル名に含むアセットを取得する
- **THEN** レスポンスの `Cache-Control` が `public, max-age=31536000, immutable` である

### Requirement: デプロイによる更新反映

デプロイ操作は、ビルド成果物をオリジンへ同期し、成果物に存在しないファイルをオリジンから削除し、エントリポイント資産の配信キャッシュを無効化しなければならない（MUST）。デプロイ完了後、利用者がリロードすると新しいバージョンを取得できなければならない（MUST）。

#### Scenario: デプロイ後にリロードで新バージョンが反映される

- **WHEN** アプリシェルの内容を変更してデプロイ操作を実行し、利用者がブラウザをリロードする
- **THEN** 変更後の内容が表示される

#### Scenario: 削除されたファイルが配信から消える

- **WHEN** ビルド成果物から削除されたファイルがある状態でデプロイ操作を実行する
- **THEN** そのファイルはオリジンからも削除され、配信されない

### Requirement: セキュリティレスポンスヘッダー

配信基盤は、配信するすべての応答にセキュリティレスポンスヘッダー（少なくとも `X-Content-Type-Options: nosniff`、`Strict-Transport-Security`、`X-Frame-Options`）を付与しなければならない（MUST）。

#### Scenario: セキュリティヘッダーが付与される

- **WHEN** アプリシェルを HTTPS で取得する
- **THEN** レスポンスに `X-Content-Type-Options: nosniff` と `Strict-Transport-Security` が含まれる

### Requirement: 配信インフラの再現可能な構成管理

配信基盤の構成はコードとして管理され、初回構築後の再適用で差分が出ない状態でなければならない（MUST）。証明書の DNS 検証レコードと配信用 CNAME はコード管理外（レジストラ手動登録）であるため、登録に必要な値を構成の出力値として提示しなければならない（MUST）。

#### Scenario: 再適用で差分が出ない

- **WHEN** 構築完了後に構成適用コマンドを再実行する
- **THEN** 変更対象リソースが 0 件である

#### Scenario: 手動登録すべき DNS レコードが提示される

- **WHEN** 構成の出力値を参照する
- **THEN** ACM 検証用 CNAME（名前・種別・値）と、配信用 CNAME の向き先ドメイン名が取得できる

