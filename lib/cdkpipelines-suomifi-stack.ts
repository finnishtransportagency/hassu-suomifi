import * as loadbalance from '@aws-cdk/aws-elasticloadbalancingv2';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ssm from '@aws-cdk/aws-ssm';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecr from '@aws-cdk/aws-ecr';
import * as logs from '@aws-cdk/aws-logs';
import * as rds from '@aws-cdk/aws-rds';
import { CfnOutput, Construct, Stack, StackProps, SecretValue, Duration, Fn } from '@aws-cdk/core';
import * as servicediscovery from '@aws-cdk/aws-servicediscovery';
import { WafConfig } from './waf2Config';
import { Repository } from '@aws-cdk/aws-ecr';

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

    // attach waf to lb
    new WafConfig(this, "Hassu-WAF", {
      resource: alb,
      allowedAddresses: Fn.split("\n", ssm.StringParameter.fromStringParameterAttributes(this, 'allowed-ip-ssm-parameter', {
        parameterName: '/dev/WAFAllowedAddresses'
      }).stringValue),
    });

    // 3. RDS
    const rdsinstance = new rds.DatabaseCluster(this, 'db', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({version: rds.AuroraPostgresEngineVersion.VER_13_3}),
      credentials: rds.Credentials.fromPassword('postgres', SecretValue.ssmSecure('/dev/keycloak/postgresPassword', '1')),
      instanceProps: {
        // optional , defaults to t3.medium
        // instanceType: ec2.InstanceType.of(...),
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE
        }
      }
    });

    new ssm.StringParameter(this, "DbAddressParameter", {
      parameterName: "/dev/keycloak/dbAddress",
      description: "Description for your parameter",
      stringValue: rdsinstance.clusterEndpoint.hostname
    });

    // 5. AppMesh

    // 6. CloudMap

    const cloudMapNamespace = new servicediscovery.PrivateDnsNamespace(this, 'Namespace', {
      name: 'devsuomifi.local',
      vpc,
    });

    const suomifiservice = cloudMapNamespace.createService('Service', {
      dnsRecordType: servicediscovery.DnsRecordType.A_AAAA,
      dnsTtl: Duration.seconds(30)
    });    

    // 4. ECS Cluster, Service, Task, Container, LogGroup
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

    const keycloakDbAddressParam = ssm.StringParameter.fromStringParameterAttributes(this, 'KeycloakDbAddressParam', {
      parameterName: '/dev/keycloak/dbAddress',
      version: 1
    });

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/hassu-suomifi',
      retention: logs.RetentionDays.TWO_WEEKS
    });
    
    //TODO: add repo creation and maybe keycloak docker image build in the cdk?
    const repository = Repository.fromRepositoryName(this, 'KeycloakRepo', 'hassu-keycloak-repo');
    const container = taskDefinition.addContainer('KeycloakContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository),
      environment: {
        ENV: 'dev',
        KEYCLOAK_FRONTEND_URL: 'hassudev.testivaylapilvi.fi',
        DB_VENDOR: 'postgres',
        DB_PORT: '5432',
        DB_DATABASE: 'keycloak',
        JGROUPS_DISCOVERY_PROTOCOL: 'dns.DNS_PING',
        JGROUPS_DISCOVERY_PROPERTIES: 'dns_query=devsuomifi.local',
        //KEYCLOAK_IMPORT: '/opt/jboss/keycloak/standalone/tmp/suomifi-realm-export.json'
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

    service.associateCloudMapService({
      service: suomifiservice
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


    // Outputs
    this.dbAddress = new CfnOutput(this, 'DatabaseURL', {
      value: rdsinstance.clusterEndpoint.hostname,
      description: 'Host name of the postgres instance for keycloak',
      exportName: 'dbAddress'
    })
  }
}