design.md の Open Question（Environment 名）は `production` で確定して進める。名前を変える場合は、
IAM 信頼ポリシーの `sub`（1.3）と `deploy.yml` の `environment:`（3.2）を同時に変えること。

## 1. Terraform: OIDC プロバイダとデプロイ用ロール

- [x] 1.1 apply の前に `aws iam list-open-id-connect-providers` を実行し、`token.actions.githubusercontent.com` のプロバイダが既に存在するかを確認する。存在する場合は 1.2 の作成ではなく `terraform import` で取り込む方針に切り替える（design.md - D5）。実施結果: 既存プロバイダ無し（`[]`）→ 新規作成
- [x] 1.2 `infra/github_oidc.tf` に `aws_iam_openid_connect_provider.github` を定義する（`url = "https://token.actions.githubusercontent.com"`、`client_id_list = ["sts.amazonaws.com"]`、`thumbprint_list` は指定しない）。`terraform -chdir=infra validate` が通ることを確認
- [x] 1.3 同ファイルに `aws_iam_role.github_actions_deploy` を定義する。信頼ポリシーは `aws_iam_policy_document` で書き、`Federated` にプロバイダ ARN、条件を `token.actions.githubusercontent.com:aud` = `sts.amazonaws.com`（StringEquals）と `token.actions.githubusercontent.com:sub` = `repo:sudabon/grocery_manager:environment:production`（StringEquals、ワイルドカード禁止）にする（design.md - D3）。`terraform -chdir=infra validate` が通ることを確認。実施メモ: 初回 CD が `Not authorized to perform sts:AssumeRoleWithWebIdentity` で失敗。CloudTrail で実際の `sub` が immutable 形式 `repo:sudabon@140196/grocery_manager@1360775157:environment:production` であることを確認し、その値に修正した
- [x] 1.4 同ファイルに最小権限のインラインポリシーを定義する。design.md - D6 の対応表どおり、`s3:ListBucket` を `aws_s3_bucket.app.arn`、`s3:GetObject` / `s3:PutObject` / `s3:DeleteObject` を `"${aws_s3_bucket.app.arn}/*"`、`cloudfront:CreateInvalidation` / `cloudfront:GetInvalidation` を `aws_cloudfront_distribution.app.arn` に限定する（ARN は式で参照し、文字列を書かない）
- [x] 1.5 `infra/outputs.tf` に `github_actions_deploy_role_arn` を追加する（description に「GitHub Environment の `AWS_ROLE_ARN` へ写す値」と明記）
- [x] 1.6 `terraform fmt -check -recursive infra` と `terraform -chdir=infra init -backend=false && terraform -chdir=infra validate` が差分ゼロ・exit 0 であることを確認する（verify.yml の terraform ジョブと同じ検証）

## 2. AWS への適用と GitHub 側の設定

- [x] 2.1 手元から `terraform -chdir=infra plan` を実行し、追加されるのが OIDC プロバイダ・ロール・ロールポリシーのみ（既存の S3 / CloudFront / ACM に変更なし）であることを確認する。実施メモ: `QuadMemoTerraform` 権限セットに IAM 権限が無く apply が AccessDenied になったため、`~/workspace/sudabon/terraform/identity_center.tf` に OIDC プロバイダとロール `quadmemo-github-actions-deploy` に限定した IAM ステートメントを追加した（共有 Terraform 側は `AWS_PROFILE=admin` で apply が必要。今回の `infra/` apply は admin で実施）。IAM role の description は ASCII / Latin-1 のみのため英語にした
- [x] 2.2 `terraform -chdir=infra apply` を実行し、`terraform -chdir=infra output -raw github_actions_deploy_role_arn` / `app_bucket` / `cloudfront_distribution_id` の 3 値が取得できることを確認する
- [x] 2.3 GitHub リポジトリに Environment `production` を作成し、deployment branch 制限を `main` のみに設定する（design.md - D3 / D4）。設定後、Environment の設定画面で `main` 以外が選択できない状態になっていることを確認
- [x] 2.4 Environment `production` に variable として `AWS_ROLE_ARN` / `AWS_REGION`（`ap-northeast-1`）/ `QUADMEMO_APP_BUCKET` / `QUADMEMO_DISTRIBUTION_ID` を登録する（2.2 の出力値を写す）。`gh api repos/sudabon/grocery_manager/environments/production/variables` で 4 件が登録されていることを確認
- [x] 2.5 リポジトリの Actions secrets に AWS の長期アクセスキー（`AWS_ACCESS_KEY_ID` など）が登録されていないことを確認する（test-plan.md「長期アクセスキーを保持しない」の委譲先）

## 3. deploy.sh の配信先解決

