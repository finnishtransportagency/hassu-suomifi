import { Construct } from "constructs";
import { CfnOutput, Stage, StageProps, Tags } from "aws-cdk-lib";
import { CdkpipelinesSuomifiStack } from "./cdkpipelines-suomifi-stack";
import { BuildKeyCloudImageStack } from "./cdkpipelines-buildkeycloakimage-stack";

/**
 * Deployable unit of web service app
 */
export class CdkpipelinesSuomifiStage extends Stage {
  public readonly dbAddress: CfnOutput;

  constructor(scope: Construct, id: string, props?: StageProps) {
    super(scope, id, props);

    const cdkpipelinesSuomifiStack = new CdkpipelinesSuomifiStack(this, "SuomifiService");
    Tags.of(cdkpipelinesSuomifiStack).add("project", "hassu");

    const buildKeyCloudImageStack = new BuildKeyCloudImageStack(this, "BuildKeycloakImage");
    Tags.of(buildKeyCloudImageStack).add("project", "hassu");

    // Expose CdkpipelinesSuomifiStack's output one level higher
    this.dbAddress = cdkpipelinesSuomifiStack.dbAddress;
  }
}
