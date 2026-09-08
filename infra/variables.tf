variable "app_name" {
  type        = string
  default     = "quadmemo"
  description = "S3 バケット名と CloudFront リソース名の接頭辞"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,39}$", var.app_name))
    error_message = "app_name は英小文字で始まる、40 文字以内の英小文字・数字・ハイフンにしてください。"
  }
}

variable "domain_name" {
  type        = string
  description = "配信用サブドメインの FQDN（例: quadmemo.example.com）。スキーム・パス・末尾のドットは含めない。"

  validation {
    condition     = length(var.domain_name) <= 253 && can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.){2,}[a-z]{2,63}$", var.domain_name))
    error_message = "domain_name は 253 文字以内で、ラベルを 3 つ以上含むサブドメイン（例: quadmemo.example.com）を指定してください。使えるのは英小文字・数字・ハイフンです。配信先を外部レジストラの CNAME で CloudFront へ向ける運用のため、ラベル 2 つのドメイン（例: example.com）は指定できません。"
  }
}
