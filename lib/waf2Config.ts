import {
  CfnIPSet,
  CfnWebACL,
  CfnWebACLAssociation,
  CfnWebACLProps,
} from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";

export class WafConfig extends Construct {
  constructor(
    scope: Construct,
    id: string,
    { resource: resource, allowedAddresses: allowedAddresses }: any
  ) {
    super(scope, id);

    const allowedIPSet = new CfnIPSet(this, "VaylapilviIPSet", {
      addresses: allowedAddresses,
      ipAddressVersion: "IPV4",
      scope: "REGIONAL",
      name: `vaylapilvi-CIDR-suomifi`,
    });

    const props: CfnWebACLProps = {
      defaultAction: { allow: {} },
      scope: "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: `Hassu-WAF-suomifi`,
      },
      name: `Hassu-ACL-suomifi`,
      rules: [
        {
          name: "AllowOnlyFromVaylapilvi",
          action: { block: {} },
          priority: 1,
          statement: {
            notStatement: {
              statement: {
                ipSetReferenceStatement: { arn: allowedIPSet.attrArn },
              },
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: `Hassu-Suomifi-AllowOnlyFromVaylapilvi`,
          },
        },
      ],
    };
    const acl = new CfnWebACL(this, "ACL", props);

    new CfnWebACLAssociation(this, "APIAssoc", {
      resourceArn: resource.loadBalancerArn, // too bad it isn't universal construct.arn, but specific for loadbalancer
      webAclArn: acl.attrArn,
    });
  }
}
