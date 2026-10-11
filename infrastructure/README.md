# @mangowave/infrastructure

AWS CDK v2 stack for MangoWave infrastructure (backend + frontend hosting).

## Development

```bash
pnpm run build         # tsc --noEmit (typecheck only)
pnpm run test          # Jest (CDK template assertion tests)
pnpm exec cdk synth    # Synthesize CloudFormation template
pnpm exec cdk deploy -c alertEmail=<email> -c acmCertArn=<arn> -c webAclArn=<arn>  # Deploy (alertEmail required)
```

## Resources

| Resource           | Type             | Description                                                         |
| ------------------ | ---------------- | ------------------------------------------------------------------- |
| DynamoDB table     | NoSQL database   | Auth sessions (90-day TTL) and user settings (single-table, RETAIN) |
| 4 Lambda functions | Node.js handlers | auth-callback, auth-refresh, settings-save, settings-load           |
| HTTP API           | API Gateway v2   | CORS + stage-level throttling (20 burst, 10 rps)                    |
| CloudWatch alarms  | Per-Lambda + API | Error and 5xx monitoring                                            |
| Access logging     | API Gateway      | Structured JSON logs (30-day retention)                             |
| Kill-switch Lambda | Node.js handler  | budget-kill-switch — disables the 4 API functions on budget breach  |
| SNS topics         | Alerts           | Alarm + budget emails; a second topic triggers the kill-switch      |
| Budget             | AWS Budgets      | Alerts and automated cost protection                                |
| SSM parameters     | Spotify secrets  | OAuth credentials (encrypted)                                       |
| S3 bucket          | Frontend hosting | Static assets for app + landing page                                |
| CloudFront         | CDN              | Distribution with host-based routing, TLS 1.3 minimum               |
| CloudFront Func    | Edge routing     | Routes `mangowave.app` / `www.mangowave.app` to `/landing/` prefix  |

### CORS

API Gateway CORS is configured in the stack with allowed origins defaulting to `https://play.mangowave.app` and `http://localhost:5173`. Override via stack prop `corsAllowOrigins`.

## Cost Protection

- **API throttling** — 20 burst / 10 rps at the API Gateway stage level
- **Budget** — $1/month limit with email alerts at 50% and 100% of actual spend
- **Kill-switch** — at 100% of actual spend the API is shut off automatically (see below)

### Budget kill-switch

**Trigger:** when actual month-to-date spend exceeds 100% of the budget, AWS Budgets publishes to a dedicated SNS topic (`MangoWave-BudgetKillSwitch`). Nothing else publishes to that topic. AWS Budgets refreshes billing data only a few times a day, so expect a delay of several hours between the spend and the trigger.

**What it does:** the topic invokes the `budget-kill-switch` Lambda, which sets reserved concurrency to `0` on the four API functions. Lambda then refuses every invocation, so all API routes return errors.

**What users see:** the visualizer is fully client-side and keeps working. Only Spotify login and cloud settings sync stop.

**What it does not do:** it does not stop CloudFront, S3 or DynamoDB storage charges, and it does not reset itself when a new month starts. A stack deploy does not undo it either, since the stack does not manage reserved concurrency.

**Recovery:** once the cause of the spend is understood, remove the limit from each of the four API functions:

```bash
# List the deployed function names (CDK generates them)
aws lambda list-functions --query "Functions[?starts_with(FunctionName, '<stack-name>-')].FunctionName"

# Run once per API function: auth-callback, auth-refresh, settings-save, settings-load
aws lambda delete-function-concurrency --function-name <function-name>
```

The same names are in the kill-switch function's `API_FUNCTION_NAMES` environment variable. The budget notifies once per breach, so check the bill before re-enabling: the kill-switch will not fire again for spend that is already over the limit.

If the kill-switch itself fails, it throws: the error is in its CloudWatch log group, and Lambda retries the invocation.

## Stack Layout

```
infrastructure/
├── bin/mangowave.ts                          # CDK app entry point
├── lib/mangowave-stack.ts                    # Main stack definition (all resources)
├── lib/cloudfront-functions/host-router.js   # CloudFront Function for host-based routing
├── test/infrastructure.test.ts               # CDK template assertion tests
├── cdk.json
└── tsconfig.json
```

## Prerequisites (before CDK deploy)

These resources must exist before running `cdk deploy`:

- **ACM certificate** — TLS cert for CloudFront (e.g. `*.yourdomain.com`), must be in **us-east-1**
- **Route 53 hosted zone** — DNS for your domain (or configure DNS manually if not using Route 53)
- **WAF WebACL** — CloudFront security protection (optional but recommended), must be in **us-east-1**
- **SSM Parameter Store entries** — 3 SecureString parameters for Spotify credentials:
  ```
  /mangowave/spotify/client-id
  /mangowave/spotify/client-secret
  /mangowave/spotify/redirect-uri
  ```
  Lambda env vars contain the parameter _names_, not the actual secrets — values are fetched at runtime via `GetParameter` with decryption.
- **GitHub OIDC provider + IAM role** — only if using CI/CD (GitHub Actions assumes this role for AWS access)

## Deployment

Automated via GitHub Actions (`.github/workflows/deploy.yml`) using OIDC to assume an IAM role (pre-created outside this stack). Manual deploy:

```bash
pnpm exec cdk deploy -c alertEmail=you@example.com -c acmCertArn=<arn> -c webAclArn=<arn>
```

### Required GitHub Secrets

| Secret                      | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `AWS_DEPLOY_ROLE_ARN`       | IAM role ARN for GitHub OIDC credential assumption     |
| `ALERT_EMAIL`               | Email for CloudWatch alarm + budget SNS notifications  |
| `ACM_CERT_ARN`              | ACM certificate ARN for CloudFront (`*.mangowave.app`) |
| `WEB_ACL_ARN`               | WAF WebACL ARN for CloudFront security protection      |
| `VITE_API_URL`              | API Gateway endpoint URL (frontend build)              |
| `VITE_SENTRY_DSN`           | Sentry DSN for error tracking (frontend build)         |
| `VITE_PUBLIC_POSTHOG_KEY`   | PostHog project API key (frontend build)               |
| `VITE_PUBLIC_POSTHOG_HOST`  | PostHog ingest host (frontend build)                   |
| `VITE_SPOTIFY_CLIENT_ID`    | Spotify app client ID (frontend build)                 |
| `VITE_SPOTIFY_REDIRECT_URI` | Spotify OAuth redirect URI (frontend build)            |
| `VITE_LOCKED_MODE`          | Set to `true` to restrict Spotify to magic-link users  |
| `VITE_UNLOCK_HASH`          | SHA-256 hash of the magic-link unlock passphrase       |
| `SENTRY_AUTH_TOKEN`         | Sentry auth token for source map upload during build   |
| `SENTRY_ORG`                | Sentry organization slug (source map upload)           |
| `SENTRY_PROJECT`            | Sentry project slug (source map upload)                |
