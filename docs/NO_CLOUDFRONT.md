# Public Dashboard without CloudFront

The MergeGuard dashboard is **publicly reachable at the API Gateway HTTPS URL**, but scan data remains private behind Cognito JWT authorization. API Gateway routes `GET /`, `GET /index.html`, `GET /app.js`, and `GET /config.js` to `services/site.js` (Lambda). It serves bundled static assets and returns a dynamic `config.js`. API endpoints `POST /webhook`, `GET /scans/{id}`, and `GET /scans/{id}/report` remain unchanged.

## Deploy

1. Build and push scanner image, set AWS credentials and required Terraform variables as in `DEPLOYMENT.md`.
2. Run `terraform -chdir=infra init` then `terraform -chdir=infra apply`.
3. Run `terraform -chdir=infra output -raw dashboard_url` to get the public HTTPS URL.
4. Create a Cognito demo user; set `demo_user_sub` and `dashboard_callback_url` (exact URL with trailing slash) in `terraform.tfvars`; apply again.
5. Open the dashboard URL, sign in, and enter a scan ID.

## Security and limitations

The HTML and JS are public. Scan data and private S3 reports are **not** public; Cognito JWT and single-user demo authorization protect them. No S3 website/public bucket is created. This is appropriate for a small demo, not a CDN replacement. API Gateway HTTPS default endpoint is publicly accessible by default; do not disable the default execute-api endpoint.

## Existing CloudFront deployment

If switching an existing Terraform state, `terraform plan` should show the CloudFront distribution, origin access control, and site S3 bucket being destroyed and a new site Lambda/routes created. Review the plan before applying; old CloudFront URL will stop working. Preserve the Terraform state; do not delete it manually.
