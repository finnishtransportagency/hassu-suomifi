#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkpipelinesSuomifiPipelineStack } from '../lib/cdkpipelines-suomifi-pipeline-stack';

const validEnvironments = ["dev", "prod"];
const environment = process.env.ENVIRONMENT;
if (!environment) {
  throw new Error("Environment variable ENVIRONMENT missing");
} else if (validEnvironments.indexOf(environment) === -1) {
  throw new Error(`Environment ${environment} not supported. Valid environments: ${validEnvironments.join(" ")}`);
}
const app = new cdk.App();
new CdkpipelinesSuomifiPipelineStack(app, 'CdkpipelinesSuomifiPipelineStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  //env: { account: '123456789', region: 'eu-west-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
}, environment);
