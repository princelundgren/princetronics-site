import { RemovalPolicy } from 'aws-cdk-lib';
import { CfnWebACL } from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

const MANAGED_GROUPS = ['AWSManagedRulesAmazonIpReputationList', 'AWSManagedRulesCommonRuleSet', 'AWSManagedRulesKnownBadInputsRuleSet'];
const REQUESTS_PER_FIVE_MINUTES_PER_IP = 1000;

function visibility(metricName: string): CfnWebACL.VisibilityConfigProperty {
  return { metricName, cloudWatchMetricsEnabled: true, sampledRequestsEnabled: true };
}

/** The distribution's firewall: a per-IP rate limit, then three AWS managed rule groups. Retained on stack delete. */
export class WebAcl extends Construct {
  readonly arn: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const rateLimit: CfnWebACL.RuleProperty = {
      name: 'RateLimit',
      priority: 0,
      action: { block: {} },
      statement: {
        rateBasedStatement: { limit: REQUESTS_PER_FIVE_MINUTES_PER_IP, aggregateKeyType: 'IP', evaluationWindowSec: 300 },
      },
      visibilityConfig: visibility('RateLimit'),
    };
    const managed = MANAGED_GROUPS.map(
      (name, index): CfnWebACL.RuleProperty => ({
        name,
        priority: index + 1,
        overrideAction: { none: {} },
        statement: { managedRuleGroupStatement: { vendorName: 'AWS', name } },
        visibilityConfig: visibility(name),
      }),
    );
    const acl = new CfnWebACL(this, 'Resource', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      rules: [rateLimit, ...managed],
      visibilityConfig: visibility('PrinceTronics'),
    });
    acl.applyRemovalPolicy(RemovalPolicy.RETAIN);
    this.arn = acl.attrArn;
  }
}
