resource "aws_acm_certificate" "app" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# 検証レコードは外部レジストラへ手動登録する運用のため、validation_record_fqdns は
# 指定せず証明書のステータスをポーリングするだけにする（Terraform が検証レコードを
# 管理する場合に指定する引数）。登録漏れ・打ち間違いで既定 75 分ハングするため、
# AWS が案内する検証所要時間（最大 30 分）に合わせて 30 分で打ち切る。
resource "aws_acm_certificate_validation" "app" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.app.arn

  timeouts {
    create = "30m"
  }
}
