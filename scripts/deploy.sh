#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export AWS_PAGER=""
bucket="$(terraform -chdir=infra output -raw app_bucket)"
distribution_id="$(terraform -chdir=infra output -raw cloudfront_distribution_id)"

# --delete の対象は Terraform が出力した配信用バケットのみに限定する。
if [[ ! "$bucket" =~ ^[a-z][a-z0-9-]{0,39}-app-[0-9]{12}$ ]] ||
   [[ ! "$distribution_id" =~ ^[A-Z0-9]+$ ]]; then
  echo "Terraform の配信先出力が不正です。初回構築を確認してください。" >&2
  exit 1
fi

npm run build
if [[ ! -s dist/index.html ]]; then
  echo "dist/index.html が存在しないか空のため、デプロイを中止しました。" >&2
  exit 1
fi

has_removed_assets="$(aws s3api list-objects-v2 --bucket "$bucket" \
  --query 'Contents[].Key' --output json | node scripts/has-removed-assets.mjs)"

# ハッシュ付きアセットを長期キャッシュする。エントリポイントは別途アップロードする。
aws s3 sync dist/ "s3://${bucket}/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "sw.js" \
  --exclude "registerSW.js" \
  --exclude "manifest.webmanifest"

for file in index.html sw.js registerSW.js manifest.webmanifest; do
  if [ -f "dist/$file" ]; then
    aws s3 cp "dist/$file" "s3://${bucket}/${file}" --cache-control "no-cache"
  else
    # sync の除外対象は --delete でも消えないため、存在しないものを明示的に削除する。
    aws s3 rm "s3://${bucket}/${file}"
  fi
done

paths=("/index.html" "/sw.js" "/registerSW.js" "/manifest.webmanifest")
if [[ "$has_removed_assets" == yes ]]; then
  # 削除したハッシュ付きファイルもエッジに残さない。通常は上記 4 パスのみ。
  paths+=("/*")
fi
invalidation_id="$(aws cloudfront create-invalidation \
  --distribution-id "$distribution_id" --paths "${paths[@]}" \
  --query 'Invalidation.Id' --output text)"

aws cloudfront wait invalidation-completed \
  --distribution-id "$distribution_id" --id "$invalidation_id"

echo "Deployed to s3://${bucket} (distribution: ${distribution_id})"
