terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # bucket は環境固有（S3 の名前空間はグローバルに一意）のため、リポジトリには置かず
  # 初回 init で渡す部分設定にする:
  #   terraform -chdir=infra init -backend-config="bucket=$QUADMEMO_TFSTATE_BUCKET"
  # 値は .env（git 管理外、雛形は .env.example）で管理する。
  backend "s3" {
    key          = "quadmemo/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
