# @mangowave/infrastructure

AWS CDK v2 stack for MangoWave's backend infrastructure.

## Development

```bash
npm run build          # tsc
npm run test           # Jest (15 CDK template assertion tests)
npx cdk synth          # Synthesize CloudFormation template
npx cdk deploy -c alertEmail=<email>   # Deploy stack
```

## Resources

| Resource           | Type             | Details                                                   |
| ------------------ | ---------------- | --------------------------------------------------------- |
| `MangoWave_Data`   | DynamoDB table   | PK: `USER#<spotify_id>`, SK: `PROFILE`                    |
| 4 Lambda functions | Node.js handlers | auth-callback, auth-refresh, settings-save, settings-load |
| HTTP API           | API Gateway v2   | Stage-level throttle: 20 burst, 10 rate/sec               |
| CloudWatch alarms  | Per-Lambda + API | 3 errors/5min per Lambda, 5 5xx/5min for API              |
| Access logging     | API Gateway      | Structured JSON, 1-month retention                        |
| SNS topic          | Alerts           | All alarms notify via email                               |
| Budget             | $1/month         | SNS alerts at 50% and 100%                                |
| Budget kill-switch | IAM Deny policy  | Auto-attached to Lambda roles at 100% budget              |
| SSM parameters     | Spotify secrets  | client-id, client-secret, redirect-uri                    |
| S3 bucket          | Frontend hosting | Private, CloudFront OAC                                   |
| CloudFront         | CDN              | OAC to S3, host-based routing function                    |

## Cost Protection

- **API Gateway throttling:** 20 burst, 10 sustained requests/sec (HTTP API v2 stage-level)
- **Budget kill-switch:** At $1/month, a `BudgetsAction` auto-attaches an IAM Deny policy to all Lambda execution roles, blocking API and Lambda invocations
- **No reserved concurrency** on Lambdas — new AWS accounts have a 10 unreserved minimum that conflicts with reservations across 4 functions

## Stack Layout

```
infrastructure/
├── bin/mangowave.ts            # CDK app entry point
├── lib/mangowave-stack.ts      # Main stack definition (all resources)
├── test/infrastructure.test.ts # CDK template assertion tests
├── cdk.json
└── tsconfig.json
```

## Deployment

Automated via GitHub Actions (`.github/workflows/deploy.yml`) using OIDC to assume `GitHubActions-MangoWave` IAM role. Manual deploy:

```bash
npx cdk deploy -c alertEmail=you@example.com
```
