## Why

配信は現在、手元から `scripts/deploy.sh` を実行する手動操作でしか行えない。実行には AWS の長期認証情報（2026-09-19 時点ではルートユーザーのアクセスキー）と、`terraform -chdir=infra output` を引けるローカルの Terraform state アクセスが要る。結果として「main にマージされた状態」と「配信されている状態」が一致する保証がなく、デプロイのたびに手元の認証情報が使われる。

main へマージされた時点で配信まで自動で進めば、マージ＝リリースという単純な規約が成立し、配信に使う認証情報も GitHub Actions の OIDC による短期クレデンシャルに置き換えられる。長期アクセスキーを配信のために保持し続ける理由が一つ減るため、進行中の IAM Identity Center 移行とも方向が一致する。

## What Changes

- **GitHub OIDC プロバイダとデプロイ用 IAM ロールを `infra/` の Terraform に追加する**。ロールは `sudabon/grocery_manager` からの OIDC トークンのみを信頼し、権限は配信用 S3 バケットへの読み書き・削除と、対象ディストリビューションの無効化作成／参照に限定する
- **CD ワークフロー `.github/workflows/deploy.yml` を追加する**。`main` への push を契機に、既存の verify 相当の検証が通ってからビルド → S3 同期 → CloudFront 無効化を実行する。承認ゲートは設けない
- **配信先の指定を GitHub Environment の変数から受け取れるようにする**。`scripts/deploy.sh` は現在バケット名とディストリビューション ID を `terraform output` のみから得ているため、環境変数で与えられた場合はそれを使うよう変更する。これにより CD ジョブへ tfstate の読み取り権限を与えずに済む
- **配信先の値の検証は、出所によらず常に行う**。現在 `deploy.sh` が持つ形式チェック（バケット名 `^[a-z][a-z0-9-]{0,39}-app-[0-9]{12}$`、ディストリビューション ID `^[A-Z0-9]+$`）を、外部指定の値に対しても適用する
- 手元からの `bash scripts/deploy.sh` 実行は従来どおり動く（環境変数が無ければ `terraform output` にフォールバックする）。**破壊的変更ではない**

## Capabilities

### New Capabilities

- `continuous-deployment`: 既定ブランチへの統合を契機に、検証・ビルド・配信・キャッシュ無効化を自動で実行する仕組み。デプロイの契機、失敗時に配信を変更しないこと、長期認証情報を用いないこと、同時実行時の順序を規定する

### Modified Capabilities

- `static-hosting`: 「デプロイによる更新反映」に、配信先（オリジンバケット・ディストリビューション）を構成の出力値以外から受け取れること、および受け取った値が想定の形式でなければデプロイを中止することを追加する

## Impact

- `infra/github_oidc.tf`（新規）: `aws_iam_openid_connect_provider`、`aws_iam_role`、最小権限のインラインポリシー。バケット ARN とディストリビューション ARN は既存リソースを直接参照する
- `infra/outputs.tf`: デプロイ用ロールの ARN を出力に追加（GitHub Environment へ登録する値の出所にする）
- `.github/workflows/deploy.yml`（新規）: `permissions: id-token: write` / `contents: read`、`concurrency` で main のデプロイを直列化
- `.github/workflows/verify.yml`: main への push での重複実行の扱いを整理する（CD 側で検証を回すため）
- `scripts/deploy.sh`: バケット名・ディストリビューション ID の取得を「環境変数優先、無ければ `terraform output`」に変更。形式チェックは共通のまま
- `tests/scripts/`: `deploy.sh` の配信先解決と形式チェックのテストを追加
- `.env.example` / `README.md`: 配信先を環境変数で与える運用と、GitHub Environment に登録する変数を追記
- AWS: OIDC プロバイダはアカウント単位でグローバルに一意。個人アカウントに既存の GitHub OIDC プロバイダがある場合は新規作成せず取り込む必要がある

## 記録した前提

- **配信先の値は GitHub Environment の変数として持ち、CD から tfstate は読まない**。`terraform init -backend-config` して `output` を引く案は値の二重管理が起きない利点があるが、CD ロールに tfstate バケットの読み取り権限が必要になり、state には配信以外のリソース情報も含まれるため採らない。代償として、`terraform apply` で配信先が作り直された場合は Environment 変数の更新が必要になる
- **承認ゲートは設けない**。運用者が 1 人で、PR マージ自体が確認の場になっているため。Environment は変数のスコープとして使い、required reviewer は設定しない
- **OIDC プロバイダとロールは `infra/` に置く**。バケット ARN・ディストリビューション ARN を式で直接参照でき、最小権限ポリシーが値のコピーなしに書けるため。共有 state（`~/workspace/sudabon/terraform`）へ置く案は、ARN のまたぎ参照と作業の 2 リポジトリ分割を招くため採らない。他プロジェクトが GitHub OIDC を使い始めた時点でプロバイダのみ切り出す
- **信頼ポリシーの `sub` は Environment 名で絞る**。ジョブが `environment:` を宣言すると OIDC トークンの `sub` は `repo:sudabon/grocery_manager:environment:<name>` になり、ブランチ名は `sub` に現れない。main 以外からのデプロイは、IAM 側ではなく GitHub Environment の deployment branch 制限で防ぐ。この分担は design で明示する
- **`terraform apply` は CD の対象外**。今回自動化するのはビルドと配信のみで、インフラ変更は引き続き手元から適用する
