import * as loadbalance from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Repository } from "aws-cdk-lib/aws-ecr";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";
import { WafConfig } from "./waf2Config";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as idp from "./UserpoolProviderOpenID";

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
    const vpcId = ssm.StringParameter.fromStringParameterAttributes(
      this,
      "vpc-ssm-parameter",
      {
        parameterName: "HassuVpcId",
      }
    ).stringValue;

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: "vpc-0689ac0f1efc74993",
    });

    // 2. ALB
    const securityGroup = new ec2.SecurityGroup(this, "SuomiFiSG", {
      vpc,
      allowAllOutbound: true,
      description: "Security group for Suomi.fi",
    });
    // Allow all inbound traffic to security group
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTcp(),
      "Allow all inbound traffic"
    );

    const alb = new loadbalance.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc,
      internetFacing: false,
      vpcSubnets: { onePerAz: true },
      http2Enabled: true,
      securityGroup,
    });

    // attach waf to lb
    new WafConfig(this, "Hassu-WAF", {
      resource: alb,
      allowedAddresses: Fn.split(
        "\n",
        ssm.StringParameter.fromStringParameterAttributes(
          this,
          "allowed-ip-ssm-parameter",
          {
            parameterName: "/dev/WAFAllowedAddresses",
          }
        ).stringValue
      ),
    });

    // 3. Aurora postgresql -> Aurora Serverless
    const rdsinstance = new rds.ServerlessClusterFromSnapshot(this, "Cluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_13_3,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      snapshotIdentifier:
        "arn:aws:rds:eu-west-1:283563576583:cluster-snapshot:keycloak-db-backup",
      scaling: {
        autoPause: Duration.minutes(30),
        minCapacity: rds.AuroraCapacityUnit.ACU_2,
        maxCapacity: rds.AuroraCapacityUnit.ACU_8,
      },
    });

    // new rds.DatabaseCluster(this, 'db', {
    //   engine: rds.DatabaseClusterEngine.auroraPostgres({version: rds.AuroraPostgresEngineVersion.VER_13_3}),
    //   credentials: rds.Credentials.fromPassword('postgres', SecretValue.ssmSecure('/dev/keycloak/postgresPassword', '1')),
    //   instanceProps: {
    //     // optional , defaults to t3.medium
    //     // instanceType: ec2.InstanceType.of(...),
    //     vpc,
    //     vpcSubnets: {
    //       subnetType: ec2.SubnetType.PRIVATE
    //     }
    //   }
    // });

    new ssm.StringParameter(this, "DbAddressParameter", {
      parameterName: "/dev/keycloak/dbAddress",
      description: "Description for your parameter",
      stringValue: rdsinstance.clusterEndpoint.hostname,
    });

    // 4. AppMesh

    // 5. CloudMap

    const cloudMapNamespace = new servicediscovery.PrivateDnsNamespace(
      this,
      "Namespace",
      {
        name: "devsuomifi.local",
        vpc,
      }
    );

    const suomifiservice = cloudMapNamespace.createService("Service", {
      dnsRecordType: servicediscovery.DnsRecordType.A_AAAA,
      dnsTtl: Duration.seconds(30),
    });

    // 6. ECS Cluster, Service, Task, Container, LogGroup
    const cluster = new ecs.Cluster(this, "ECSCluster", {
      vpc: vpc,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDefinition",
      {
        memoryLimitMiB: 1024,
        cpu: 512,
      }
    );

    const keycloakUserParam =
      ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        "KeycloakUserParam",
        {
          parameterName: "/dev/keycloak/keycloakUser",
          version: 1,
        }
      );

    const keycloakPasswordParam =
      ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        "KeycloakPasswordParam",
        {
          parameterName: "/dev/keycloak/keycloakPassword",
          version: 1,
        }
      );

    const keycloakDbUserParam =
      ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        "KeycloakDbUserParam",
        {
          parameterName: "/dev/keycloak/dbUser",
          version: 1,
        }
      );

    const keycloakDbPasswordParam =
      ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        "KeycloakDbPasswordParam",
        {
          parameterName: "/dev/keycloak/dbPassword",
          version: 1,
        }
      );

    const keycloakDbAddressParam =
      ssm.StringParameter.fromStringParameterAttributes(
        this,
        "KeycloakDbAddressParam",
        {
          parameterName: "/dev/keycloak/dbAddress",
          version: 1,
        }
      );

    const logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: "/ecs/hassu-suomifi",
      retention: logs.RetentionDays.TWO_WEEKS,
    });

    //TODO: add repo creation and maybe keycloak docker image build in the cdk?
    const repository = Repository.fromRepositoryName(
      this,
      "KeycloakRepo",
      "hassu-keycloak-repo"
    );
    const container = taskDefinition.addContainer("KeycloakContainer", {
      image: ecs.ContainerImage.fromEcrRepository(repository),
      environment: {
        ENV: "dev",
        KEYCLOAK_FRONTEND_URL:
          "https://hassudev.testivaylapilvi.fi/keycloak/auth",
        DB_VENDOR: "postgres",
        DB_PORT: "5432",
        DB_DATABASE: "keycloak",
        JGROUPS_DISCOVERY_PROTOCOL: "dns.DNS_PING",
        JGROUPS_DISCOVERY_PROPERTIES: "dns_query=devsuomifi.local",
        //KEYCLOAK_IMPORT: '/opt/jboss/keycloak/standalone/tmp/suomifi-realm-export.json'
      },
      secrets: {
        KEYCLOAK_USER: ecs.Secret.fromSsmParameter(keycloakUserParam),
        KEYCLOAK_PASSWORD: ecs.Secret.fromSsmParameter(keycloakPasswordParam),
        DB_ADDR: ecs.Secret.fromSsmParameter(keycloakDbAddressParam),
        DB_USER: ecs.Secret.fromSsmParameter(keycloakDbUserParam),
        DB_PASSWORD: ecs.Secret.fromSsmParameter(keycloakDbPasswordParam),
      },
      portMappings: [{ containerPort: 8080 }],
      logging: ecs.LogDrivers.awsLogs({
        logGroup: logGroup,
        streamPrefix: "KeycloakContainer",
      }),
    });

    const ecsSecurityGroup = new ec2.SecurityGroup(this, "ECSSecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });
    ecsSecurityGroup.connections.allowTo(
      rdsinstance,
      ec2.Port.tcp(5432),
      "RDS connection"
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
    const targetGroup = listener.addTargets("ECS", {
      port: 80,
      targets: [
        service.loadBalancerTarget({
          containerName: "KeycloakContainer",
          containerPort: 8080,
        }),
      ],
      healthCheck: {
        enabled: true,
        port: "8080",
        path: "/keycloak/auth/",
      },
    });

    // 7. Cognito with OpenID Connect
    const userpool = new cognito.UserPool(this, "hassu-userpool", {
      userPoolName: "dev-hassu-userpool",
    });

    //identityprovider OpenID Connect or SAML aren't supported yet by CDK
    //const identityprovider = cognito.UserPoolIdentityProviderOpenID(this, 'OpenIDKeycloakProvider', {
    //  ...
    //})

    const ProviderDetails: idp.OpenIDProviderDetails = {
      authorize_scopes: ssm.StringParameter.valueForStringParameter(
        this,
        "/dev/keycloak/conf/authorizeScopes"
      ),
      client_id: ssm.StringParameter.valueForStringParameter(
        this,
        "/dev/keycloak/conf/clientId"
      ),
      client_secret: ssm.StringParameter.valueForStringParameter(
        this,
        "/dev/keycloak/conf/clientSecret"
      ),
      attributes_request_method: ssm.StringParameter.valueForStringParameter(
        this,
        "/dev/keycloak/conf/method"
      ),
      oidc_issuer: ssm.StringParameter.valueForStringParameter(
        this,
        "/dev/keycloak/conf/oidcIssuer"
      ),
      authorize_url: ssm.StringParameter.valueForStringParameter(
        this,
        "/dev/keycloak/conf/authorizeUrl"
      ),
      attributes_url: ssm.StringParameter.valueForStringParameter(
        this,
        "/dev/keycloak/conf/attributesUrl"
      ),
      token_url: ssm.StringParameter.valueForStringParameter(
        this,
        "/dev/keycloak/conf/tokenUrl"
      ),
      jwks_uri: ssm.StringParameter.valueForStringParameter(
        this,
        "/dev/keycloak/conf/jwksUri"
      ),
    };

    const AttributeMapping = {
      email: "email",
      sub: "username",
    };

    const openIDProviderProperties: idp.OpenIDProviderProperties = {
      UserPoolId: userpool.userPoolId,
      ProviderName: "suomi.fi",
      ProviderType: "OIDC",
      IdpIdentifiers: ["SuomiFiIdentifier"],
      AttributeMapping,
      ProviderDetails,
    };

    const userpoolidentityprovider = new idp.CognitoOpenIDProvider(
      this,
      "UserPoolIDP",
      openIDProviderProperties
    );

    const userpoolclient = userpool.addClient("hassu-app-client", {
      oAuth: {
        flows: {
          implicitCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: ["https://hassudev.testivaylapilvi.fi/"],
        logoutUrls: ["https://vayla.fi/"],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.custom(
          openIDProviderProperties.ProviderName
        ),
      ],
    });
    // specify the dependency between  userpool app client and userpool identity provider
    // to make sure that the identity provider already exists when the app client will be created
    userpoolclient.node.addDependency(userpoolidentityprovider);

    userpool.addDomain("hassu-cognito-domain", {
      cognitoDomain: {
        domainPrefix: "dev-hassu-tunnistautuminen",
      },
    });

    // Outputs
    this.dbAddress = new CfnOutput(this, "DatabaseURL", {
      value: rdsinstance.clusterEndpoint.hostname,
      description: "Host name of the postgres instance for keycloak",
      exportName: "dbAddress",
    });
  }
}
