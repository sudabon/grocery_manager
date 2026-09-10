## 1. リポジトリの初期化

- [x] 1.1 `package.json` を作成（`name: quadmemo`, `private: true`, `type: module`）し、`npm ls --depth=0` がエラーなく実行できることを確認
- [x] 1.2 `.gitignore` を追加（`node_modules/`, `dist/`, `test-results/`, `playwright-report/`, `.terraform/`, `*.tfvars`, `*.tfstate*`）し、`git status --porcelain` にこれらが出ないことを確認
- [x] 1.3 `@playwright/test` を devDependency として導入し、`npx playwright --version` が表示されることを確認
- [x] 1.4 `playwright.config.ts` に `projects` を追加（`chromium` = デスクトップ Chromium、`mobile-safari` = WebKit + iPhone デバイスプリセット）。既存の `retries: 1` / reporter は維持する。配信先の出所は `tests/e2e/fixtures/deployed-origin.ts` に統一し、`playwright.config.ts` の `baseURL` は持たない。`forbidOnly` は CI で有効にする。`npx playwright test --list` に両プロジェクトが表示されることを確認
- [x] 1.5 `npx playwright install chromium webkit` を実行し、両ブラウザバイナリが取得できることを確認

## 2. M0 の配信物（プレースホルダー）

- [x] 2.1 `public/placeholder/index.html` を作成（アプリ名と「準備中」の表示、`viewport` に `viewport-fit=cover` を含む最小 HTML）。ブラウザで直接開いて表示されることを確認
- [x] 2.2 `package.json` に `build` スクリプトを追加（`public/placeholder/` の内容を `dist/` へコピー）。`npm run build` 後に `dist/index.html` が存在することを確認
      ※ `add-quadmemo-quadrant-ui` で Vite ビルドへ差し替える前提（design.md - D6）

## 3. Terraform コードの作成

- [x] 3.1 `infra/versions.tf` を作成（`required_version >= 1.10`、AWS Provider `~> 6.0`、S3 バックエンド + `use_lockfile = true`）。バケット名は利用者から受け取った値を記入し、`terraform fmt -check` が通ることを確認
- [x] 3.2 `infra/providers.tf` を作成（`ap-northeast-1` の既定 provider、`us_east_1` エイリアス、`aws_caller_identity` データソース）
- [x] 3.3 `infra/variables.tf` を作成（`app_name` 既定 `quadmemo`、`domain_name`（説明付き・既定値なし））
- [x] 3.4 `infra/acm.tf` を作成（`aws_acm_certificate`（us-east-1・DNS 検証・`create_before_destroy`）と `aws_acm_certificate_validation`（`validation_record_fqdns` は指定しない））
- [x] 3.5 `infra/s3.tf` を作成（バケット、`public_access_block` 4 項目すべて true、OAC 用バケットポリシー（`AWS:SourceArn` 条件付き `s3:GetObject` のみ））
- [x] 3.6 `infra/cloudfront.tf` を作成（OAC、カスタムキャッシュポリシー（最低・既定 TTL 0 秒、最大 TTL 31536000 秒）、`Managed-SecurityHeadersPolicy`、`aliases = [var.domain_name]`、`PriceClass_200`、`viewer_protocol_policy = redirect-to-https`、TLS `TLSv1.2_2021`、403/404 → `/index.html` 200 の `custom_error_response`（`error_caching_min_ttl = 0`、S3 の最小 1 秒のみ許容））
- [x] 3.7 `infra/outputs.tf` を作成（`acm_validation_records`、`cloudfront_domain_name`、`cloudfront_distribution_id`、`app_bucket`）。検証用 CNAME は削除しない旨を description に明記
- [x] 3.8 `terraform -chdir=infra init -backend=false && terraform -chdir=infra validate` が通り、`terraform fmt -check -recursive infra` が差分ゼロであることを確認

## 4. 初回構築（利用者環境での適用）

- [x] 4.1 tfstate 用 S3 バケットを手動作成（バージョニング有効）し、`terraform -chdir=infra init` が成功することを確認
- [x] 4.2 `terraform.tfvars` に `domain_name` を記入（gitignore 対象）し、`terraform -chdir=infra plan` が実行できることを確認
- [x] 4.3 `terraform -chdir=infra apply -target=aws_acm_certificate.app` で証明書のみ先行作成し、`terraform -chdir=infra output acm_validation_records` で検証レコードが取得できることを確認
- [x] 4.4 検証用 CNAME をレジストラの DNS に登録し、`dig <検証レコード名> CNAME` で伝播を確認
- [x] 4.5 `terraform -chdir=infra apply` を実行し、証明書が ISSUED になりディストリビューションまで作成されることを確認
- [x] 4.6 `terraform -chdir=infra output cloudfront_domain_name` の値を配信サブドメインの CNAME としてレジストラに登録し、`dig <配信サブドメイン> CNAME` で伝播を確認
- [x] 4.7 `terraform -chdir=infra plan` を再実行し、`No changes.` であることを確認（spec: 再適用で差分が出ない）

