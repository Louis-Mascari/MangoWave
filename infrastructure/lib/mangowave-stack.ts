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
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as fs from 'fs';
import * as path from 'path';

interface MangoWaveStackProps extends cdk.StackProps {
  alertEmail?: string;
  corsAllowOrigins?: string[];
  acmCertArn: string;
  webAclArn?: string;
  domainNames?: string[];
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
      timeToLiveAttribute: 'ttl',
    });

    // ─── S3 bucket (frontend assets) ──────────────────────────
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: 'mangowave-frontend',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─── CloudFront ─────────────────────────────────────────────
    const hostRouterFn = new cloudfront.Function(this, 'HostRouterFunction', {
      functionName: 'mangowave-host-router',
      code: cloudfront.FunctionCode.fromInline(
        fs.readFileSync(path.join(__dirname, 'cloudfront-functions/host-router.js'), 'utf-8'),
      ),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const certificate = acm.Certificate.fromCertificateArn(this, 'SiteCert', props!.acmCertArn);
    const domainNames = props!.domainNames ?? ['mangowave.app', 'play.mangowave.app'];

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: hostRouterFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // HSTS, nosniff, X-Frame-Options: SAMEORIGIN, strict referrer policy
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      domainNames,
      certificate,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(10),
        },
      ],
      httpVersion: cloudfront.HttpVersion.HTTP2,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_3_2025,
      webAclId: props!.webAclArn,
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
      runtime: lambda.Runtime.NODEJS_24_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
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
    // authRefreshFn reads sessions, updates tokens, and deletes sessions whose
    // refresh token Spotify has rejected as expired/revoked — no PutItem needed
    authRefreshFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem'],
        resources: [table.tableArn],
      }),
    );
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
    const alertEmail = props?.alertEmail;
    if (!alertEmail) {
      throw new Error('alertEmail prop is required — pass it in MangoWaveStack props');
    }

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

    // ─── Alert topic access policy ────────────────────────────────
    // Attaching any statement replaces SNS's implicit default policy, which is
    // what lets same-account CloudWatch alarms publish today. So the default
    // owner statement is restated here alongside explicit service grants.
    const sourceAccount = { 'aws:SourceAccount': this.account };
    const budgetsPrincipal = new iam.ServicePrincipal('budgets.amazonaws.com');
    const budgetsSourceArn = {
      'aws:SourceArn': this.formatArn({ service: 'budgets', region: '', resource: '*' }),
    };

    alertTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'DefaultOwnerAccess',
        principals: [new iam.AnyPrincipal()],
        actions: [
          'SNS:GetTopicAttributes',
          'SNS:SetTopicAttributes',
          'SNS:AddPermission',
          'SNS:RemovePermission',
          'SNS:DeleteTopic',
          'SNS:Subscribe',
          'SNS:ListSubscriptionsByTopic',
          'SNS:Publish',
        ],
        resources: [alertTopic.topicArn],
        conditions: { StringEquals: { 'AWS:SourceOwner': this.account } },
      }),
    );
    alertTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudWatchAlarmsPublish',
        principals: [new iam.ServicePrincipal('cloudwatch.amazonaws.com')],
        actions: ['SNS:Publish'],
        resources: [alertTopic.topicArn],
        conditions: {
          StringEquals: sourceAccount,
          ArnLike: {
            'aws:SourceArn': this.formatArn({
              service: 'cloudwatch',
              resource: 'alarm',
              resourceName: '*',
              arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
            }),
          },
        },
      }),
    );
    // AWS Budgets cannot deliver to a topic without an explicit grant
    const alertTopicPolicy = alertTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowBudgetsPublish',
        principals: [budgetsPrincipal],
        actions: ['SNS:Publish'],
        resources: [alertTopic.topicArn],
        conditions: { StringEquals: sourceAccount, ArnLike: budgetsSourceArn },
      }),
    );

    // ─── Budget kill-switch (cost guard) ──────────────────────────
    // API Gateway invokes Lambda through resource-based permissions, so denying
    // actions on the execution roles stops nothing. Instead, a breached budget
    // notifies a dedicated topic whose subscriber reserves zero concurrency on
    // every API function — invocations are throttled until it is removed.
    const killSwitchTopic = new sns.Topic(this, 'BudgetKillSwitchTopic', {
      topicName: 'MangoWave-BudgetKillSwitch',
    });
    const killSwitchTopicPolicy = killSwitchTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowBudgetsPublish',
        principals: [budgetsPrincipal],
        actions: ['SNS:Publish'],
        resources: [killSwitchTopic.topicArn],
        conditions: { StringEquals: sourceAccount, ArnLike: budgetsSourceArn },
      }),
    );

    const killSwitchFn = new NodejsFunction(this, 'BudgetKillSwitchFn', {
      ...sharedLambdaProps,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        API_FUNCTION_NAMES: lambdaFunctions.map(({ fn }) => fn.functionName).join(','),
      },
      entry: path.join(handlersDir, 'budget-kill-switch.ts'),
      handler: 'handler',
    });
    killSwitchFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['lambda:PutFunctionConcurrency'],
        resources: lambdaFunctions.map(({ fn }) => fn.functionArn),
      }),
    );
    killSwitchTopic.addSubscription(new snsSubscriptions.LambdaSubscription(killSwitchFn));

    // ─── Budget alarm ─────────────────────────────────────────────
    // Changing notifications or subscribers makes CloudFormation replace the
    // budget, which fails while the name stays the same — rename it when you do.
    const budget = new budgets.CfnBudget(this, 'FreeTierBudget', {
      budget: {
        budgetName: 'MangoWave-CostGuard',
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
          // A notification takes a single SNS subscriber, so the kill-switch
          // topic gets it and the alert email is subscribed directly
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: killSwitchTopic.topicArn,
            },
            {
              subscriptionType: 'EMAIL',
              address: alertEmail,
            },
          ],
        },
      ],
    });
    // Budgets must already be allowed to publish when the budget is created
    for (const { policyDependable } of [alertTopicPolicy, killSwitchTopicPolicy]) {
      if (policyDependable) {
        budget.node.addDependency(policyDependable);
      }
    }

    // ─── Outputs ──────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket for frontend assets',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });
  }
}
