## Context

配信の現状は `scripts/deploy.sh` に閉じている。バケット名とディストリビューション ID を `terraform -chdir=infra output -raw` から取り、形式を正規表現で検証し、`npm run build` → `aws s3 sync --delete`（ハッシュ付きアセットを `immutable`）→ エントリポイント 6 種を `no-cache` で個別 `cp`／不在なら `rm` → `aws cloudfront create-invalidation` → `wait invalidation-completed`、という順で進む。この一連の手順は変えない。

CI は `.github/workflows/verify.yml` の 2 ジョブ（`scripts` / `terraform`）で、`pull_request` と `push: main` の両方で走る。AWS 接続は必要としない。

`infra/` は S3・CloudFront・ACM を 1 つの state で管理し、`outputs.tf` が `app_bucket` と `cloudfront_distribution_id` を出している。GitHub 側のリソースを扱う provider は入っていない。

自動化する動機は proposal.md - Why を参照。

## Goals / Non-Goals

**Goals:**

- `main` に入った内容が、人手を介さず配信まで到達すること
- 配信に使う AWS 資格情報が短期で、権限が配信先の 2 リソースに閉じること
- 検証の定義が CI と CD で一つであり、同じ内容が二箇所に書かれないこと
- 手元からの `bash scripts/deploy.sh` が従来どおり動くこと

**Non-Goals:**

- `terraform apply` の自動化。インフラ変更は引き続き手元から適用する
- 配信前のステージング環境・カナリアリリース
- 承認ゲート（proposal.md - 記録した前提）
- 既存 workflow の action メジャーバージョン更新（`actions/checkout@v4` などは現状維持。更新は独立した change で扱う）

## Decisions

### D1: `verify.yml` を再利用可能ワークフローにし、`deploy.yml` から呼ぶ

```
.github/workflows/verify.yml   on: pull_request, workflow_call
.github/workflows/deploy.yml   on: push (main)
                               jobs.verify  uses: ./.github/workflows/verify.yml
                               jobs.deploy  needs: verify
```

`verify.yml` の `on` から `push: branches: [main]` を外し、`workflow_call` を足す。main への push では `deploy.yml` が verify を呼ぶため、検証は従来どおり 1 回だけ走る。

代替案を 2 つ検討した。

- **`verify.yml` に deploy ジョブを足す**: 呼び出しは減るが、PR 用のワークフローに配信の責務が混ざる。`permissions` をジョブ単位で書き分ければ PR 実行へ `id-token: write` が漏れることは防げるものの、ワークフロー名（verify）と実態がずれる
- **`workflow_run` で verify 完了後に deploy を起動**: ワークフローは分かれるが、`workflow_run` は既定ブランチ版のワークフロー定義で動き、チェックアウトすべき SHA を自分で解決する必要がある。`github.sha` が契機となった実行の SHA を指さないため、取り違えの余地を持ち込む

再利用可能ワークフローは、この 2 つの欠点をどちらも持たない。

### D2: 配信先は GitHub Environment の変数で渡し、CD から tfstate を読まない

Environment `production` に次を登録する（いずれも秘匿値ではないため secret ではなく variable）。

| 変数 | 例 | 用途 |
|------|----|------|
| `AWS_ROLE_ARN` | `arn:aws:iam::<account>:role/quadmemo-github-actions-deploy` | `configure-aws-credentials` の引き受け先 |
| `AWS_REGION` | `ap-northeast-1` | 同上 |
| `QUADMEMO_APP_BUCKET` | `quadmemo-app-<account>` | `deploy.sh` の同期先 |
| `QUADMEMO_DISTRIBUTION_ID` | `E...` | `deploy.sh` の無効化先 |

`scripts/deploy.sh` は次のように解決する。

```bash
bucket="${QUADMEMO_APP_BUCKET:-}"
distribution_id="${QUADMEMO_DISTRIBUTION_ID:-}"
if [[ -z "$bucket" || -z "$distribution_id" ]]; then
  bucket="${bucket:-$(terraform -chdir=infra output -raw app_bucket)}"
  distribution_id="${distribution_id:-$(terraform -chdir=infra output -raw cloudfront_distribution_id)}"
fi
```

両方が環境変数で与えられていれば `terraform` を一度も呼ばない。CD ジョブに Terraform を入れずに済み、tfstate バケットへの権限も要らない。**形式チェック（`^[a-z][a-z0-9-]{0,39}-app-[0-9]{12}$` と `^[A-Z0-9]+$`）は解決経路によらず従来どおり実行する**。外部から与えられる値になるぶん、この検証の重みは増す。`aws s3 sync --delete` の対象を誤らせないための最後の砦であり、変数を消し忘れた別環境の値や打ち間違いをここで止める。