- [x] 3.1 `scripts/deploy.sh` の配信先取得を「`QUADMEMO_APP_BUCKET` と `QUADMEMO_DISTRIBUTION_ID` が両方とも空でなければそれを使い、`terraform` を呼ばない。片方でも欠けていれば欠けている側を `terraform output -raw` で補う」に変更する（design.md - D2）。既存の形式チェックは解決経路の後ろに置いたまま変更しない
- [x] 3.2 `bash -n scripts/deploy.sh` が通ることを確認する
- [x] 3.3 `tests/scripts/deploy.test.mjs` に、両環境変数を与えた実行で `terraform` が一度も呼ばれず、与えたバケット名・ディストリビューション ID が `aws` の引数に現れることの検証を追加する（test-plan.md「明示的に与えられた配信先が使われる」）
- [x] 3.4 同ファイルに、環境変数を与えない実行が従来どおり `terraform output` を 2 回呼ぶことの検証を追加する（回帰防止）
- [x] 3.5 同ファイルに、形式に合致しない値（例: `not-a-bucket` / 小文字を含むディストリビューション ID）を環境変数で与えた実行が非 0 で終了し、`aws` が一度も呼ばれないことの検証を追加する（test-plan.md「形式が不正な配信先ではデプロイが中止される」）
- [x] 3.6 同ファイルに、`dist/index.html` が空のとき `aws` が一度も呼ばれずに中止することの検証を追加する（test-plan.md「ビルド成果物が不正なら書き込み前に中止する」。既存の検証があれば補強に留める）
- [x] 3.7 `npm run test:scripts` が全件パスすることを確認する

## 4. ワークフロー

- [x] 4.1 `.github/workflows/verify.yml` の `on` から `push: branches: [main]` を外し、`workflow_call:` を追加する（design.md - D1）。`pull_request` でのチェック名が `verify / scripts` / `verify / terraform` の形に変わることを PR 上で確認し、ブランチ保護の必須チェックを設定している場合は名前を更新する
- [x] 4.2 `.github/workflows/deploy.yml` を新規作成する。`on: push: branches: [main]`、ワークフロー既定の `permissions: contents: read`、`concurrency: { group: deploy-production, cancel-in-progress: false }`（design.md - D7）
- [x] 4.3 `deploy.yml` に `verify` ジョブ（`uses: ./.github/workflows/verify.yml`）と、`needs: verify` の `deploy` ジョブを定義する。`deploy` ジョブに `environment: { name: production, url: https://<配信サブドメイン> }` と `permissions: { id-token: write, contents: read }` を付ける。**実装時の決定: `url` は省略**（配信ドメインをリポジトリに置かない README の方針を優先。Deployments 画面のリンク表示のみの装飾で、変数スコープや OIDC の `sub` には影響しない）
- [x] 4.4 `deploy` ジョブのステップを、checkout → `actions/setup-node`（`node-version: 24`、verify.yml と同じ）→ `npm ci` → `aws-actions/configure-aws-credentials@v6`（`role-to-assume: ${{ vars.AWS_ROLE_ARN }}`、`aws-region: ${{ vars.AWS_REGION }}`）→ `bash scripts/deploy.sh`（`env` に `QUADMEMO_APP_BUCKET` / `QUADMEMO_DISTRIBUTION_ID` を `vars` から渡す）の順で書く。Terraform のセットアップは入れない（design.md - D2）
- [x] 4.5 `deploy.yml` / `verify.yml` を YAML として解釈できることを確認する（`python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/deploy.yml .github/workflows/verify.yml` が exit 0）。実装時: 手元に PyYAML が無いため `ruby -ryaml` で同等の解釈確認を行った
- [x] 4.6 `deploy.yml` をレビューし、test-plan.md の委譲先として挙げた 5 点（`on` が main への push のみ / `needs` に verify が含まれる / `concurrency` が固定グループかつ `cancel-in-progress: false` / `id-token: write` が deploy ジョブのみ / `role-to-assume` を使い長期キーを参照しない）が満たされていることを確認する

## 5. ドキュメント

- [x] 5.1 `README.md` に「継続的デプロイ」の節を追加する。main へのマージで配信まで到達すること、承認ゲートが無いこと、手元からの `bash scripts/deploy.sh` が引き続き使えることを記す
- [x] 5.2 同節に GitHub 側の設定手順（Environment `production` の作成、deployment branch 制限、4 つの variable と `terraform output` のどれを写すか）を記す。Terraform 管理外である理由（design.md - D4）も 1 行で添える
- [x] 5.3 同節に「`terraform apply` で配信先を作り直したら Environment 変数も更新する」を明記する（design.md - Risks）
- [x] 5.4 `.env.example` に `QUADMEMO_APP_BUCKET` / `QUADMEMO_DISTRIBUTION_ID`（任意。指定すると `terraform output` を介さず配信先を決める）をコメント付きで追加する

## 6. E2E fixture の追加

- [x] 6.1 `tests/e2e/fixtures/current-build.ts` に `env:current-build` fixture を追加する。`dist/index.html` が存在しない、または読めない場合は `test.skip` し、存在すればアプリシェルが参照するハッシュ付きアセットのパス一覧を提供する
- [x] 6.2 `tests/e2e/fixtures/README.md` に `env:current-build` を（作られる状態・使用する TP-ID・方式）とともに登録し、表と実装が一致していることを確認する

