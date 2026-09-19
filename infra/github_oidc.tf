# GitHub Actions からの OIDC 認証でデプロイ用ロールを引き受けるための構成。
# 長期アクセスキーを GitHub に保管せず、実行ごとに発行される短期資格情報で配信する。

# OIDC プロバイダはアカウント内でグローバルに一意。既存があれば新規作成せず
# terraform import で取り込む（apply 前に aws iam list-open-id-connect-providers で確認）。
# thumbprint_list は指定しない。AWS は GitHub を含む既知の IdP を自前の信頼済み
# ルート CA で検証するため不要で、一度設定すると削除しても IAM が元の値を使い続ける。
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# 信頼範囲は sub の完全一致で「このリポジトリの、この Environment」に限定する。
# environment: を宣言したジョブの sub にブランチ名は現れないため、「main からのみ」は
# GitHub Environment の deployment branch 制限で担保する（README「継続的デプロイ」）。
# ワイルドカードは使わない。PR ブランチのワークフローからもロールを引ける状態になる。
data "aws_iam_policy_document" "github_actions_deploy_trust" {
  statement {
    sid     = "AllowGitHubActionsProductionEnvironment"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:sudabon/grocery_manager:environment:production"]
    }
  }
}

# description は IAM の制約で ASCII / Latin-1 しか受け付けない（日本語は ValidationError）。
resource "aws_iam_role" "github_actions_deploy" {
  name               = "${var.app_name}-github-actions-deploy"
  description        = "Assumed by GitHub Actions (sudabon/grocery_manager, environment: production) to run scripts/deploy.sh"
  assume_role_policy = data.aws_iam_policy_document.github_actions_deploy_trust.json
}

# 権限は scripts/deploy.sh が実際に呼ぶ API に限る。
#   s3api list-objects-v2 / s3 sync --delete の一覧  → s3:ListBucket（バケット）
#   s3 sync / s3 cp                                   → s3:PutObject（オブジェクト）
#   s3 sync の差分比較                                → s3:GetObject（オブジェクト）
#   s3 sync --delete / s3 rm                          → s3:DeleteObject（オブジェクト）
#   cloudfront create-invalidation                    → cloudfront:CreateInvalidation
#   cloudfront wait invalidation-completed            → cloudfront:GetInvalidation
# ARN は既存リソースを式で参照し、バケット名や ID を文字列で書かない。
data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid       = "ListAppBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.app.arn]
  }

  statement {
    sid       = "ReadWriteDeleteAppObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.app.arn}/*"]
  }

  statement {
    sid       = "InvalidateAppDistribution"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.app.arn]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "deploy"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}
