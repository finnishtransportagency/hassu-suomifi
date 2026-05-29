import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

export class FeatureBuildStack extends Stack {
  constructor(scope: Construct, id: string, environment: string, props?: StackProps) {
    super(scope, id, props);

    const project = new codebuild.Project(this, "FeatureBuild", {
      projectName: "Hassu-suomifi-build-feature",
      description: "Feature build for PRs - runs build, test and synth",
      source: codebuild.Source.gitHub({
        owner: "finnishtransportagency",
        repo: "hassu-suomifi",
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(
            codebuild.EventAction.PULL_REQUEST_CREATED,
            codebuild.EventAction.PULL_REQUEST_UPDATED,
            codebuild.EventAction.PULL_REQUEST_REOPENED
          ),
        ],
        reportBuildStatus: true,
        cloneDepth: 0,
      }),
      cache: codebuild.Cache.local(
        codebuild.LocalCacheMode.SOURCE,
        codebuild.LocalCacheMode.DOCKER_LAYER
      ),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          install: {
            "runtime-versions": { nodejs: "22" },
            commands: ["npm ci"],
          },
          build: {
            commands: [
              "npm run build",
              "npm test",
              `ENVIRONMENT=${environment} npx cdk synth`,
              "docker build docker/keycloak",
            ],
          },
        },
      }),
    });

    project.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["sts:GetCallerIdentity", "ssm:GetParameter"],
        resources: ["*"],
      })
    );

    project.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["codeconnections:GetConnectionToken", "codeconnections:GetConnection"],
        resources: [StringParameter.valueForStringParameter(this, "/outputs/GitHubConnectionArn")],
      })
    );
  }
}