## E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う（locator は getByRole/getByLabel/getByText 優先、`page.locator()`・XPath 禁止、`waitForTimeout` 禁止）。全テストに `@setup-quadmemo-cd` と `@TP-NNN` を付与し、`tests/e2e/setup-quadmemo-cd.spec.ts` へ実装する。

- [x] E1 TP-001: 配信ドメインのアプリシェルが参照するハッシュ付きアセットの集合が、`env:current-build` が提供する手元のビルド成果物のそれと一致することを検証する（tag: `@setup-quadmemo-cd`, `@TP-001`、fixture `env:deployed-origin` + `env:current-build`）
- [x] E2 TP-002: TP-001 で一致したハッシュ付きアセットを配信ドメインから取得し、200 で返り `Cache-Control` が `public, max-age=31536000, immutable` であること、およびアプリシェルの `Cache-Control` が `no-cache` であることを検証する（tag: `@setup-quadmemo-cd`, `@TP-002`、fixture `env:deployed-origin` + `env:current-build`）
- [x] E3 `bash scripts/check-test-plan.sh --change setup-quadmemo-cd` を実行し、TP-ID 2/2 が報告されることを確認する

## 7. 初回 CD の実行と検証

- [x] 7.1 1〜6 の変更を PR にし、`verify` が `pull_request` で通ること、および配信が実行されないこと（`deploy.yml` の実行履歴が空であること）を確認する（test-plan.md「変更提案では配信が実行されない」）
- [x] 7.2 PR を main へマージし、`deploy.yml` が起動して `verify` → `deploy` の順に成功することを実行履歴で確認する。実施結果: PR #11 マージ（74e86f8）で run 35429748323 が起動。verify 2 ジョブ成功 → deploy は初回 `Not authorized to perform sts:AssumeRoleWithWebIdentity` で失敗（信頼ポリシーの `sub` が immutable 形式でなかった。1.3 のメモ参照）。AWS 側を修正して失敗ジョブを再実行し success。修正は PR #12（a31788d）として main へ反映し、2 回目の run 35430184538 も verify → deploy の順に success
- [x] 7.3 `deploy` ジョブのログで、`configure-aws-credentials` が OIDC でロールを引き受けていること（長期キーを使っていないこと）と、`terraform` が一度も実行されていないことを確認する。実施結果: `Assuming role with OIDC` → `Authenticated as assumedRoleId ...:GitHubActions` を確認。deploy ジョブのログに `terraform` は 0 件
- [x] 7.4 `npm run build` を手元で実行したうえで `E2E_BASE_URL=https://<配信サブドメイン> npx playwright test --grep @setup-quadmemo-cd` を両プロジェクト（chromium / mobile-safari）で実行し、全件パス（フレーク 0 件）することを確認する。実施結果: main（74e86f8）を `npm run build` 後、chromium / mobile-safari の 4 件 passed、リトライなし
- [x] 7.5 アプリシェルに見える変更を 1 つ入れて main へマージし、CD 完走後にブラウザのリロードで反映されることを確認する（spec: デプロイ後にリロードで新バージョンが反映される）。実施結果: PR #13 で `package.json` を 0.2.0 に上げてマージ（42e3f39、run 35430281513 success）。配信ドメインの `/settings` を chromium / webkit で開きリロード → `バージョン 0.1.0` から `バージョン 0.2.0` に変わることを確認
- [x] 7.6 `aws cloudfront get-invalidation` または実行ログで、エントリポイント 6 パスの無効化が作成され完了していることを確認する。実施結果: 2 回目の CD（削除アセットなし）の無効化 `I40O7KG4X0H4A79DJHHNCRF1GL` がエントリポイント 6 パスちょうどで Completed。初回は旧 JS の削除を伴ったため設計どおり `/*`（`IA2ZGM0K2YJ6I0DZN2DC1E6LH7`、Completed）

## 8. 検証

- [x] 8.1 `npm run build` / `npm test` / `npm run test:scripts` が全件パスすることを確認する
- [x] 8.2 `terraform fmt -check -recursive infra` が差分ゼロ、`terraform -chdir=infra init -backend=false && terraform -chdir=infra validate` が exit 0 であることを確認する
- [x] 8.3 `terraform -chdir=infra plan` が `No changes.` であることを確認する（apply 後の冪等性）
- [x] 8.4 `E2E_BASE_URL` を設定した状態で `npx playwright test` の全件実行を行い、既存観点（特に `setup-quadmemo-hosting`）に回帰が無いことを確認する。実施結果: main（42e3f39）で 321 passed / 0 failed / 0 flaky（chromium / mobile-safari / pwa）
- [x] 8.5 `openspec validate setup-quadmemo-cd` が成功し、`git diff --check` に差分が無いことを確認する
