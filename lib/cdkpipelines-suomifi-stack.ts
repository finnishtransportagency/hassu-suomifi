import * as apigw from '@aws-cdk/aws-apigateway';
import * as lambda from '@aws-cdk/aws-lambda';
import * as loadbalance from '@aws-cdk/aws-elasticloadbalancingv2';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ssm from '@aws-cdk/aws-ssm';
import * as ecs from '@aws-cdk/aws-ecs';
import * as logs from '@aws-cdk/aws-logs';
import * as rds from '@aws-cdk/aws-rds';
import { CfnOutput, Construct, Stack, StackProps, SecretValue } from '@aws-cdk/core';
import * as path from 'path';
import { AlarmBase } from '@aws-cdk/aws-cloudwatch';

/**
 * A stack for our simple Lambda-powered web service
 */
export class CdkpipelinesSuomifiStack extends Stack {
  /**
   * The URL of the keycloak rds, for use in the integ tests?
   */
  public readonly dbAddress: CfnOutput;
 
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 1. Get HASSU VPC
    const vpcId = ssm.StringParameter.fromStringParameterAttributes(this, 'vpc-ssm-parameter', {
      parameterName: 'HassuVpcId'
    }).stringValue
    
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: 'vpc-0689ac0f1efc74993'
    });

    // 2. ALB
    const sgId = ssm.StringParameter.fromStringParameterAttributes(this, 'sg-ssm-parameter', {
      parameterName: 'HassuSgId'
    }).stringValue;

    const securityGroup = ec2.SecurityGroup.fromLookup(this, 'HassuSG', 'sg-0b57a0a831ff31953');

    const alb = new loadbalance.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: false,
      vpcSubnets: {onePerAz: true},
      http2Enabled: true,
      securityGroup
    });
    
    // 3. ECS Cluster, Service, Task, Container, LogGroup
    const cluster = new ecs.Cluster(this, 'ECSCluster', {
      vpc: vpc
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      memoryLimitMiB: 512,
      cpu: 256
    });

    const keycloakUserParam = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'KeycloakUserParam', {
      parameterName: '/dev/keycloak/keycloakUser',
      version: 1
    });

    const keycloakPasswordParam = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'KeycloakPasswordParam', {
      parameterName: '/dev/keycloak/keycloakPassword',
      version: 1
    });

    const keycloakDbUserParam = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'KeycloakDbUserParam', {
      parameterName: '/dev/keycloak/dbUser',
      version: 1
    });

    const keycloakDbPasswordParam = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'KeycloakDbPasswordParam', {
      parameterName: '/dev/keycloak/dbPassword',
      version: 1
    });

    const keycloakDbAddressParam = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'KeycloakDbAddressParam', {
      parameterName: '/dev/keycloak/dbAddress',
      version: 1
    });

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/hassu-suomifi',
      retention: logs.RetentionDays.TWO_WEEKS
    });
    
    const container = taskDefinition.addContainer('KeycloakContainer', {
      image: ecs.ContainerImage.fromRegistry("jboss/keycloak"),
      environment: {
        ENV: 'dev',
        FOO: 'bar',
        DB_VENDOR: 'postgres',
        DB_PORT: '5432',
        DB_DATABASE: 'keycloak'
      },
      secrets: {
        KEYClOAK_USER: ecs.Secret.fromSsmParameter(keycloakUserParam),
        KEYCLOAK_PASSWORD: ecs.Secret.fromSsmParameter(keycloakPasswordParam),
        DB_ADDR: ecs.Secret.fromSsmParameter(keycloakDbAddressParam),
        DB_USER: ecs.Secret.fromSsmParameter(keycloakDbUserParam),
        DB_PASSWORD: ecs.Secret.fromSsmParameter(keycloakDbPasswordParam)
      },
      portMappings:[{ containerPort: 8080 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: '/ecs/hassu-suomifi/'
      })
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 2
    });

    const listener = alb.addListener('Listener', { port: 80});
    const targetGroup = listener.addTargets('ECS', {
      port: 80,
      targets: [service.loadBalancerTarget({
        containerName: 'KeycloakContainer',
        containerPort: 8080
      })],
      healthCheck: {
        enabled: true,
        port: '8080',
        path: '/auth/'
      }
    })

    // 3. RDS

    const rdsinstance = new rds.DatabaseInstance(this, 'Instance', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_13_3 }),
      // optional, defaults to m5.large
      // instanceType: ec2.InstanceType.of(...),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE
      },
      credentials: rds.Credentials.fromPassword('postgres', SecretValue.ssmSecure('/dev/keycloak/postgresPassword', '1'))
    });

    // 4. AppMesh

    // 5. CloudMap


    // Outputs
    this.dbAddress = new CfnOutput(this, 'DatabaseURL', {
      value: rdsinstance.instanceEndpoint.hostname,
      description: 'Host name of the postgres instance for keycloak',
      exportName: 'dbAddress'
    })
  }
}