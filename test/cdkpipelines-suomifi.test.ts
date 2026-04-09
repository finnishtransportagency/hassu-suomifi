import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CdkpipelinesSuomifiStack } from '../lib/cdkpipelines-suomifi-stack';

test('Stack creates successfully', () => {
    const app = new cdk.App();
    const stack = new CdkpipelinesSuomifiStack(app, 'MyTestStack', 'dev', {
        env: { account: '123456789012', region: 'eu-west-1' },
    });
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::ECS::Service', 1);
});
