import { CfnWebACLProps } from "@aws-cdk/aws-wafv2/lib/wafv2.generated";
import * as constructs from "constructs";

const cdk = require("@aws-cdk/core");
const waf2 = require("@aws-cdk/aws-wafv2");

export class WafConfig extends cdk.Construct {
  constructor(scope: constructs.Construct, id: string, { resource, allowedAddresses: allowedAddresses }: any) {
    super(scope, id);

    const allowedIPSet = new waf2.CfnIPSet(this, "VaylapilviIPSet", {
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
                }
              }
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: `Hassu-Suomifi-AllowOnlyFromVaylapilvi`,
          },
        },
      ],
    };
    const acl = new waf2.CfnWebACL(this, "ACL", props);

    const association = new waf2.CfnWebACLAssociation(this, "APIAssoc", {
      resourceArn: resource.arn,
      webAclArn: acl.attrArn,
    });

    this.acl = acl;
    this.association = association;
  }
}