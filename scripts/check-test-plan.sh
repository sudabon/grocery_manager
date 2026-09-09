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

# 通常の --list はタグを表示しないため、JSON の実行時 tags を照合する。
check_tp_ids() {
  local id="$1" report
  if ! report=$(npx playwright test --list --grep "@$id" --reporter=json); then
    echo "::error::$id の Playwright テスト一覧を取得できません" >&2
    return 2
  fi
  node -e '
    const fs = require("node:fs");
    const id = process.argv[1];
    try {
      const report = JSON.parse(fs.readFileSync(0, "utf8"));
      if (!Array.isArray(report.suites) || report.errors?.length) {
        throw new Error("Playwright テスト一覧が不正、または収集エラーがあります");
      }
      const plan = fs.readFileSync(`openspec/changes/${id}/test-plan.md`, "utf8");
      const planned = [...new Set(plan.match(/\bTP-\d+\b/g) ?? [])].sort();
      if (!planned.length) throw new Error("test-plan.md に TP-ID がありません");
      const found = new Set();
      function walk(suite) {
        for (const spec of suite.specs ?? []) {
          const tags = (spec.tags ?? []).map(tag => tag.replace(/^@/, ""));
          // --grep は部分一致なので、似た change ID のテストで欠落を埋めない。
          if (!tags.includes(id)) continue;
          for (const tag of tags) if (/^TP-\d+$/.test(tag)) found.add(tag);
        }
        for (const child of suite.suites ?? []) walk(child);
      }
      for (const suite of report.suites) walk(suite);
      const missing = planned.filter(tp => !found.has(tp));
      if (missing.length) {
        console.error(`::error::${id} のテストに未実装の TP-ID: ${missing.join(", ")}`);
        process.exit(1);
      }
      console.log(`TP-ID: ${id} ${planned.length}/${planned.length}`);
    } catch (error) {
      console.error(`::error::${id} の TP-ID 検証に失敗しました: ${error.message}`);
      process.exit(2);
    }
  ' "$id" <<< "$report"
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

# 差分モードは HEAD、--change は作業ツリーを参照する。この 2 つが唯一の分岐点。
has_plan() {
  local plan="openspec/changes/$1/test-plan.md"
  if [ "$mode" = diff ]; then
    git cat-file -e "HEAD:$plan" 2>/dev/null
  else
    [ -f "$plan" ]
  fi
}

tag_found() {
  if [ "$mode" = diff ]; then has_tag_in_head "$1"; else has_tag "$1"; fi
}

# 未着手（tasks.md に未チェックのタスクがあり、チェック済みが 1 つも無い）change は
# 実装が存在しないため @<change-id> の E2E テストを要求しない。tasks.md が無い、または
# チェックボックスを持たない change は判定できないので、従来どおり両方を要求する。
is_unapplied() {
  local id="$1" tasks content
  tasks="openspec/changes/$id/tasks.md"
  if [ "$mode" = diff ]; then
    content=$(git cat-file -p "HEAD:$tasks" 2>/dev/null) || return 1
  else
    [ -f "$tasks" ] || return 1
    content=$(cat "$tasks") || return 1
  fi
  if ! printf '%s\n' "$content" | grep -qE '^[[:space:]]*- \[ \]'; then
    return 1
  fi
  if printf '%s\n' "$content" | grep -qE '^[[:space:]]*- \[[xX]\]'; then
    return 1
  fi
  return 0
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

  if ! has_plan "$id"; then
    if [ "$mode" = diff ] && [ -f "$plan" ]; then
      echo "::error::$id の test-plan.md がコミットされていません（ローカルには存在します）"
    else
      echo "::error::$id に test-plan.md がありません"
    fi
    fail=1; continue
  fi

  if is_unapplied "$id"; then
    echo "Pending: ${id}（tasks.md が未着手のため @$id の E2E テストは要求しません）"
    continue
  fi

  if ! tag_found "$id"; then
    if [ "$mode" = diff ] && has_tag "$id"; then
      echo "::error::@$id タグ付きの E2E テストがコミットされていません（ローカルには存在します）"
    else
      echo "::error::@$id タグ付きの E2E テストが tests/e2e/ にありません"
    fi
    fail=1
  elif [ "$mode" = change ]; then
    status=0
    check_tp_ids "$id" || status=$?
    if [ "$status" -gt 1 ]; then exit "$status"; fi
    if [ "$status" -eq 1 ]; then fail=1; fi
  fi
  echo "Checked: $id"
done
exit $fail
