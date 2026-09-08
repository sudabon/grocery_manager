# grocery_manager

買い出し食材管理アプリケーション

## QuadMemo

iPhone 向けの4象限メモアプリ。ホスティング基盤と、入力した単語をチップとして並べるメモ UI を実装しています。分類・永続化・辞書編集・PWA/オフライン対応は後続の OpenSpec change で実装します。

## ローカルでの確認

Node.js 24.15 以上（24.x）または 26 以上（詳細は `package.json` の `engines`）と npm を用意し、リポジトリのルートで実行します。

```bash
npm ci
npm run build
npx playwright install chromium webkit
```

`npm run dev` で http://localhost:3000 を開けます。`npm run build` は型チェック後に Vite で `dist/` を生成します。開発・テストの詳細は末尾の「アプリの開発」を参照してください。

## 配信構成

独自サブドメイン → CloudFront（HTTPS・TLS 1.2 以上）→ OAC → 非公開 S3（東京）の構成です。ACM 証明書は us-east-1 で作成します。DNS は外部レジストラで手動管理し、Route 53 は使用しません。本番 1 環境のみです。

- HTTP は HTTPS にリダイレクトします。403/404 は `index.html` の 200 応答へ変換します。
- カスタムキャッシュポリシーは最低・既定 TTL 0 秒、最大 TTL 31536000 秒です。エントリポイント（`index.html` / `sw.js` / `registerSW.js` / `manifest.webmanifest`）は `no-cache`、それ以外の配信物はすべて 1 年 `immutable` で配信します。ハッシュ名でないファイルを更新できる状態に保つには、`scripts/deploy.sh` の `ENTRYPOINTS` 配列に追加してください（この配列が唯一の出所で、`--exclude`・個別アップロード・無効化パスのすべてに反映されます）。
- S3 フォールバックに限り、エラー TTL を 0 秒に設定しても AWS の最小 1 秒のエッジキャッシュを許容します。通常のエントリポイントにこの例外は適用しません。
- S3 はパブリックアクセスを全ブロックし、CloudFront のサービスプリンシパルに対して `AWS:SourceArn` で対象ディストリビューションに限定したうえで `s3:GetObject` だけを許可します。CloudFront はマネージドのセキュリティヘッダーを付与します。

実装は `infra/` の Terraform（>= 1.10、AWS Provider 6.x）です。状態はバージョニング有効の別 S3 バケットに保存し、S3 ネイティブロックを使います。

### 環境固有の値

配信ドメイン・AWS プロファイル・tfstate バケット名は環境固有のため、リポジトリには置きません。
`.env.example` を `.env` にコピーして記入し、シェルへ読み込んでから各コマンドを実行します。
`.env` は git 管理外です。

```bash
cp .env.example .env
# .env を編集してから
set -a; . ./.env; set +a
```

| 変数 | 決め方 |
|------|--------|
| `AWS_PROFILE` | 配信先アカウントへアクセスできる AWS CLI のプロファイル名 |
| `AWS_REGION` | 配信用 S3 のリージョン（既定 `ap-northeast-1`） |
| `QUADMEMO_TFSTATE_BUCKET` | tfstate を置く S3 バケット名。S3 の名前空間はグローバルに一意なので、他と衝突しない名前を選ぶ |
| `TF_VAR_domain_name` | 配信用サブドメインの FQDN。ラベルを 3 つ以上含むもの（`infra/variables.tf` の検証条件を参照） |
| `E2E_BASE_URL` | 配信 E2E の対象。`TF_VAR_domain_name` と同じホストを `https://` で指定する |

リポジトリ側で固定している値は次のとおりです。

| 項目 | 設定値 | 定義場所 |
|------|--------|----------|
| tfstate キー | `quadmemo/terraform.tfstate` | `infra/versions.tf` |
| ACM リージョン | `us-east-1` | `infra/providers.tf` |
| 配信用バケット | `quadmemo-app-<AWS アカウント ID>` | `infra/s3.tf`（Terraform が決定） |

AWS リソースの作成状況と実環境検証の進捗は [tasks.md](openspec/changes/setup-quadmemo-hosting/tasks.md) を正とします（本 README には進捗を書きません）。tfstate バケット名の利用可否は初回作成時に確認します。

