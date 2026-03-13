#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { MangoWaveStack } from '../lib/mangowave-stack';

const app = new cdk.App();

// Pass config via CDK context: cdk deploy -c alertEmail=you@example.com
new MangoWaveStack(app, 'MangoWaveStack', {
  alertEmail: app.node.tryGetContext('alertEmail'),
  acmCertArn: app.node.tryGetContext('acmCertArn'),
  webAclArn: app.node.tryGetContext('webAclArn'),
});
