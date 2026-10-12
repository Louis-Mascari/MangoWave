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

  interface BudgetNotification {
    Notification: { Threshold: number; NotificationType: string };
    Subscribers: unknown[];
  }

  const findId = (type: string, prefix: string): string => {
    const ids = Object.keys(template.findResources(type)).filter((k) => k.startsWith(prefix));
    expect(ids).toHaveLength(1);
    return ids[0];
  };
  const killSwitchFnId = () => findId('AWS::Lambda::Function', 'BudgetKillSwitchFn');
  const killSwitchTopicId = () => findId('AWS::SNS::Topic', 'BudgetKillSwitchTopic');
  const alertTopicId = () => findId('AWS::SNS::Topic', 'AlertTopic');
  const apiFnIds = () =>
    ['AuthCallbackFn', 'AuthRefreshFn', 'SettingsSaveFn', 'SettingsLoadFn'].map((prefix) =>
      findId('AWS::Lambda::Function', prefix),
    );

  // Statement AWS Budgets requires on any topic it notifies
  const budgetsPublishStatement = (topicId: string) =>
    Match.objectLike({
      Effect: 'Allow',
      Principal: { Service: 'budgets.amazonaws.com' },
      Action: 'SNS:Publish',
      Resource: { Ref: topicId },
      Condition: Match.objectLike({
        StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } },
      }),
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

  it('creates 5 Lambda functions with correct config', () => {
    // 4 API handlers + the budget kill-switch
    const lambdas = template.findResources('AWS::Lambda::Function');
    const lambdaKeys = Object.keys(lambdas);
    expect(lambdaKeys.length).toBe(5);

    for (const key of lambdaKeys) {
      expect(lambdas[key].Properties.MemorySize).toBe(128);
      expect(lambdas[key].Properties.Runtime).toBe('nodejs24.x');
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

  it('creates 4 API routes, none of them to the kill-switch', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 4);
    template.resourceCountIs('AWS::ApiGatewayV2::Integration', 4);

    const integrations = JSON.stringify(template.findResources('AWS::ApiGatewayV2::Integration'));
    expect(integrations).not.toContain(killSwitchFnId());
  });

  it('creates a budget with SNS notifications', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetName: 'MangoWave-CostGuard',
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

  it('grants DynamoDB access to the 4 API functions only', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const withDynamo = Object.keys(policies).filter((k) =>
      JSON.stringify(policies[k].Properties.PolicyDocument).includes('dynamodb:'),
    );
    expect(withDynamo.length).toBe(4);
  });

  // --- CloudWatch alarms (Section 7) ---

  it('creates Lambda error alarms for the 4 API functions', () => {
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

  it('no longer applies an IAM deny policy through a budget action', () => {
    template.resourceCountIs('AWS::Budgets::BudgetsAction', 0);
    template.resourceCountIs('AWS::IAM::ManagedPolicy', 0);

    const roles = JSON.stringify(template.findResources('AWS::IAM::Role'));
    expect(roles).not.toContain('budgets.amazonaws.com');
  });

  it('creates the kill-switch function with the API function names', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          API_FUNCTION_NAMES: {
            'Fn::Join': [
              '',
              apiFnIds().flatMap((id, i) => (i ? [',', { Ref: id }] : [{ Ref: id }])),
            ],
          },
        }),
      },
    });
    expect(apiFnIds()).not.toContain(killSwitchFnId());
  });

  it('limits the kill-switch role to PutFunctionConcurrency on the 4 API functions', () => {
    const policies = template.findResources('AWS::IAM::Policy', {
      Properties: { Roles: [{ Ref: Match.stringLikeRegexp('^BudgetKillSwitchFnServiceRole') }] },
    });
    const [policy, ...rest] = Object.values(policies);
    expect(rest).toHaveLength(0);

    expect(policy.Properties.PolicyDocument.Statement).toEqual([
      {
        Effect: 'Allow',
        Action: 'lambda:PutFunctionConcurrency',
        Resource: apiFnIds().map((id) => ({ 'Fn::GetAtt': [id, 'Arn'] })),
      },
    ]);
  });

  it('lets AWS Budgets publish to the kill-switch topic', () => {
    template.hasResourceProperties('AWS::SNS::TopicPolicy', {
      Topics: [{ Ref: killSwitchTopicId() }],
      PolicyDocument: {
        Statement: [budgetsPublishStatement(killSwitchTopicId())],
      },
    });
  });

  it('subscribes the kill-switch function to the kill-switch topic', () => {
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'lambda',
      TopicArn: { Ref: killSwitchTopicId() },
      Endpoint: { 'Fn::GetAtt': [killSwitchFnId(), 'Arn'] },
    });
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'sns.amazonaws.com',
      FunctionName: { 'Fn::GetAtt': [killSwitchFnId(), 'Arn'] },
      SourceArn: { Ref: killSwitchTopicId() },
    });
  });

  it('lets Budgets, CloudWatch alarms and the account owner publish to the alert topic', () => {
    template.hasResourceProperties('AWS::SNS::TopicPolicy', {
      Topics: [{ Ref: alertTopicId() }],
      PolicyDocument: {
        Statement: [
          Match.objectLike({
            Effect: 'Allow',
            Principal: { AWS: '*' },
            Action: Match.arrayWith(['SNS:Subscribe', 'SNS:Publish']),
            Condition: { StringEquals: { 'AWS:SourceOwner': { Ref: 'AWS::AccountId' } } },
          }),
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'cloudwatch.amazonaws.com' },
            Action: 'SNS:Publish',
            Resource: { Ref: alertTopicId() },
            Condition: Match.objectLike({
              StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } },
            }),
          }),
          budgetsPublishStatement(alertTopicId()),
        ],
      },
    });
  });

  it('routes the 100% ACTUAL notification to the kill-switch topic and the alert email', () => {
    const [budget] = Object.values(template.findResources('AWS::Budgets::Budget'));
    const notifications: BudgetNotification[] = budget.Properties.NotificationsWithSubscribers;

    const at = (threshold: number) =>
      notifications.filter(
        (n) =>
          n.Notification.Threshold === threshold && n.Notification.NotificationType === 'ACTUAL',
      );

    expect(at(100)).toHaveLength(1);
    expect(at(100)[0].Subscribers).toEqual([
      { SubscriptionType: 'SNS', Address: { Ref: killSwitchTopicId() } },
      { SubscriptionType: 'EMAIL', Address: 'test@example.com' },
    ]);

    // Only the 100% notification may trip the kill-switch
    expect(at(50)).toHaveLength(1);
    expect(at(50)[0].Subscribers).toEqual([
      { SubscriptionType: 'SNS', Address: { Ref: alertTopicId() } },
    ]);
  });

  it('creates the budget only after both topic policies exist', () => {
    const [budget] = Object.values(template.findResources('AWS::Budgets::Budget'));
    const topicPolicies = Object.keys(template.findResources('AWS::SNS::TopicPolicy'));

    expect(topicPolicies).toHaveLength(2);
    expect(budget.DependsOn).toEqual(expect.arrayContaining(topicPolicies));
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

  it('attaches the managed security headers policy to the default behavior', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          // Managed-SecurityHeadersPolicy
          ResponseHeadersPolicyId: '67f7725c-6f97-4210-82d7-5512b31e9d03',
        }),
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