## 5. デプロイ経路

- [x] 5.1 `scripts/deploy.sh` を作成（`set -euo pipefail`、`terraform output` からバケット名とディストリビューション ID を取得、`npm run build`、ハッシュ付きアセットを `public, max-age=31536000, immutable` で `--delete` 付き同期、エントリポイント 4 種を `no-cache` で個別 `cp`（`[ -f ]` ガード付き・不在時は削除）、エントリポイント 4 パスの無効化（削除がある場合は `/*` を追加）と完了待ち）。`bash -n scripts/deploy.sh` と `shellcheck`（導入済みの場合）が通ることを確認
- [x] 5.2 `chmod +x scripts/deploy.sh` を実行し、`./scripts/deploy.sh` でプレースホルダーが配信されることを確認
- [x] 5.3 `curl -sI https://<配信サブドメイン>/` で 200・`cache-control: no-cache`・セキュリティヘッダーが返ることを確認
- [x] 5.4 `curl -sI http://<オリジンバケットの直 URL>/index.html` が 403 であることを確認（spec: オリジンへの直接アクセスが拒否される）
- [x] 5.5 プレースホルダーの文言を 1 行変更して `./scripts/deploy.sh` を再実行し、ブラウザのリロードで変更が反映されることを確認（spec: デプロイ後にリロードで新バージョンが反映される）

## 6. ドキュメント

- [x] 6.1 `README.md` に「配信構成」「初回構築手順（2 段階適用・DNS 手動登録）」「デプロイ手順」「`-target` は初回限定」を追記し、手順どおりに読み進められることをレビューで確認
- [x] 6.2 `README.md` に E2E の実行方法（`E2E_BASE_URL` に配信サブドメインを渡す・プロジェクト指定）を追記

## E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う（locator は getByRole/getByLabel/getByText 優先、`page.locator()`・XPath 禁止、`waitForTimeout` 禁止）。

- [x] E1 `tests/e2e/fixtures/deployed-origin.ts` を追加し、`env:deployed-origin` fixture を実装（`E2E_BASE_URL` が `https://` で始まらない場合、およびパス・クエリ・ハッシュを含む場合は `test.skip` する）。`tests/e2e/fixtures/README.md` の表に `env:deployed-origin` / 作られる状態 / 使用 TP-ID / 方式（fixture 直接方式）を登録し、表と実装が一致していることを確認
- [x] E2 `tests/e2e/pages/AppShellPage.ts` に Page Object を追加（ルートおよび任意パスへの遷移、アプリシェル表示の判定を getByRole ベースで提供）
- [x] E3 TP-001: 配信ドメインのルートで 200・アプリシェルが表示されるテストを実装（tag: `@setup-quadmemo-hosting`, `@TP-001`）
- [x] E4 TP-002: HTTP アクセスが HTTPS へリダイレクトされ 200 になるテストを実装（tag: `@setup-quadmemo-hosting`, `@TP-002`）
- [x] E5 TP-003: アプリ内ルートへの直リンクで 200・アプリシェルが返り、`Cache-Control` に `no-cache` が含まれるテストを実装（tag: `@setup-quadmemo-hosting`, `@TP-003`）
- [x] E6 TP-004: アプリ内ルートでリロードしても 200・アプリシェルが返るテストを実装（tag: `@setup-quadmemo-hosting`, `@TP-004`）
- [x] E7 TP-005: アプリシェルのレスポンスの `Cache-Control` に `no-cache` が含まれるテストを実装（tag: `@setup-quadmemo-hosting`, `@TP-005`）
- [x] E8 TP-006: アプリシェルのレスポンスに `X-Content-Type-Options: nosniff` と `Strict-Transport-Security` が付与されているテストを実装（tag: `@setup-quadmemo-hosting`, `@TP-006`）
- [x] E9 `E2E_BASE_URL=https://<配信サブドメイン> npx playwright test --grep @setup-quadmemo-hosting` を両プロジェクト（chromium / mobile-safari）で実行し、全件パスすることを確認
- [x] E10 `bash scripts/check-test-plan.sh --change setup-quadmemo-hosting` を実行し、`@setup-quadmemo-hosting` タグ付きテストの存在チェックが通ることを確認（引数なしの差分モードは `openspec/` を git 管理下に入れるまで exit 2 になる）