tfstate を読む案は値の二重管理が起きない利点があるが、CD ロールに state 全体の読み取り権限が必要になる。state には配信以外のリソース情報も含まれるため採らない（proposal.md - 記録した前提）。代償は `terraform apply` で配信先が作り直されたときに Environment 変数の更新が要ることで、`README.md` に手順として残す。

### D3: OIDC の信頼範囲は `sub` の environment で絞り、ブランチ制限は GitHub 側に置く

Environment の変数を読むにはジョブが `environment: production` を宣言する必要があり、宣言すると OIDC トークンの `sub` は次の形になる。

```
repo:sudabon@140196/grocery_manager@1360775157:environment:production
```

（実装時に判明: 2026-07-15 以降に作成されたリポジトリは owner / repo の数値 ID を含む immutable 形式が既定で、名前だけの `repo:sudabon/grocery_manager:...` では一致しない。ID は改名・移管でも変わらないため、完全一致の方針はそのまま成立する）

ブランチ名は `sub` に現れない。IAM の信頼ポリシーで参照できる条件キーは `token.actions.githubusercontent.com:sub` と `:aud` だけなので、**「main からのみ」は IAM では表現できない**。そこで責務を分ける。

| 制限 | 置き場所 |
|------|---------|
| このリポジトリの、この Environment からのみ | IAM 信頼ポリシー（`sub` 完全一致、`aud` = `sts.amazonaws.com`） |
| この Environment を使えるのは `main` のみ | GitHub Environment の deployment branch 制限 |
| そもそも main への push でしか起動しない | `deploy.yml` の `on` |

3 つが独立に効くため、いずれか 1 つの設定漏れでは配信に到達しない。

`sub` を `repo:sudabon/grocery_manager:*` のようにワイルドカードで緩めることはしない。PR ブランチのワークフローからロールを引ける状態になり、信頼範囲がリポジトリへの push 権限と同じ広さになる。

### D4: GitHub 側の設定は Terraform の管理外に置く

Environment そのもの・上記 4 変数・deployment branch 制限は、GitHub の設定画面（または `gh` CLI）で行い、`infra/` には含めない。

Terraform の `integrations/github` provider を入れれば IaC 化はできるが、provider の認証に GitHub の PAT が要る。その PAT は失効管理の必要な長期認証情報であり、長期アクセスキーを減らすという本 change の動機と正面から衝突する。**AWS 側（プロバイダ・ロール・ポリシー）は全て Terraform で書き、GitHub 側だけを手順として切り出す**、という線を引く。切り出した手順は `README.md` に、設定すべき値と `terraform output` のどれを写すかまで含めて記す。

### D5: OIDC プロバイダとロールは `infra/github_oidc.tf` に置く

```
aws_iam_openid_connect_provider.github
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # thumbprint_list は指定しない
```

AWS は GitHub を含む既知の IdP について自前の信頼済みルート CA で検証するため、`thumbprint_list` は不要（AWS provider の当該リソースでも optional）。指定すると GitHub 側の証明書更新のたびに追随が必要になるうえ、一度設定してから削除しても IAM は元の値を使い続けるため、**最初から指定しない**。

OIDC プロバイダはアカウント内でグローバルに一意なので、既存があれば新規作成せず `terraform import` する。`aws iam list-open-id-connect-providers` を apply 前に確認する。他プロジェクトが GitHub OIDC を使い始めた時点で、プロバイダだけを共有 state（`~/workspace/sudabon/terraform`）へ切り出す。

### D6: ロールの権限は `deploy.sh` が実際に呼ぶ API に限る

`deploy.sh` が使う AWS API から逆算する。

| スクリプト中の呼び出し | 必要なアクション | リソース |
|----------------------|----------------|---------|
| `aws s3api list-objects-v2` / `aws s3 sync --delete` の一覧 | `s3:ListBucket` | バケット ARN |
| `aws s3 sync` / `aws s3 cp` | `s3:PutObject` | `<バケット ARN>/*` |
| `aws s3 sync` の差分比較 | `s3:GetObject` | `<バケット ARN>/*` |
| `aws s3 sync --delete` / `aws s3 rm` | `s3:DeleteObject` | `<バケット ARN>/*` |
| `aws cloudfront create-invalidation` | `cloudfront:CreateInvalidation` | ディストリビューション ARN |
| `aws cloudfront wait invalidation-completed` | `cloudfront:GetInvalidation` | ディストリビューション ARN |

