# @mangowave/infrastructure

AWS CDK v2 stack for MangoWave infrastructure (backend + frontend hosting).

## Development

```bash
npm run build          # tsc
npm run test           # Jest (CDK template assertion tests)
npx cdk synth          # Synthesize CloudFormation template
npx cdk deploy -c alertEmail=<email> -c acmCertArn=<arn> -c webAclArn=<arn>  # Deploy stack
```

## Resources

| Resource           | Type             | Description                                               |
| ------------------ | ---------------- | --------------------------------------------------------- |
| DynamoDB table     | NoSQL database   | Auth sessions and user settings (single-table design)     |
| 4 Lambda functions | Node.js handlers | auth-callback, auth-refresh, settings-save, settings-load |
| HTTP API           | API Gateway v2   | CORS + stage-level throttling (20 burst, 10 rps)          |
| CloudWatch alarms  | Per-Lambda + API | Error and 5xx monitoring                                  |
| Access logging     | API Gateway      | Structured JSON logs                                      |
| SNS topic          | Alerts           | All alarms notify via email                               |
| Budget             | AWS Budgets      | Alerts and automated cost protection                      |
| SSM parameters     | Spotify secrets  | OAuth credentials (encrypted)                             |
| S3 bucket          | Frontend hosting | Static assets for app + landing page                      |
| CloudFront         | CDN              | Distribution with host-based routing (app vs landing)     |
| CloudFront Func    | Edge routing     | Routes `mangowave.app` requests to `/landing/` prefix     |

### CORS

API Gateway CORS is configured in the stack with allowed origins defaulting to `https://play.mangowave.app` and `http://localhost:5173`. Override via stack prop `corsAllowOrigins`.

## Cost Protection

API throttling, budget kill-switch, no reserved concurrency — see CDK stack for specifics.

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

## Deployment

Automated via GitHub Actions (`.github/workflows/deploy.yml`) using OIDC to assume an IAM role (pre-created outside this stack). Manual deploy:

```bash
npx cdk deploy -c alertEmail=you@example.com -c acmCertArn=<arn> -c webAclArn=<arn>
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
