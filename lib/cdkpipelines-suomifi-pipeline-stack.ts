import { Construct } from "constructs";
import { SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { CodePipeline, CodePipelineSource, ShellStep, ManualApprovalStep } from "aws-cdk-lib/pipelines";
import { CdkpipelinesSuomifiStage } from "./cdkpipelines-suomifi-stage";
import { GitHubTrigger } from "aws-cdk-lib/aws-codepipeline-actions";

/**
 * The stack that defines the application pipeline
 */
export class CdkpipelinesSuomifiPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps, environment: string) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, "Pipeline", {
      // The pipeline name
      pipelineName: "HassuSuomifiPipeline",

      // How it will be built and synthesized
      synth: new ShellStep("Synth", {
        env: {
          ENVIRONMENT: environment,
        },
        // Where the source can be found
        input: CodePipelineSource.gitHub("finnishtransportagency/hassu-suomifi", "main", {
          authentication: SecretValue.secretsManager("github-token"),
          trigger: environment === "dev" ? GitHubTrigger.WEBHOOK : GitHubTrigger.NONE,
        }),

        commands: ["npm ci", "npm run build", "npm run cdk synth"],
        primaryOutputDirectory: "cdk.out",
      }),
    });

    // create options where prod env will have manual approval pre step
    const manualApprovalOptions =
      environment === "dev"
        ? {}
        : {
            pre: [new ManualApprovalStep("DeployToProd")],
          };

    // This is where we add the application stages
    pipeline.addStage(
      new CdkpipelinesSuomifiStage(
        this,
        environment === "dev" ? "Dev" : "Prod",
        {
          env: {
            account: process.env.CDK_DEFAULT_ACCOUNT,
            region: process.env.CDK_DEFAULT_REGION,
          },
        },
        environment
      ),
      manualApprovalOptions
    );
  }
}
