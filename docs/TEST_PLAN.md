# Verification matrix (execute in real Learner Lab)

| Case | How to test | Expected evidence |
|---|---|---|
| Local scanner | `node --test tests/test-local.mjs` | Two passing tests; vulnerability finding |
| Container | `docker build -t mergeguard-scanner ./scanner` | Image build; `docker images` |
| Webhook valid | Open PR with configured webhook | GitHub delivery 202; DynamoDB QUEUED |
| Bad HMAC | Send payload with wrong `X-Hub-Signature-256` | 401; no new record |
| Duplicate | Redeliver same GitHub PR event | 200 duplicate; one DynamoDB job |
| Fargate | Check ECS task and logs | RUNNING then STOPPED; no public IP |
| SAST finding | PR with test-only hardcoded secret | JSON findings in private S3; GitHub failure check |
| Clean repo | PR without matched patterns | Report count 0; GitHub success check |
| Completion | Inspect EventBridge and Lambda logs | DynamoDB COMPLETED or FAILED |
| Timeout | Create stale RUNNING test record in isolated test account | TIMED_OUT and failure check |
| Queue failure | Misconfigure ECS task definition temporarily | SQS retry and eventually DLQ |
| Dashboard | Cognito sign-in, enter scan ID | Polls every 5s; report link for completed |
| Access denial | Unauthenticated request / wrong user | 401/403 |
| Monitoring | Force a scanner failure | Completion log `MERGEGUARD_FAILED`; alarm after evaluation period |

Record actual timestamps, AWS region, screenshots and pass/fail outcomes in `docs/RESULTS_TEMPLATE.md`. No AWS tests are claimed as passed in this package.