## 初回構築

AWS CLI v2、Terraform、`dig`、外部レジストラでの DNS 編集権限を用意してください。上記の `.env` を読み込んだ状態で実行します。事前に AWS の認証方式に応じてプロファイルを設定し、接続できることを確認してください。

```bash
set -a; . ./.env; set +a
aws sts get-caller-identity
```

作成先アカウントを確認し、tfstate 用バケットを作成します。既存の指定バケットを利用する場合は作成を省き、所有者とバージョニング設定を確認します。

```bash
aws s3api create-bucket --bucket "$QUADMEMO_TFSTATE_BUCKET" \
  --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1
aws s3api put-bucket-versioning --bucket "$QUADMEMO_TFSTATE_BUCKET" \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$QUADMEMO_TFSTATE_BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api get-bucket-versioning --bucket "$QUADMEMO_TFSTATE_BUCKET"
```

`infra/versions.tf` の `backend "s3"` はバケット名を持たない部分設定です。バケット名をリポジトリに残さないため、初回 `init` で渡します。認証情報はコードへ書かず、AWS プロファイルを使用してください。

`domain_name` は `.env` の `TF_VAR_domain_name` から渡るため、`infra/terraform.tfvars` を用意する必要はありません（用意した場合はそちらが優先されます。gitignore 対象です）。

まず全体の plan を確認し、**初回だけ証明書を先行作成**します。

```bash
terraform -chdir=infra init -backend-config="bucket=$QUADMEMO_TFSTATE_BUCKET"
terraform -chdir=infra plan
terraform -chdir=infra apply -target=aws_acm_certificate.app
terraform -chdir=infra output -json acm_validation_records
```

出力された `name`・`type`・`value` をレジストラの DNS に CNAME として登録します。レジストラがドメインを自動補完する場合は二重に付けないようにします。発行後もこの検証レコードを削除しないでください。証明書の自動更新に必要です。

```bash
dig '<出力された検証レコード名>' CNAME
```

応答の CNAME が出力値と一致したら全体を適用します。ACM が ISSUED になるのを Terraform が待ち、その後 CloudFront を作成します。検証用 DNS が未登録だと待機が長時間続くため、先に `dig` で確認してください。検証は最大 30 分で打ち切ります。時間切れになった場合は、検証レコードを `dig` で確認してから `apply` を再実行してください。

```bash
terraform -chdir=infra apply
terraform -chdir=infra output -raw cloudfront_domain_name
```

CloudFront のドメイン名を配信用サブドメインの CNAME の値としてレジストラに登録します。

```bash
dig "$TF_VAR_domain_name" CNAME
terraform -chdir=infra plan
```

向き先が一致し、再実行した plan が `No changes.` であることを確認します。**`-target` は初回の証明書作成限定**です。通常の更新では `terraform -chdir=infra apply` を使います。

## デプロイ

初回構築と DNS 伝播の完了後、同じ AWS プロファイルで実行します。

```bash
./scripts/deploy.sh
```

Terraform の出力から配信先を取得し、ビルド → S3 同期 → 無効化完了待ちまで実行します。ビルド失敗や空の `index.html` ではアップロードしません。

`sync --delete` で古いアセットを削除します。`index.html` / `sw.js` / `registerSW.js` / `manifest.webmanifest` は `no-cache` で個別アップロードし、成果物に存在しないものは S3 から削除します（S3 に実在するものを消すときは stderr へ警告します）。通常はこの 4 パスだけを無効化し、削除がある場合は `/*` 1 パスに置き換えて古いファイルが CDN に残らないようにします。エントリポイントが空、または通常ファイルでない場合は同期前にデプロイを中止します。

デプロイ権限は配信用バケットの一覧取得・書き込み・削除、対象 CloudFront の無効化作成・完了照会、および Terraform 出力を読むための tfstate 読み取りが必要です。AWS の課金条件は利用アカウントの現行プランで確認してください。

```bash
curl -sI "https://$TF_VAR_domain_name/"
curl -sI "http://$TF_VAR_domain_name/"
```

