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
    error_message = "domain_name は英小文字の配信用サブドメイン（例: quadmemo.example.com）を指定してください。"
  }
}
