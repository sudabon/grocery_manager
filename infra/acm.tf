resource "aws_acm_certificate" "app" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# 外部レジストラへの手動 CNAME 登録後、ISSUED になるまで待つ。
resource "aws_acm_certificate_validation" "app" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.app.arn
}
