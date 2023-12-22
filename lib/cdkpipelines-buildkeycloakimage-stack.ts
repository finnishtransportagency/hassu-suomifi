import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { ComputeType, LocalCacheMode } from "aws-cdk-lib/aws-codebuild";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

export class BuildKeyCloudImageStack extends Stack {
  constructor(scope: Construct, id: string, environment: string, props?: StackProps) {
    super(scope, id, props);

    // CodeBuild project that builds the docker image
    const buildProject = new codebuild.Project(this, "BuildProject", {
      projectName: "keycloak-image-build",
      description: "Builds the keycloak docker image",
      source: codebuild.Source.gitHub({
        owner: "finnishtransportagency",
        repo: "hassu-suomifi",
        webhook: false,
        cloneDepth: 0,
        branchOrRef: "main",
      }),
      cache: codebuild.Cache.local(
        LocalCacheMode.SOURCE,
        LocalCacheMode.DOCKER_LAYER
      ),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
        computeType: ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          install: {
            commands: [
              // get build hash as a variable
              "export GIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)",
              // get AWS account id as a variable
              "export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)",
              "aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com",
              "cd docker/keycloak",
              "docker build -t hassu-keycloak-repo:$GIT_HASH .",
              "export REPO_URI=$AWS_ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com/hassu-keycloak-repo:$GIT_HASH",
              "docker tag hassu-keycloak-repo:$GIT_HASH $REPO_URI",
              "docker push $REPO_URI",
              // Set GIT_HASH as ssm parameter
              `aws ssm put-parameter --name /${environment}/keycloak/imagehash --value $GIT_HASH --type String --overwrite`,
            ],
          },
        },
      }),
    });
    buildProject.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ecr:*", "ssm:*"],
        resources: ["*"],
      })
    );
  }
}
