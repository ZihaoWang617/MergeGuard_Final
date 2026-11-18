# MergeGuard AWS Learner Lab deployment guide (Windows PowerShell)

This is a **deployment recipe, not evidence of a live deployment**. A live AWS account, supported IAM permissions, GitHub credentials, Docker Hub and Terraform are required. The supplied Terraform is intended for a single-team classroom demo, not a production multi-tenant service.

## 0. Prerequisites and limits

- AWS Academy Learner Lab with access to VPC, NAT Gateway, ECS Fargate, Lambda, API Gateway, DynamoDB, SQS, S3, Cognito, Secrets Manager, CloudWatch and EventBridge. Some labs **block Cognito, IAM PassRole, ECS or Secrets Manager**. If a permission is denied, ask the instructor; do not assume you can create IAM roles.
- AWS CLI v2, Terraform >= 1.5, Node.js >= 22, Docker Desktop, GitHub account, Docker Hub account.
- One **public** JavaScript GitHub repository you own, containing a pull request; private repository cloning is not supported in this classroom implementation.
- One existing LabRole (or another instructor-provided role) with necessary AWS permissions. This is **broader than least privilege**, a Learner Lab concession, and must not be used as a production pattern.
- Region `us-east-1` unless changed in `terraform.tfvars`. NAT can incur costs; destroy after demo.

## 1. AWS credentials and preflight

Start Learner Lab, click AWS Details > AWS CLI, copy the temporary credentials into `~/.aws/credentials` (on Windows: `$HOME\.aws\credentials`) as `[default]`. Never commit them.

```powershell
aws sts get-caller-identity
aws iam get-role --role-name LabRole --query 'Role.Arn' --output text
aws ecs list-clusters --region us-east-1
aws cognito-idp list-user-pools --max-results 1 --region us-east-1
```

If Cognito or other required services are denied, the complete design cannot be deployed in that lab without an instructor-approved alternative.

## 2. GitHub token and webhook secret

Create a GitHub fine-grained PAT scoped to your demo repository with **Checks: Read and write** (repository access) for the Check Publisher. The PAT must be stored in AWS Secrets Manager, not source code. For the classroom demo use a randomly generated webhook secret and add the *same* value to the GitHub webhook later. GitHub App installation tokens are preferred for production.

```powershell
$webhookSecret = -join ((1..48) | ForEach-Object { 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[(Get-Random -Maximum 62)] })
$token = Read-Host 'GitHub token (input is visible; use a secure input method instead)'  # avoid storing in shell history
$payload = @{ webhook_secret = $webhookSecret; github_token = $token } | ConvertTo-Json -Compress
aws secretsmanager create-secret --name mergeguard/github --secret-string $payload --region us-east-1
aws secretsmanager describe-secret --secret-id mergeguard/github --query ARN --output text --region us-east-1
```

For safer input, use `Read-Host -AsSecureString` and a secure conversion process; do not paste tokens into a shared terminal or screenshots. Record the secret ARN privately. If a secret already exists, use `put-secret-value` rather than `create-secret`.

## 3. Build and publish scanner Docker image

From the project root in PowerShell:

```powershell
node --test tests/test-local.mjs
docker build --platform linux/amd64 -t YOUR_DOCKERHUB_USERNAME/mergeguard:v1 ./scanner
docker login
docker push YOUR_DOCKERHUB_USERNAME/mergeguard:v1
docker buildx imagetools inspect YOUR_DOCKERHUB_USERNAME/mergeguard:v1
```

Copy the `sha256:...` digest shown in the inspect output. Set `scanner_image` to `docker.io/YOUR_DOCKERHUB_USERNAME/mergeguard@sha256:...`. Avoid mutable `latest` tags. A GitHub Actions workflow is also included in `.github/workflows/scanner.yml`; configure repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.

## 4. Package Lambda dependencies

```powershell
cd services
npm install --omit=dev
cd ..
```

The Terraform `archive_file` packages the services folder **including node_modules**. This is required; otherwise AWS SDK submodules might be missing from the Lambda runtime. Do not commit `node_modules`.

## 5. Terraform first apply

```powershell
cd infra
Copy-Item terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your actual image digest, LabRole ARN, secret ARN,
# allowed_repo, globally unique Cognito prefix. Leave demo_user_sub as placeholder.
terraform init
terraform fmt -recursive
terraform validate
terraform plan -out tfplan
terraform apply tfplan
terraform output
```

If `iam:PassRole` or ECS task creation is denied, the existing LabRole needs instructor-approved permissions. Terraform does **not** create IAM roles in this restricted-lab variant. Do not attempt to bypass lab policies.

Terraform creates two-AZ VPC networking (one NAT for cost, single-AZ NAT availability trade-off), private Fargate tasks, DynamoDB with task ARN GSI, SQS+DLQ, private report S3 bucket, API Gateway-hosted HTTPS dashboard, seven Lambdas, API Gateway, EventBridge, Cognito, and CloudWatch. The Docker Hub image is pulled through NAT.

