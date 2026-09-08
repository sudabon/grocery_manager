#!/usr/bin/env bash
set -euo pipefail
# PR の差分、または --change で明示した未コミットの change を検証する。
cd "$(dirname "$0")/.."

# grep のマッチなし(1)と実行エラー(2 以上)を区別する。GNU grep は 2、BSD grep は 1 を
# 返すなど実装差があるため、対象ディレクトリの存在は先に別途確認する。
has_tag() {
  local id="$1" status=0
  grep -rqlF --include='*.spec.ts' --include='*.test.ts' -- "@$id" tests/e2e/ || status=$?
  if [ "$status" -gt 1 ]; then
    echo "::error::tests/e2e/ の検索に失敗しました（grep が exit ${status}）。@$id の有無は判定できません" >&2
    exit 2
  fi
  return "$status"
}

# 差分モード用。作業ツリーではなく HEAD のコミット済みツリーを検索する。
# git pathspec の '*' は '/' を跨ぐため、has_tag の --include と対象が一致する。
has_tag_in_head() {
  local id="$1" status=0
  git grep -qF -- "@$id" HEAD -- 'tests/e2e/*.spec.ts' 'tests/e2e/*.test.ts' || status=$?
  if [ "$status" -gt 1 ]; then
    echo "::error::HEAD の tests/e2e/ の検索に失敗しました（git grep が exit ${status}）。@$id の有無は判定できません" >&2
    exit 2
  fi
  return "$status"
}

if [[ "${1:-}" == --change ]]; then
  if [[ $# -ne 2 || ! "$2" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "Usage: $0 [base-ref | --change change-id]" >&2
    exit 2
  fi
  if [ ! -d "openspec/changes/$2" ]; then
    echo "::error::openspec/changes/$2 がありません。change ID を確認してください" >&2
    exit 2
  fi
  mode=change
  ids="$2"
else
  mode=diff
  base="${1:-origin/main}"
  # 差分ベースの検証は git の情報に依存する。成立しない条件は「対象なし」と
  # 混ぜず、それぞれ別のメッセージで exit 2 にする。
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "::error::git リポジトリの外で実行されています。差分ベースの検証はできません（--change を使ってください）" >&2
    exit 2
  fi
  # archive/ だけが追跡されていても差分は永久に空になるため、archive を除いて数える。
  if [ -z "$(git ls-files openspec/changes | grep -v '/archive/' | head -1)" ]; then
    echo "::error::openspec/changes/ の change が git 管理下にありません。差分ベースの検証は成立しません（openspec/ をコミットするか --change を使ってください）" >&2
    exit 2
  fi
  if ! git rev-parse --verify --quiet "$base" >/dev/null; then
    echo "::error::ベース ref '$base' が見つかりません。fetch していないか、名前を確認してください" >&2
    exit 2
  fi
  files=$(git diff --name-only "$base"...HEAD -- 'openspec/changes/**')
  file_count=$(printf '%s\n' "$files" | awk 'NF { count++ } END { print count+0 }')
  ids=$(printf '%s\n' "$files" \
    | awk -F/ '$3 != "archive" && NF >= 4 { print $3 }' | sort -u)
  [ -z "$ids" ] && { echo "openspec/changes/** の差分 $file_count ファイル、change ID 0 件。skip"; exit 0; }
fi

if [ ! -d tests/e2e ]; then
  echo "::error::tests/e2e/ が存在しません。E2E タグの検証ができません" >&2
  exit 2
fi

# 差分モードは CI（新規チェックアウト）と同じ「コミット済みツリー」を見る。作業ツリーを
# 見ると、未追跡のまま残ったファイルを存在扱いして手元では通り CI だけが落ちる。
# --change は未コミットの change を手元で検証する用途なので作業ツリーを見る。
fail=0
for id in $ids; do
  plan="openspec/changes/$id/test-plan.md"
  if [ "$mode" = diff ]; then
    if ! git cat-file -e "HEAD:$plan" 2>/dev/null; then
      if [ -f "$plan" ]; then
        echo "::error::$id の test-plan.md がコミットされていません（ローカルには存在します）"
      else
        echo "::error::$id に test-plan.md がありません"
      fi
      fail=1; continue
    fi
    if ! has_tag_in_head "$id"; then
      if has_tag "$id"; then
        echo "::error::@$id タグ付きの E2E テストがコミットされていません（ローカルには存在します）"
      else
        echo "::error::@$id タグ付きの E2E テストが tests/e2e/ にありません"
      fi
      fail=1
    fi
  else
    if [ ! -f "$plan" ]; then
      echo "::error::$id に test-plan.md がありません"; fail=1; continue
    fi
    if ! has_tag "$id"; then
      echo "::error::@$id タグ付きの E2E テストが tests/e2e/ にありません"; fail=1
    fi
  fi
  echo "Checked: $id"
done
exit $fail
