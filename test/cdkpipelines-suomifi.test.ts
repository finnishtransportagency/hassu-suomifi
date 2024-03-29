import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from 'aws-cdk-lib';
import * as CdkpipelinesSuomifi from '../lib/cdkpipelines-suomifi-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new CdkpipelinesSuomifi.CdkpipelinesSuomifiStack(app, 'MyTestStack', "dev");
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
