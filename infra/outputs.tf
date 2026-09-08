output "acm_validation_records" {
  description = "レジストラに登録する検証用 CNAME（名前・種別・値）。証明書の自動更新にも必要なため発行後も削除しない。"
  value = {
    for option in aws_acm_certificate.app.domain_validation_options :
    option.domain_name => {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  }
}

output "cloudfront_domain_name" {
  description = "レジストラで配信用サブドメインの CNAME の向き先に設定するドメイン名"
  value       = aws_cloudfront_distribution.app.domain_name
}

output "cloudfront_distribution_id" {
  description = "デプロイ時のキャッシュ無効化に使う CloudFront ディストリビューション ID"
  value       = aws_cloudfront_distribution.app.id
}

output "app_bucket" {
  description = "ビルド成果物を配置する非公開 S3 バケット名"
  value       = aws_s3_bucket.app.id
}
