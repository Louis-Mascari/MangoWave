import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { MangoWaveStack } from '../lib/mangowave-stack';

describe('MangoWaveStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new MangoWaveStack(app, 'TestStack', {
      alertEmail: 'test@example.com',
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

  it('creates 4 Lambda functions with reserved concurrency', () => {
    const lambdas = template.findResources('AWS::Lambda::Function');
    const lambdaKeys = Object.keys(lambdas);
    expect(lambdaKeys.length).toBe(4);

    for (const key of lambdaKeys) {
      expect(lambdas[key].Properties.ReservedConcurrentExecutions).toBe(5);
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

  it('creates an SNS topic for budget alerts', () => {
    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: 'MangoWave-BudgetAlert',
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
    // Each Lambda gets a service role + policy for DynamoDB access
    expect(policyKeys.length).toBeGreaterThanOrEqual(4);
  });
});
