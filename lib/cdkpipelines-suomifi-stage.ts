import { CfnOutput, Construct, Stage, StageProps, Tags } from '@aws-cdk/core';
import { CdkpipelinesSuomifiStack } from './cdkpipelines-suomifi-stack';

/**
 * Deployable unit of web service app
 */
export class CdkpipelinesSuomifiStage extends Stage {
  public readonly dbAddress: CfnOutput;
  
  constructor(scope: Construct, id: string, props?: StageProps) {
    super(scope, id, props);

    const service = new CdkpipelinesSuomifiStack(this, 'SuomifiService');
    Tags.of(service).add('project', 'hassu');
    
    // Expose CdkpipelinesSuomifiStack's output one level higher
    this.dbAddress = service.dbAddress;
  }
}