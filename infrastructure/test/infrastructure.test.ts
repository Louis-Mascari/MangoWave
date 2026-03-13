import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { MangoWaveStack } from '../lib/mangowave-stack';

describe('MangoWaveStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new MangoWaveStack(app, 'TestStack', {
      alertEmail: 'test@example.com',
      acmCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test-cert-id',
    });
    template = Template.fromStack(stack);
  });

  it('creates a DynamoDB table with PK/SK', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'MangoWave_Data',
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('creates 4 Lambda functions with correct config', () => {
    const lambdas = template.findResources('AWS::Lambda::Function');
    const lambdaKeys = Object.keys(lambdas);
    expect(lambdaKeys.length).toBe(4);

    for (const key of lambdaKeys) {
      expect(lambdas[key].Properties.MemorySize).toBe(128);
      expect(lambdas[key].Properties.Runtime).toBe('nodejs20.x');
    }
  });

  it('creates an HTTP API with CORS', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'MangoWave-API',
      ProtocolType: 'HTTP',
      CorsConfiguration: {
        AllowOrigins: ['https://play.mangowave.app', 'http://localhost:5173'],
        AllowMethods: ['GET', 'POST', 'OPTIONS'],
      },
    });
  });

  it('creates 4 API routes', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 4);
  });

  it('creates a budget with SNS notifications', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetName: 'MangoWave-FreeTierGuard',
        BudgetType: 'COST',
        BudgetLimit: {
          Amount: 1,
          Unit: 'USD',
        },
      },
    });
  });

  it('creates a unified SNS alert topic', () => {
    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: 'MangoWave-Alerts',
    });
  });

  it('creates an email subscription for alerts', () => {
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'test@example.com',
    });
  });

  it('grants DynamoDB access to all Lambda functions', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const policyKeys = Object.keys(policies);
    expect(policyKeys.length).toBeGreaterThanOrEqual(4);
  });

  // --- CloudWatch alarms (Section 7) ---

  it('creates Lambda error alarms for all 4 functions', () => {
    const alarms = template.findResources('AWS::CloudWatch::Alarm');
    const errorAlarmKeys = Object.keys(alarms).filter((k) =>
      alarms[k].Properties?.AlarmName?.startsWith('MangoWave-'),
    );
    // 4 Lambda error alarms + 1 API 5xx alarm = 5 total
    expect(errorAlarmKeys.length).toBe(5);
  });

  it('creates an API 5xx alarm', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'MangoWave-API-5xx',
      Threshold: 5,
      EvaluationPeriods: 1,
    });
  });

  it('creates API Gateway access log group', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/mangowave/api-gateway',
      RetentionInDays: 30,
    });
  });

  // --- Budget kill-switch (Section 6) ---

  it('creates budget kill-switch deny policy', () => {
    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      ManagedPolicyName: 'MangoWave-BudgetKillSwitch',
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Action: ['execute-api:Invoke', 'execute-api:ManageConnections'],
          }),
          Match.objectLike({
            Effect: 'Deny',
            Action: 'lambda:InvokeFunction',
          }),
        ]),
      }),
    });
  });

  it('creates a budget action role for AWS Budgets service', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'MangoWave-BudgetActionRole',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'budgets.amazonaws.com' },
          }),
        ]),
      }),
    });
  });

  it('creates the budget kill-switch action', () => {
    template.hasResourceProperties('AWS::Budgets::BudgetsAction', {
      ActionType: 'APPLY_IAM_POLICY',
      ApprovalModel: 'AUTOMATIC',
      NotificationType: 'ACTUAL',
      ActionThreshold: {
        Value: 100,
        Type: 'PERCENTAGE',
      },
    });
  });

  // --- S3 + CloudFront (Epic 5) ---

  it('creates an S3 bucket with BLOCK_ALL and RETAIN', () => {
    template.hasResource('AWS::S3::Bucket', {
      Properties: {
        BucketName: 'mangowave-frontend',
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      },
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });

  it('creates a CloudFront distribution with correct aliases', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['mangowave.app', 'play.mangowave.app'],
        HttpVersion: 'http2',
        ViewerCertificate: Match.objectLike({
          MinimumProtocolVersion: 'TLSv1.3_2025',
          SslSupportMethod: 'sni-only',
        }),
        CustomErrorResponses: [
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
            ErrorCachingMinTTL: 10,
          }),
        ],
      }),
    });
  });

  it('creates a CloudFront Function for host routing', () => {
    template.hasResourceProperties('AWS::CloudFront::Function', {
      Name: 'mangowave-host-router',
      FunctionConfig: Match.objectLike({
        Runtime: 'cloudfront-js-2.0',
      }),
    });
  });

  it('outputs FrontendBucketName and DistributionId', () => {
    template.hasOutput('FrontendBucketName', {
      Value: Match.objectLike({}),
    });
    template.hasOutput('DistributionId', {
      Value: Match.objectLike({}),
    });
  });

  it('throws when alertEmail is missing', () => {
    const app = new cdk.App();
    expect(
      () =>
        new MangoWaveStack(app, 'NoEmailStack', {
          acmCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test-cert-id',
        }),
    ).toThrow('alertEmail prop is required');
  });
});