HTTPS は 200、`Cache-Control: no-cache`、`X-Content-Type-Options: nosniff`、HSTS、`X-Frame-Options` を確認します。HTTP は HTTPS へのリダイレクトを確認します。`terraform -chdir=infra output -raw app_bucket` で取得したバケット名を用い、`http://<バケット名>.s3.ap-northeast-1.amazonaws.com/index.html` への匿名アクセスが 403 になることも確認します。

更新確認はアプリの本文を 1 行変更して再デプロイし、ルートと `/settings` のリロードで変更を確認します。削除確認は不要になった検証用ファイルを成果物から削除して再デプロイし、`aws s3 ls` で削除を確認します。SPA フォールバックがあるため、削除 URL は 404 ではなくアプリシェルの 200 になります。ハッシュ付きアセット導入後は `aws s3api head-object --bucket <バケット名> --key <アセットのキー>` で長期キャッシュヘッダーも確認します。

## 検証

配信 E2E は Playwright / TypeScript で実装し、Chromium と WebKit（iPhone 13 プリセット）を使います。`.env` の `E2E_BASE_URL` に実際の配信サブドメインを `https://` で指定し、読み込んだ状態で実行してください。

```bash
npx playwright test --grep @setup-quadmemo-hosting
npx playwright test --project=chromium --grep @setup-quadmemo-hosting
npx playwright test --project=mobile-safari --grep @setup-quadmemo-hosting
```

URL 未指定・HTTP 指定・パス/クエリ/ハッシュを含む指定の場合はホスティング E2E をスキップします。スキップは本番受け入れの成功を意味しません。WebKit のエミュレーションは iPhone 実機検証の代替ではありません。

AWS 接続なしでのコード検証:

```bash
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
terraform fmt -check -recursive infra
bash -n scripts/deploy.sh
npm run test:scripts
bash scripts/check-test-plan.sh --change setup-quadmemo-hosting
```

`npm run test:scripts` は `tests/scripts/` のスクリプト検証を実行します。`check-test-plan.sh` は引数なしなら `origin/main...HEAD` の差分を確認しますが、`openspec/` が git 管理下にない間は差分ベースの検証が成立しないため exit 2 になります。未コミットの change を確認する場合は `--change` を使います。Terraform の backend 無効での検証後、実環境へ適用する際は通常の `terraform init` を実行してください。

## 仕様

- [製品仕様](quadmemo-spec.md)
- [ホスティングの設計](openspec/changes/setup-quadmemo-hosting/design.md)
- [受け入れ仕様](openspec/changes/setup-quadmemo-hosting/specs/static-hosting/spec.md)
- [E2E 検証計画](openspec/changes/setup-quadmemo-hosting/test-plan.md)
- [実装・実環境検証の進捗](openspec/changes/setup-quadmemo-hosting/tasks.md)

## アプリの開発

Node.js 24.15 以上（24.x）または 26 以上で依存を導入し、ポート 3000 の開発サーバーを起動します。

```bash
npm ci
npm run dev
```

`/` はメモボード、`/dictionaries` は辞書編集、`/settings` は設定です。
辞書編集と設定は現在、見出しと戻るリンクのみです。入力した単語はすべて Q4 に入り、
チップをタップすると移動・編集・削除できます。チップはメモリ上で保持し、リロードすると消えます。
音声入力は入力バーを開いた後、OS キーボードのマイクキーを使います。

```bash
npm run build          # 型チェック + dist/ にハッシュ付きアセットを生成
npm run preview        # ビルド成果物をポート 3000 で確認
npm test               # Vitest: トークン化・ストア・入力制御・UI
npm run test:scripts   # 既存の配信/検証スクリプトの回帰テスト
npx playwright install chromium webkit
npx playwright test --grep @add-quadmemo-quadrant-ui
bash scripts/check-test-plan.sh --change add-quadmemo-quadrant-ui
```

`E2E_BASE_URL` 未指定時は Playwright が開発サーバーを起動します。指定時はその URL を使用します。
iPhone のキーボード、音声入力、セーフエリアと 1000 件時の操作感は実機で確認します。