## 6. Create a Cognito demo user and finish authorization

```powershell
$pool = terraform output -raw cognito_user_pool_id
aws cognito-idp admin-create-user --user-pool-id $pool --username YOUR_EMAIL --user-attributes Name=email,Value=YOUR_EMAIL Name=email_verified,Value=true --region us-east-1
aws cognito-idp admin-get-user --user-pool-id $pool --username YOUR_EMAIL --region us-east-1
```

Copy the `sub` attribute into `demo_user_sub` in `terraform.tfvars`. Set `dashboard_callback_url` to the exact URL from `terraform output -raw dashboard_url` (including trailing `/`), then `terraform apply` again. Cognito emails a temporary password; finish the required first-login password change in the hosted UI. Only that Cognito user and `allowed_repo` may access scan data. This is intentionally **single-user demo authorization**, not GitHub OAuth repository permission verification.

## 7. Open the public HTTPS dashboard (no CloudFront)

The dashboard is served by the `site` Lambda through the existing API Gateway HTTP API. The files `dashboard/index.html` and `dashboard/app.js` are bundled into `services/site-assets/` at build time; the `config.js` response is generated dynamically by Lambda. No public S3 website or CloudFront is needed.

```powershell
$site = terraform -chdir=infra output -raw dashboard_url
$site
Start-Process $site
```

After first apply, set `dashboard_callback_url` in `infra/terraform.tfvars` to this **exact HTTPS URL including trailing slash**, then `terraform -chdir=infra apply` again. Sign in with Cognito. Dashboard is publicly reachable, but the scan status/report API requires JWT authentication and checks `demo_user_sub`.

**Note:** API Gateway has request and response size limits; this tiny static site is suitable for the classroom demo. For larger frontends use S3 with a proper HTTPS hosting layer or an ALB/EC2 web server. Any changes to dashboard source must also be copied to `services/site-assets/` before Terraform apply.

## 8. Register GitHub webhook

In your demo GitHub repository: **Settings > Webhooks > Add webhook**.

- Payload URL: `<api_url>/webhook` (from `terraform output -raw api_url`)
- Content type: `application/json`
- Secret: `webhook_secret` from step 2
- SSL verification: enabled
- Trigger: **Let me select individual events > Pull requests**
- Active: checked

Open a PR or push a new commit to an open PR. GitHub delivery should receive HTTP 202; duplicate delivery receives HTTP 200. Record the `scan_id` returned in the delivery response and paste it into the dashboard. The `opened`, `synchronize` and `reopened` actions trigger scans.

## 9. Verify the pipeline

```powershell
aws dynamodb scan --table-name mergeguard-jobs --region us-east-1 --projection-expression 'scan_id,#st,repository,task_arn' --expression-attribute-names '{"#st":"status"}'
aws sqs get-queue-attributes --queue-url (terraform -chdir=infra output -raw queue_url) --attribute-names ApproximateNumberOfMessages --region us-east-1
aws ecs list-tasks --cluster mergeguard-cluster --region us-east-1
aws logs tail /mergeguard/scanner --since 30m --region us-east-1
aws logs tail /aws/lambda/mergeguard-completion --since 30m --region us-east-1
```

Expected status: `QUEUED -> STARTING -> RUNNING -> COMPLETED` (or `FAILED` / `TIMED_OUT`). The scanner uploads `reports/<scan_id>.json` to private S3. EventBridge detects ECS STOPPED, completion Lambda validates report existence, and publisher creates a GitHub Check. Dashboard polls every five seconds and offers a 60-second report URL after successful completion.

**Important**: this implementation has a known dispatch/completion race (STOPPED before task ARN is persisted), and GitHub Check POST may duplicate on ambiguous network retries. Sweeper repairs terminal-status publishing but cannot always recover the early STOPPED event; such jobs time out. These are acceptable classroom failure cases only if disclosed and tested, not production-grade guarantees.

## 10. Demo screenshots and evaluation

Capture: GitHub webhook delivery, DynamoDB record, SQS queue, Fargate task, S3 report object, GitHub Checks pass/fail, Cognito login and Dashboard, CloudWatch logs, EventBridge rules, CloudWatch alarm, Terraform outputs. Test invalid signature (401), duplicate webhook, scanner findings, task failure, timeout, unauthorized status (401/403), and report URL expiration. Do not fabricate screenshots or test results.

## 11. Cleanup and cost

```powershell
cd infra
terraform destroy
```

Remove Secrets Manager secret separately if no longer needed (and understand recovery windows). NAT Gateway, Fargate and S3 incur charges while active. AWS Academy sessions may reset credentials; reauthenticate before subsequent runs. Terraform local state contains resource metadata and must not be committed. For team use, move state to a pre-created S3 backend with supported locking **before collaborating**; the example intentionally defaults to local state to avoid an undeployable circular backend dependency.
