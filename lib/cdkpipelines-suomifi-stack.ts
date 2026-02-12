import * as loadbalance from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Repository } from "aws-cdk-lib/aws-ecr";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";

/**
 * A stack for our simple Lambda-powered web service
 */
export class CdkpipelinesSuomifiStack extends Stack {
  /**
   * The URL of the keycloak rds, for use in the integ tests?
   */
  public readonly dbAddress: CfnOutput;

  constructor(scope: Construct, id: string, environment: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: environment === "dev" ? "vpc-0689ac0f1efc74993" : "vpc-0c13923fe7e0f1834",
    });

    // 2. ALB
    const securityGroup = new ec2.SecurityGroup(this, "SuomiFiSG", {
      vpc,
      allowAllOutbound: true,
      description: "Security group for Suomi.fi",
    });

    const alb = new loadbalance.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc,
      internetFacing: false,
      vpcSubnets: { onePerAz: true },
      http2Enabled: true,
      securityGroup,
      deletionProtection: true,
    });

    // 3. Aurora postgresql -> Aurora Serverless
    let rdsinstance;
    // keep dev instance smaller and use auto pause feature
    if (environment === "dev") {
      rdsinstance = new rds.DatabaseClusterFromSnapshot(this, "Cluster", {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_14_20,
        }),
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        writer: rds.ClusterInstance.serverlessV2("writer"),
        snapshotIdentifier: `arn:aws:rds:eu-west-1:283563576583:cluster-snapshot:keycloak-db-backup-pq-ver-14`,
        snapshotCredentials: rds.SnapshotCredentials.fromGeneratedSecret("postgres"),
        serverlessV2AutoPauseDuration: Duration.minutes(30),
        serverlessV2MinCapacity: 0,
        serverlessV2MaxCapacity: 4
      });
    } else {
      rdsinstance = new rds.DatabaseClusterFromSnapshot(this, "Cluster", {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_14_20,
        }),
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        writer: rds.ClusterInstance.serverlessV2("writer"),
        snapshotIdentifier: `arn:aws:rds:eu-west-1:385766954911:cluster-snapshot:keycloak-db-backup-pq-ver-14`,
        snapshotCredentials: rds.SnapshotCredentials.fromGeneratedSecret("postgres"),
        serverlessV2MaxCapacity: 8,
        serverlessV2MinCapacity: 1,
      });
    }

    new ssm.StringParameter(this, "DbAddressParameter", {
      parameterName: `/${environment}/keycloak/dbAddress`,
      description: "Description for your parameter",
      stringValue: rdsinstance.clusterEndpoint.hostname,
    });

    // 4. AppMesh

    // 5. CloudMap

    const cloudMapNamespace = new servicediscovery.PrivateDnsNamespace(this, "Namespace", {
      name: `${environment}suomifi.local`,
      vpc,
    });

    const suomifiservice = cloudMapNamespace.createService("Service", {
      dnsRecordType: servicediscovery.DnsRecordType.A_AAAA,
      dnsTtl: Duration.seconds(30),
    });

    // 6. ECS Cluster, Service, Task, Container, LogGroup
    const cluster = new ecs.Cluster(this, "ECSCluster", {
      vpc: vpc,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
      memoryLimitMiB: 1024,
      cpu: 512,
    });

    const keycloakUserParam = ssm.StringParameter.fromSecureStringParameterAttributes(this, "KeycloakUserParam", {
      parameterName: `/${environment}/keycloak/keycloakUser`,
      version: 1,
    });

    const keycloakPasswordParam = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      "KeycloakPasswordParam",
      {
        parameterName: `/${environment}/keycloak/keycloakPassword`,
        version: 1,
      }
    );

    const keycloakDbUserParam = ssm.StringParameter.fromSecureStringParameterAttributes(this, "KeycloakDbUserParam", {
      parameterName: `/${environment}/keycloak/dbUser`,
      version: 1,
    });

    const keycloakDbPasswordParam = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      "KeycloakDbPasswordParam",
      {
        parameterName: `/${environment}/keycloak/dbPassword`,
        version: 1,
      }
    );

    const keycloakDbAddressParam = ssm.StringParameter.fromStringParameterAttributes(this, "KeycloakDbAddressParam", {
      parameterName: `/${environment}/keycloak/dbAddress`,
      version: 1,
    });

    const logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: "/ecs/hassu-suomifi",
      retention: logs.RetentionDays.TWO_WEEKS,
    });

    const repository = Repository.fromRepositoryName(this, "KeycloakRepo", "hassu-keycloak-repo");
    taskDefinition.addContainer("KeycloakContainer", {
      image: ecs.ContainerImage.fromEcrRepository(
        repository,
        StringParameter.valueForStringParameter(this, `/${environment}/keycloak/imagehash`)
      ),
      environment: {
        ENV: `${environment}`,
        KC_HOSTNAME_STRICT: "false",
        KC_HTTP_RELATIVE_PATH: "/keycloak/auth",
        KC_DB: "postgres",
        KC_DB_URL_PORT: "5432",
        KC_DB_URL_DATABASE: "keycloak",
        KC_PROXY_HEADERS: "forwarded",
        KC_HTTP_ENABLED: "true",
        KC_HTTP_MANAGEMENT_RELATIVE_PATH: "/",
        KC_HTTP_MANAGEMENT_SCHEME: "http",
      },
      secrets: {
        KC_BOOTSTRAP_ADMIN_USERNAME: ecs.Secret.fromSsmParameter(keycloakUserParam),
        KC_BOOTSTRAP_ADMIN_PASSWORD: ecs.Secret.fromSsmParameter(keycloakPasswordParam),
        KC_DB_URL_HOST: ecs.Secret.fromSsmParameter(keycloakDbAddressParam),
        KC_DB_USERNAME: ecs.Secret.fromSsmParameter(keycloakDbUserParam),
        KC_DB_PASSWORD: ecs.Secret.fromSsmParameter(keycloakDbPasswordParam),
      },
      portMappings: [{ containerPort: 8080 }, {containerPort: 9000}],
      logging: ecs.LogDrivers.awsLogs({
        logGroup: logGroup,
        streamPrefix: "KeycloakContainer",
      }),
    });

    const ecsSecurityGroup = new ec2.SecurityGroup(this, "ECSSecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });

    ecsSecurityGroup.connections.allowTo(rdsinstance, ec2.Port.tcp(5432), "RDS connection");

    ecsSecurityGroup.addIngressRule(
      securityGroup,
      ec2.Port.tcp(9000),
      "Allow ALB health check on Keycloak management port"
    );

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      securityGroups: [securityGroup, ecsSecurityGroup],
    });

    service.associateCloudMapService({
      service: suomifiservice,
    });

    const listener = alb.addListener("Listener", { port: 80 });
    listener.addTargets("ECS", {
      priority: 10, // Must be unique among all actions and targets
      conditions: [
        loadbalance.ListenerCondition.pathPatterns(["/keycloak/*"]),
      ],
      port: 80,
      targets: [
        service.loadBalancerTarget({
          containerName: "KeycloakContainer",
          containerPort: 8080,
        }),
      ],
      healthCheck: {
        enabled: true,
        port: "9000", // Health endpoints exposed on 9000 mgmt port by default 
        path: "/health/ready",
        protocol: loadbalance.Protocol.HTTP,
        timeout: Duration.seconds(30),
        unhealthyThresholdCount: 3,
        healthyThresholdCount: 3,
        interval: Duration.seconds(60),
      },
    });

    // Default action: Return 404 for unmatched requests
    listener.addAction("DefaultAction", {
      action: loadbalance.ListenerAction.fixedResponse(404, {
        contentType: "application/json",
        messageBody: JSON.stringify({ error: "Not Found" }),
      }),
    });

    // Outputs
    this.dbAddress = new CfnOutput(this, "DatabaseURL", {
      value: rdsinstance.clusterEndpoint.hostname,
      description: "Host name of the postgres instance for keycloak",
      exportName: "dbAddress",
    });
  }
}
