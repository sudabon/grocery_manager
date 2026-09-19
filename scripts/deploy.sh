#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export AWS_PAGER=""
# 配信先は環境変数（CD では GitHub Environment の variable）を優先し、両方とも与えられて
# いれば terraform を呼ばない。CD ジョブへ tfstate の読み取り権限を与えずに済ませるため。
# 片方でも欠けていれば、欠けている側だけを従来どおり terraform output で補う。
bucket="${QUADMEMO_APP_BUCKET:-}"
distribution_id="${QUADMEMO_DISTRIBUTION_ID:-}"
if [[ -z "$bucket" || -z "$distribution_id" ]]; then
  bucket="${bucket:-$(terraform -chdir=infra output -raw app_bucket)}"
  distribution_id="${distribution_id:-$(terraform -chdir=infra output -raw cloudfront_distribution_id)}"
fi

# --delete の対象を配信用バケットのみに限定する。解決経路（環境変数 / terraform output）に
# よらず検証し、別環境の値や打ち間違いを S3 へ触る前に止める。
if [[ ! "$bucket" =~ ^[a-z][a-z0-9-]{0,39}-app-[0-9]{12}$ ]] ||
   [[ ! "$distribution_id" =~ ^[A-Z0-9]+$ ]]; then
  echo "配信先（バケット名: '${bucket}' / ディストリビューション ID: '${distribution_id}'）が不正です。QUADMEMO_APP_BUCKET / QUADMEMO_DISTRIBUTION_ID か Terraform の出力を確認してください。" >&2
  exit 1
fi

# 再検証が必要な（no-cache で配信する）エントリポイント。この配列が唯一の出所で、
# 空チェック・sync の --exclude・個別アップロードと削除・無効化パスのすべてに使う。
# sync 側は除外分以外を 1 年 immutable で配信するため、ハッシュ名でないファイル
# (favicon.ico, robots.txt など)を更新できる状態に保つにはこの配列へ追加する。
# 配列に足せば --exclude と個別アップロードの両方に反映される。
ENTRYPOINTS=(index.html sw.js manifest.webmanifest
  icons/icon-192.png icons/icon-512.png icons/apple-touch-icon-180.png)

npm run build

if [[ ! -s dist/index.html ]]; then
  echo "dist/index.html が存在しないか空のため、デプロイを中止しました。" >&2
  exit 1
fi

# 空・非通常ファイルのエントリポイントは削除ではなく中止で扱う（同期前に検出して
# 中途半端な配信を避ける）。ディレクトリは -s が真になるため -f も併せて確認する。
# index.html もこのループの対象に含める（上のガードは -s だけで通常ファイルを見ない）。
for file in "${ENTRYPOINTS[@]}"; do
  if [ -e "dist/$file" ] && { [ ! -f "dist/$file" ] || [ ! -s "dist/$file" ]; }; then
    echo "dist/$file が空、または通常ファイルではありません。ビルド出力を確認してください。デプロイを中止しました。" >&2
    exit 1
  fi
done

# sync --delete より前の一覧が必要。--query を通さないのは、Contents キーの有無で
# 「オブジェクト 0 件」と「取得できていない」を区別できるようにするため。
remote_objects="$(aws s3api list-objects-v2 --bucket "$bucket" --output json)"
removal_report="$(printf '%s' "$remote_objects" \
  | node scripts/has-removed-assets.mjs "${ENTRYPOINTS[@]}")"
has_removed_assets="$(printf '%s\n' "$removal_report" | sed -n '1p')"
removed_entrypoints="$(printf '%s\n' "$removal_report" | sed -n '2p')"
case "$has_removed_assets" in
  yes | no) ;;
  *)
    echo "has-removed-assets.mjs の出力が想定外です: ${has_removed_assets}" >&2
    exit 1
    ;;
esac

exclude_args=()
for file in "${ENTRYPOINTS[@]}"; do
  exclude_args+=(--exclude "$file")
done
aws s3 sync dist/ "s3://${bucket}/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  "${exclude_args[@]}"

for file in "${ENTRYPOINTS[@]}"; do
  if [ -f "dist/$file" ]; then
    # .webmanifest の Content-Type は AWS CLI 同梱 Python の mimetypes 依存
    # （3.8.4 以降は application/manifest+json を正しく推定する）。古い CLI でも
    # 確実に付くよう明示する。
    if [ "$file" = manifest.webmanifest ]; then
      aws s3 cp "dist/$file" "s3://${bucket}/${file}" --cache-control "no-cache" \
        --content-type application/manifest+json
    else
      aws s3 cp "dist/$file" "s3://${bucket}/${file}" --cache-control "no-cache"
    fi
  else
    # sync の除外対象は --delete でも消えないため、存在しないものを明示的に削除する。
    # S3 に実在するものを消すときだけ警告する（最初から無い場合は正常系なので黙る）。
    case " $removed_entrypoints " in
      *" $file "*)
        echo "dist/$file がビルド成果物に無く、S3 には存在します。ビルド出力を確認してください。" >&2
        ;;
    esac
    aws s3 rm "s3://${bucket}/${file}"
  fi
done

paths=()
for file in "${ENTRYPOINTS[@]}"; do
  paths+=("/$file")
done
if [[ "$has_removed_assets" == yes ]]; then
  # 削除したハッシュ付きファイルもエッジに残さない。/* はエントリポイントを
  # すべて包含するので、パス数課金を増やさないよう置き換える。
  paths=("/*")
fi
invalidation_id="$(aws cloudfront create-invalidation \
  --distribution-id "$distribution_id" --paths "${paths[@]}" \
  --query 'Invalidation.Id' --output text)"

aws cloudfront wait invalidation-completed \
  --distribution-id "$distribution_id" --id "$invalidation_id"

echo "Deployed to s3://${bucket} (distribution: ${distribution_id})"
