import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

interface MangoWaveStackProps extends cdk.StackProps {
  alertEmail?: string;
  corsAllowOrigins?: string[];
}

export class MangoWaveStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: MangoWaveStackProps) {
    super(scope, id, props);

    // ─── DynamoDB (single-table design) ───────────────────────────
    const table = new dynamodb.Table(this, 'MangoWaveData', {
      tableName: 'MangoWave_Data',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─── SSM parameters for Spotify credentials ────────────────
    // Create these SecureString params before deploying:
    //   aws ssm put-parameter --name /mangowave/spotify/client-id --type SecureString --value <id>
    //   aws ssm put-parameter --name /mangowave/spotify/client-secret --type SecureString --value <secret>
    //   aws ssm put-parameter --name /mangowave/spotify/redirect-uri --type SecureString --value <uri>
    const ssmPrefix = '/mangowave/spotify';

    // ─── Shared Lambda environment ────────────────────────────────
    const handlersDir = path.join(__dirname, '../../packages/backend/src/handlers');

    const sharedEnv: Record<string, string> = {
      TABLE_NAME: table.tableName,
      NODE_OPTIONS: '--enable-source-maps',
    };

    const authEnv: Record<string, string> = {
      ...sharedEnv,
      SSM_SPOTIFY_CLIENT_ID: `${ssmPrefix}/client-id`,
      SSM_SPOTIFY_CLIENT_SECRET: `${ssmPrefix}/client-secret`,
      SSM_SPOTIFY_REDIRECT_URI: `${ssmPrefix}/redirect-uri`,
    };

    const sharedLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      reservedConcurrentExecutions: 5,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
      },
    };

    // ─── Lambda functions ─────────────────────────────────────────
    const authCallbackFn = new NodejsFunction(this, 'AuthCallbackFn', {
      ...sharedLambdaProps,
      environment: authEnv,
      entry: path.join(handlersDir, 'auth-callback.ts'),
      handler: 'handler',
    });

    const authRefreshFn = new NodejsFunction(this, 'AuthRefreshFn', {
      ...sharedLambdaProps,
      environment: authEnv,
      entry: path.join(handlersDir, 'auth-refresh.ts'),
      handler: 'handler',
    });

    const settingsSaveFn = new NodejsFunction(this, 'SettingsSaveFn', {
      ...sharedLambdaProps,
      environment: sharedEnv,
      entry: path.join(handlersDir, 'settings-save.ts'),
      handler: 'handler',
    });

    const settingsLoadFn = new NodejsFunction(this, 'SettingsLoadFn', {
      ...sharedLambdaProps,
      environment: sharedEnv,
      entry: path.join(handlersDir, 'settings-load.ts'),
      handler: 'handler',
    });

    // Grant DynamoDB access to all functions
    table.grantReadWriteData(authCallbackFn);
    table.grantReadWriteData(authRefreshFn);
    table.grantReadWriteData(settingsSaveFn);
    table.grantReadData(settingsLoadFn);

    // Grant SSM read access for Spotify secrets (auth Lambdas only)
    const ssmArn = this.formatArn({
      service: 'ssm',
      resource: 'parameter',
      resourceName: 'mangowave/spotify/*',
    });
    const ssmPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [ssmArn],
    });
    authCallbackFn.addToRolePolicy(ssmPolicy);
    authRefreshFn.addToRolePolicy(ssmPolicy);

    // ─── HTTP API Gateway ─────────────────────────────────────────
    const corsOrigins = props?.corsAllowOrigins ?? [
      'https://play.mangowave.app',
      'http://localhost:5173',
    ];

    const httpApi = new apigwv2.HttpApi(this, 'MangoWaveApi', {
      apiName: 'MangoWave-API',
      corsPreflight: {
        allowOrigins: corsOrigins,
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Stage throttle — prevents burst abuse
    const defaultStage = httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingBurstLimit: 20,
      throttlingRateLimit: 10,
    };

    // Routes
    httpApi.addRoutes({
      path: '/auth/callback',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('AuthCallbackInt', authCallbackFn),
    });

    httpApi.addRoutes({
      path: '/auth/refresh',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('AuthRefreshInt', authRefreshFn),
    });

    httpApi.addRoutes({
      path: '/settings/save',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('SettingsSaveInt', settingsSaveFn),
    });

    httpApi.addRoutes({
      path: '/settings/load',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('SettingsLoadInt', settingsLoadFn),
    });

    // ─── Budget alarm (cost guard) ───────────────────────────────
    const alertEmail = props?.alertEmail ?? 'PLACEHOLDER@example.com';

    const budgetTopic = new sns.Topic(this, 'BudgetAlertTopic', {
      topicName: 'MangoWave-BudgetAlert',
    });
    budgetTopic.addSubscription(new snsSubscriptions.EmailSubscription(alertEmail));

    new budgets.CfnBudget(this, 'FreeTierBudget', {
      budget: {
        budgetName: 'MangoWave-FreeTierGuard',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: 1,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            comparisonOperator: 'GREATER_THAN',
            threshold: 50,
            thresholdType: 'PERCENTAGE',
            notificationType: 'ACTUAL',
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: budgetTopic.topicArn,
            },
          ],
        },
        {
          notification: {
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
            notificationType: 'ACTUAL',
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: budgetTopic.topicArn,
            },
          ],
        },
      ],
    });

    // ─── Outputs ──────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB table name',
    });
  }
}
