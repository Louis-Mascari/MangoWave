# @mangowave/infrastructure

AWS CDK v2 stack for MangoWave infrastructure (backend + frontend hosting).

## Development

```bash
pnpm run build         # tsc
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
| SNS topic          | Alerts           | All alarms notify via email                                         |
| Budget             | AWS Budgets      | Alerts and automated cost protection                                |
| SSM parameters     | Spotify secrets  | OAuth credentials (encrypted)                                       |
| S3 bucket          | Frontend hosting | Static assets for app + landing page                                |
| CloudFront         | CDN              | Distribution with host-based routing, TLS 1.3 minimum               |
| CloudFront Func    | Edge routing     | Routes `mangowave.app` / `www.mangowave.app` to `/landing/` prefix  |

### CORS

API Gateway CORS is configured in the stack with allowed origins defaulting to `https://play.mangowave.app` and `http://localhost:5173`. Override via stack prop `corsAllowOrigins`.

## Cost Protection

- **API throttling** — 20 burst / 10 rps at the API Gateway stage level
- **Budget** — $1/month limit with SNS alerts at 50% and 100% of actual spend
- **Kill-switch** — at 100% budget, AWS Budgets automatically attaches a deny policy to all Lambda roles (blocks `lambda:InvokeFunction` and `execute-api:Invoke`)

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
