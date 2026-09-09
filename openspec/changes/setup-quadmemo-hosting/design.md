## Context

リポジトリには現在アプリコードが存在せず、`openspec/`・`playwright.config.ts`・`tests/e2e/` の骨組みのみがある。アプリコードはこのリポジトリのルートに置く方針とした（`src/`、`infra/`、`index.html` を既存の `openspec/`・`tests/e2e/` と同階層に作る）。

動機は proposal.md - Why を参照。制約は仕様書 §16.1 に準じる:

- DNS は外部レジストラ管理。Route 53 は使わないため、ACM の DNS 検証と配信用 CNAME は人手登録になる
- tfstate は S3 バックエンド + `use_lockfile = true`（DynamoDB ロックテーブル不要）
- 環境は本番 1 面のみ
- CloudFront に紐づける ACM 証明書は us-east-1 でのみ発行可能

本 change の時点ではまだ Vite プロジェクトが無いため、「配信する成果物」はプレースホルダーページになる。

## Goals / Non-Goals

**Goals:**

- `terraform apply` と `scripts/deploy.sh` の 2 つだけで配信面を作り直し・更新できる状態にする
- CloudFront のキャッシュ制御を「エントリポイントは毎回再検証・それ以外は不変」に固定し、後続の PWA change で Service Worker が古いまま固着する事故を構造的に防ぐ
- 後続 change が触らずに済むよう、E2E の実行プロジェクト（`chromium` / `mobile-safari`）を本 change で確定させる

**Non-Goals:**

- ステージング環境・複数 workspace の構築（本番 1 面のみ）
- Route 53 での DNS 管理、ドメイン取得の自動化
- CI からの自動デプロイ（仕様書 §16.4 は任意。ローカルからのデプロイを基本とする）
- WAF・ログ配信・アクセス解析（外部送信ゼロ方針のため解析は入れない）

## Decisions

### D1: S3 + CloudFront + OAC（Amplify / S3 静的ウェブサイトホスティングではなく）

- **採用**: S3 バケットは非公開、CloudFront OAC 経由でのみ読み取り可
- **理由**: 従量課金のみで恒久無料枠に収まり、独自証明書・SPA フォールバック・キャッシュヘッダーをすべて自前で制御できる。バケットを非公開に保てるため、オリジン直叩きによる TLS 無しアクセス経路を残さない
- **代替案**: S3 静的ウェブサイトホスティング（バケット公開が前提になり HTTPS を張れない）、Amplify Hosting（設定は楽だが構成がブラックボックスで、キャッシュヘッダーの細かい制御が難しい）

### D2: SPA フォールバックは CloudFront の `custom_error_response`（403/404 → `/index.html` を 200）

- **理由**: OAC 構成では存在しないキーへのアクセスが 403 で返るため、404 だけでは足りない。両方を `/index.html` の 200 に写し、`error_caching_min_ttl = 0` に設定する。S3 オリジンでは AWS により最小 1 秒のエラーキャッシュが残るため、このフォールバックに限り 1 秒のキャッシュを許容する。ブラウザには `Cache-Control: no-cache` を返す
- **根拠**: [AWS のエラーキャッシュ仕様](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/custom-error-pages-expiration.html)。この例外を通常のエントリポイント応答へ広げない
- **代替案**: CloudFront Functions によるリライト（1 リクエストごとに課金・保守対象が増える。静的 SPA には過剰）

### D3: キャッシュ制御はオブジェクト側の `Cache-Control` に持たせる

- **採用**: カスタムキャッシュポリシーを作成し、`min_ttl = 0`、`default_ttl = 0`、`max_ttl = 31536000` とする。Cookie・クエリ・任意ヘッダーをキャッシュキーに含めず、gzip / Brotli を有効にする。実際の TTL は `deploy.sh` が S3 へ付与する `Cache-Control` で決める
- **根拠**: `Managed-CachingOptimized` は最低 TTL が 1 秒であり、`no-cache` があってもその期間はキャッシュするため採用しない（[AWS のマネージドポリシー仕様](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html)）
- **理由**: 「エントリポイントは `no-cache` / それ以外は 1 年 immutable」という 2 系統をパスパターンではなくファイル単位で表現できる。パスパターンでの振り分け（`/assets/*` に別 behavior）はビルド出力名の変更に弱い。エントリポイントの一覧は `scripts/deploy.sh` の `ENTRYPOINTS` が唯一の出所で、ハッシュ名でないファイルを追加するときはここへ足す
- **リスク**: 除外リストが成果物名とずれると `sw.js` が長期キャッシュされうる → D4 で対処

### D4: エントリポイント除外リストは成果物と突き合わせて検証する

`deploy.sh` の除外対象は `index.html` / `sw.js` / `manifest.webmanifest` / `icons/icon-192.png` / `icons/icon-512.png` / `icons/apple-touch-icon-180.png`。本 change の時点では `sw.js` などは存在しないため `[ -f ]` ガードで安全に空振りさせる。`add-quadmemo-pwa-offline` で `vite-plugin-pwa` を入れた時点で、実際の `dist/` の中身と除外リストを突き合わせるタスクを持たせる。

存在しないエントリポイントは `s3 rm` で削除する（`sync --exclude` の対象は `--delete` でも削除されない）。同期前に S3 のキーとビルド成果物を比較し、削除がある場合はエントリポイント 6 パスに `/*` の無効化を追加する。これは spec の「削除されたファイルが配信から消える」を満たすためで、S3 の削除だけでは長期キャッシュ済みのファイルがエッジに残る。デプロイの完了は無効化の完了待ちまでを含む。

