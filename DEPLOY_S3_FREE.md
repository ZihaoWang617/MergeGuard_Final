# MergeGuard S3-free demo deployment

## Changes
- Reports are saved as a `report` attribute on the existing DynamoDB job item, rather than S3.
- The scanner container now requires `TABLE_NAME` instead of `REPORT_BUCKET`.
- The authenticated `/scans/{id}/report` endpoint returns `{ "report": ... }`; Dashboard downloads JSON from that response.
- Reports over 300 KB are explicitly rejected to leave headroom under DynamoDB's 400 KB item limit.

## IMPORTANT: Terraform state safety
1. Back up `infra/terraform.tfstate` and all state backups; do not copy state to GitHub.
2. Run `terraform state list` and confirm which of these exist: `aws_s3_bucket.reports`, `aws_s3_bucket_public_access_block.reports`, `aws_s3_bucket_server_side_encryption_configuration.reports`, `aws_s3_bucket_versioning.reports`.
3. If the S3 bucket exists in state and you intentionally want to **leave it in AWS** rather than have Terraform delete it, run `terraform state rm aws_s3_bucket.reports` (and each of the other S3 resource addresses only if present). This **orphans** the bucket; manually delete it later when safe to avoid lingering costs. Do not run state rm without understanding this tradeoff.
4. Alternatively, keep the original state and review a normal plan, but that may propose S3 destruction and hit the same SCP error. Do NOT approve unexpected destruction.
5. Install production dependencies inside `services`: `npm.cmd install --omit=dev`. Build and push a NEW scanner Docker image containing the modified runner and package dependencies. Update `scanner_image` in terraform.tfvars to the new immutable image digest. Otherwise the old image will still try to use S3.
6. From `infra`, run `terraform fmt`, `terraform init`, `terraform validate`, `terraform plan`. Review all changes before `terraform apply`.
7. Check that the Learner Lab role can `dynamodb:UpdateItem`, `dynamodb:GetItem` and the other operations needed by the scanner and Lambda functions. Also check Lambda creation permissions.
8. Configure Cognito callback URL to the actual API Gateway dashboard HTTPS URL; configure the demo user subject and GitHub secret. These are required for the end-to-end demo.

## Known limitations
- This is a course-demo storage strategy, not a production replacement for S3.
- The existing S3 bucket is not deleted by these file changes alone.
- No AWS apply was executed here; AWS IAM/SCP and service quotas may still block resources.
