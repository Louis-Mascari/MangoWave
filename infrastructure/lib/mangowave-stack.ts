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
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
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

    // ─── API Gateway Access Logging (CloudWatch) ──────────────────
    const apiLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: '/mangowave/api-gateway',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    defaultStage.accessLogSettings = {
      destinationArn: apiLogGroup.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        ip: '$context.identity.sourceIp',
        method: '$context.httpMethod',
        path: '$context.path',
        status: '$context.status',
        responseLength: '$context.responseLength',
        latency: '$context.responseLatency',
        errorMessage: '$context.error.message',
      }),
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

    // ─── CloudWatch: Lambda error alarms ──────────────────────────
    const alertEmail = props?.alertEmail ?? 'PLACEHOLDER@example.com';

    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'MangoWave-Alerts',
    });
    alertTopic.addSubscription(new snsSubscriptions.EmailSubscription(alertEmail));

    const lambdaFunctions = [
      { name: 'AuthCallback', fn: authCallbackFn },
      { name: 'AuthRefresh', fn: authRefreshFn },
      { name: 'SettingsSave', fn: settingsSaveFn },
      { name: 'SettingsLoad', fn: settingsLoadFn },
    ];

    for (const { name, fn } of lambdaFunctions) {
      const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName: `MangoWave-${name}-Errors`,
        metric: fn.metricErrors({ period: cdk.Duration.minutes(5) }),
        threshold: 3,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    }

    // API Gateway 4xx/5xx throttle alarm (monitors access logs)
    const throttleMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5xx',
      dimensionsMap: { ApiId: httpApi.httpApiId },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const apiErrorAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: 'MangoWave-API-5xx',
      metric: throttleMetric,
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    apiErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // ─── Budget alarm + kill-switch (cost guard) ──────────────────
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
              address: alertTopic.topicArn,
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
              address: alertTopic.topicArn,
            },
          ],
        },
      ],
    });

    // Budget kill-switch: IAM policy that denies API Gateway + Lambda invoke
    // Applied via budget action when spending exceeds threshold
    const killSwitchPolicy = new iam.ManagedPolicy(this, 'BudgetKillSwitch', {
      managedPolicyName: 'MangoWave-BudgetKillSwitch',
      statements: [
        new iam.PolicyStatement({
          sid: 'DenyApiGatewayOnBudgetBreach',
          effect: iam.Effect.DENY,
          actions: ['execute-api:Invoke', 'execute-api:ManageConnections'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'DenyLambdaInvokeOnBudgetBreach',
          effect: iam.Effect.DENY,
          actions: ['lambda:InvokeFunction'],
          resources: ['*'],
        }),
      ],
    });

    // IAM role for AWS Budgets to apply the kill-switch policy
    const budgetActionRole = new iam.Role(this, 'BudgetActionRole', {
      roleName: 'MangoWave-BudgetActionRole',
      assumedBy: new iam.ServicePrincipal('budgets.amazonaws.com'),
      inlinePolicies: {
        AttachPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'iam:AttachGroupPolicy',
                'iam:DetachGroupPolicy',
                'iam:AttachRolePolicy',
                'iam:DetachRolePolicy',
                'iam:AttachUserPolicy',
                'iam:DetachUserPolicy',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // Budget action: automatically attach deny policy when budget is breached
    new cdk.CfnResource(this, 'BudgetKillSwitchAction', {
      type: 'AWS::Budgets::BudgetsAction',
      properties: {
        BudgetName: 'MangoWave-FreeTierGuard',
        ActionType: 'APPLY_IAM_POLICY',
        ActionThreshold: {
          Value: 100,
          Type: 'PERCENTAGE',
        },
        ApprovalModel: 'AUTOMATIC',
        ExecutionRoleArn: budgetActionRole.roleArn,
        NotificationType: 'ACTUAL',
        Definition: {
          IamActionDefinition: {
            PolicyArn: killSwitchPolicy.managedPolicyArn,
            Roles: lambdaFunctions.map(({ fn }) => {
              const role = fn.role;
              return role ? role.roleName : '';
            }),
          },
        },
        Subscribers: [
          {
            Type: 'SNS',
            Address: alertTopic.topicArn,
          },
        ],
      },
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
