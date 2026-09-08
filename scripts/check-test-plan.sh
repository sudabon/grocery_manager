#!/usr/bin/env bash
set -euo pipefail
# PR の差分、または --change で明示した未コミットの change を検証する。
cd "$(dirname "$0")/.."
if [[ "${1:-}" == --change ]]; then
  if [[ $# -ne 2 || ! "$2" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "Usage: $0 [base-ref | --change change-id]" >&2
    exit 2
  fi
  ids="$2"
else
  base="${1:-origin/main}"
  ids=$(git diff --name-only "$base"...HEAD -- 'openspec/changes/**' \
    | awk -F/ '$3 != "archive" && NF >= 4 { print $3 }' | sort -u)
fi
[ -z "$ids" ] && { echo "openspec change の差分なし。skip"; exit 0; }

fail=0
for id in $ids; do
  plan="openspec/changes/$id/test-plan.md"
  if [ ! -f "$plan" ]; then
    echo "::error::$id に test-plan.md がありません"; fail=1; continue
  fi
  if ! rg -q -F --glob '*.spec.ts' --glob '*.test.ts' -- "@$id" tests/e2e/; then
    echo "::error::@$id タグ付きの E2E テストが tests/e2e/ にありません"; fail=1
  fi
  echo "Checked: $id"
done
exit $fail