### D5: ACM 検証は `aws_acm_certificate_validation` のステータス待ちのみ

外部 DNS のため `validation_record_fqdns` は指定せず、レジストラへの手動登録後に発行完了（ISSUED）まで待たせる。初回のみ `terraform apply -target=aws_acm_certificate.app` で証明書だけ先行作成する 2 段階適用とする（`-target` はこのブートストラップに限った例外扱い）。

- **注意**: 検証用 CNAME は証明書の自動更新にも使われるため、発行後も削除しない。`outputs.tf` の説明文にこの旨を書く

### D6: M0 の配信物はプレースホルダー、`npm run build` の名前は最初から固定する

`deploy.sh` は `npm run build` を呼び、`dist/` を同期する。本 change では `build` を「`public/placeholder/` を `dist/` へコピーする」実装にしておき、`add-quadmemo-quadrant-ui` で Vite ビルドへ差し替える。こうすると `deploy.sh` は以後変更不要になる。

### D7: E2E は `chromium` と `mobile-safari` の 2 プロジェクト

- **採用**: `playwright.config.ts` に `chromium`（デスクトップ）と `mobile-safari`（WebKit + iPhone デバイスプリセット）を定義
- **理由**: 対象プラットフォームは iOS Safari であり、レイアウト・タップ操作は WebKit + モバイルビューポートで見ないと意味がない。一方でデバッグのしやすさと検出漏れ回避のため Chromium も残す
- **トレードオフ**: 実行時間とフレークのリスクが 2 倍になる。フレークは `retries: 1` の既存設定でリトライ成功として記録される
- **本 change のホスティング E2E は配信先 URL に対して実行する**ため、`E2E_BASE_URL` に CloudFront の配信ドメインを渡した時のみ意味を持つ。ローカル起動先では成立しない観点があることを test-plan に明記する

### D8: 秘密情報と可変値の扱い

`domain_name` と tfstate バケット名は環境依存のため、リポジトリには置かず `.env`（gitignore 対象、雛形は `.env.example`）で与える。`domain_name` は `TF_VAR_domain_name` として渡す（`terraform.tfvars` も使えるが必須ではない）。バックエンド設定は変数化できないため、`versions.tf` の `backend "s3"` はバケット名を持たない部分設定にし、初回 `init` へ `-backend-config="bucket=$QUADMEMO_TFSTATE_BUCKET"` を渡す。

**このリポジトリは公開されているため、バケット名・配信ドメイン・AWS プロファイル名をコードとドキュメントに残さない方針を採る。**バケット名自体は秘密ではないが、S3 の名前空間がグローバルに一意であることと、配信先の特定につながることを踏まえた判断である。

## Risks / Trade-offs

- **レジストラでの DNS 登録漏れ・ミスタイプで `terraform apply` が最大 75 分ハングする** → 出力値をそのままコピーできる形（名前・種別・値のマップ）で提示し、構築手順に「登録後に `dig` で検証してから apply」を入れる
- **`sw.js` が長期キャッシュされ、以後の更新が一切届かなくなる**（最も致命的で復旧が難しい） → D4 の突き合わせタスク、および `add-quadmemo-pwa-offline` の受け入れ観点で `Cache-Control` を実測する
- **`-target` 適用に慣れると通常運用でも使いたくなる** → 初回ブートストラップ限定であることを構築手順に明記
- **CloudFront の作成・変更は反映に数分〜十数分かかる** → 検証は無効化完了後に行う。通常はエントリポイント 6 パス、削除がある場合は `/*` も無効化する
- **AWS 課金**: 無効化は通常 4 パス、削除時はワイルドカード 1 パスを追加する。適用される料金・無料枠は構築時に AWS の現行条件を確認する
- **プレースホルダー配信のまま放置されるリスク** → M0 の完了条件は「HTTPS でプレースホルダーが配信される」ことであり、次 change で実体に差し替わる前提を proposal に明記済み

## Migration Plan

新規構築のため移行なし。ロールバックは以下:

- アプリ内容のロールバック: 前のビルド成果物で `deploy.sh` を再実行（S3 バージョニングは配信用バケットには設定しない。tfstate バケットのみ有効化）
- インフラのロールバック: `terraform destroy`。ただし ACM 証明書とディストリビューションの削除には時間がかかり、レジストラの CNAME も手で消す必要がある

## Environment

環境固有の値は `.env`（gitignore 対象）で管理し、リポジトリには置かない。雛形は `.env.example`。

- 配信サブドメイン: `.env` の `TF_VAR_domain_name`
- AWS プロファイル / リージョン: `.env` の `AWS_PROFILE` / `AWS_REGION`
- tfstate バケット: `.env` の `QUADMEMO_TFSTATE_BUCKET`（初回 `init` の `-backend-config` で渡す）
- 配信 E2E の対象: `.env` の `E2E_BASE_URL`
- 配信用バケット: `quadmemo-app-<AWS アカウント ID>`（既存の命名規則どおり Terraform が決定）
- tfstate キー / ACM リージョン: リポジトリ側で固定（`infra/versions.tf` / `infra/providers.tf`）

## Open Questions

- GitHub Actions + OIDC による自動デプロイ（仕様書 §16.4）は任意項目のため本 change では扱わない。必要になった時点で別 change とする
