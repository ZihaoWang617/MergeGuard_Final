# Individual Contributions — from Project Progress Slides, slide 4

| Team member | Assigned ownership | Main files | Demonstration responsibility |
|---|---|---|---|
| **Snahil Singh Dasawat** | Terraform and network; Scan API | `infra/main.tf`, `infra/terraform.tfvars.example`, `services/webhook.js`, `services/dispatcher.js`, `services/status.js`, `services/common.js` | VPC/private subnet/NAT, API Gateway HMAC, DynamoDB deduplication, SQS dispatch, Cognito API access |
| **Zihao Wang** | Scanner, CI, ECS, observability | `scanner/scanner.js`, `scanner/runner.js`, `scanner/Dockerfile`, `.github/workflows/scanner.yml`, `tests/test-local.mjs`, ECS/CloudWatch resources in `infra/main.tf` | Local Docker scan, image digest, Fargate run, JSON report, CloudWatch metrics/logs |
| **Mingyuan Zhuang** | Check publishing, timeout handling, dashboard | `services/completion.js`, `services/publisher.js`, `services/sweeper.js`, `services/notify.js`, `dashboard/`, EventBridge rules in `infra/main.tf` | GitHub Check result, EventBridge STOPPED rule, sweeper schedule, authenticated Dashboard and report links |

These are **PPT-defined assignments**, not claims of personal code authorship. The assembled reference implementation was generated for the team and must be reviewed, deployed, tested and committed by the responsible team members. Replace this paragraph with accurate Git commit and demo evidence before submitting.
