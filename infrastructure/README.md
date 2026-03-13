# @mangowave/infrastructure

AWS CDK v2 stack for MangoWave's backend infrastructure.

## Development

```bash
npm run build          # tsc
npm run test           # Jest (CDK template assertion tests)
npx cdk synth          # Synthesize CloudFormation template
npx cdk deploy -c alertEmail=<email>   # Deploy stack
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

S3 bucket and CloudFront distribution are pre-created outside this CDK stack. The deploy workflow references them via GitHub secrets.

### CORS

API Gateway CORS is configured in the stack with allowed origins defaulting to `https://play.mangowave.app` and `http://localhost:5173`. Override via stack prop `corsAllowOrigins`.

## Cost Protection

API throttling, budget kill-switch, no reserved concurrency — see CDK stack for specifics.

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

Automated via GitHub Actions (`.github/workflows/deploy.yml`) using OIDC to assume an IAM role (pre-created outside this stack). Manual deploy:

```bash
npx cdk deploy -c alertEmail=you@example.com
```