ARN は `aws_s3_bucket.app.arn` と `aws_cloudfront_distribution.app.arn` を式で直接参照する。文字列のコピーを作らないため、バケット名や ID が変わってもポリシーが追随する。`s3:*` や `cloudfront:*` は使わない。`max_session_duration` は既定の 1 時間のままとする（配信 1 回は無効化の待ちを含めても数分で終わる）。

### D7: 同時実行は打ち切らずに直列化する

```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

`cancel-in-progress: true` は、`aws s3 sync` の途中でジョブを殺し、一部のファイルだけが入れ替わった状態を配信に残しうる。連続してマージされた場合は待たせる。後続の実行は最新の main をビルドするため、待った結果として古い内容が配信されることはない。

### D8: デプロイ失敗時の扱い

- **verify が失敗** → `needs` により deploy は起動しない。配信は一切変わらない
- **ビルドが失敗 / `dist/index.html` が空** → `deploy.sh` が S3 へ触れる前に中止する（既存のガード）。配信は変わらない
- **同期の途中で失敗** → S3 に一括更新の原子性は無く、一部が入れ替わった状態が残る。これは手元実行でも同じ性質で、CD で新たに悪化しない

ロールバックは「戻したい状態のコミットへ `git revert` して main へ push」で行う。CD がそのまま再デプロイの経路になるため、別途ロールバック用の仕組みは持たない。

### D9: ビルド成果物はジョブ間で受け渡さない

deploy ジョブは自分で `npm ci` してから `deploy.sh` を実行し、`deploy.sh` の中で `npm run build` が走る。verify ジョブの `dist/` を artifact で渡す案は、アップロード・ダウンロードの時間が再ビルドと大差なく、「配信したものは配信直前にビルドしたもの」という単純さを崩す。

## Risks / Trade-offs

- **Environment 変数と実際の配信先がずれる**（`terraform apply` で作り直した場合） → `deploy.sh` の形式チェックは通ってしまう（形は正しいが別のバケット）。ただし権限は IAM ロールで元のバケットに限定されているため、ずれた場合は `AccessDenied` で失敗し、誤ったバケットへ配信されることはない。`README.md` に「配信先を作り直したら Environment 変数も更新する」を明記する
- **GitHub Environment の設定が Terraform 管理外** → 設定の再現性が README の手順に依存する。deployment branch 制限を入れ忘れると、別ブランチのワークフローから production Environment を使える状態になる。ただし `deploy.yml` の `on` が main への push だけなので、その 1 点だけでは配信に到達しない（D3 の三重化）
- **OIDC プロバイダの重複作成** → 既存がある状態で apply すると `EntityAlreadyExists` で失敗する。apply 前に `aws iam list-open-id-connect-providers` で確認し、あれば import する手順をタスクに含める
- **`deploy.sh` の分岐が増える** → 解決経路が 2 つになるが、形式チェックと以降の処理は完全に共通。`tests/scripts/deploy.test.mjs` は既に `terraform` / `aws` / `npm` をスタブする仕組みを持っているため、両経路を単体で固定できる
- **再利用可能ワークフロー化による PR の見え方の変化** → PR のチェック名が `verify / scripts` のような入れ子の表記になる。必須チェックをブランチ保護に設定している場合は名前の更新が要る
- **短期資格情報への移行中に長期キーが残る** → 本 change は CD 経路を OIDC にするだけで、手元の認証情報には触れない。ルートアクセスキーの廃止は Identity Center 移行側の作業として残る

## Migration Plan

1. Terraform を先に適用してロールを作る（この時点では誰も引き受けない）
2. `terraform output` の値で GitHub Environment と変数を設定する
3. `deploy.sh` の変更を入れ、**手元で** `QUADMEMO_APP_BUCKET` / `QUADMEMO_DISTRIBUTION_ID` を与えた実行が従来と同じ結果になることを確認する
4. ワークフローを追加して main へマージし、初回の CD 実行を観測する
5. 配信内容が main と一致することを E2E で確認する（test-plan.md）

ロールバックは、`deploy.yml` の削除と `verify.yml` の `on` を戻すことで CD 前の状態に戻せる。AWS 側のロールは残しても害がない（引き受ける主体が無くなるだけ）。

## Open Questions

- Environment 名を `production` とするか別名にするか。IAM 信頼ポリシーの `sub` に現れるため、変更する場合は Terraform と GitHub の両方を揃える必要がある。既定は `production` とし、実装時に確定する
