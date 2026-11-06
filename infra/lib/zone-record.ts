import { PolicyStatement, type IRole } from 'aws-cdk-lib/aws-iam';
import type { ILogGroup } from 'aws-cdk-lib/aws-logs';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId, type AwsSdkCall } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export type ZoneRecordProps = {
  /** The role the custom resource runs as; its name must start with `SITE_ROLE_PREFIX`. Shared by every record. */
  callerRole: IRole;
  /** Where the custom resource logs; the caller role must be able to write to it. Shared by every record. */
  logGroup: ILogGroup;
  /** The record-writer role in the hosted zone's account. */
  roleArn: string;
  hostedZoneId: string;
  name: string;
  type: 'A' | 'AAAA';
  /** The CloudFront distribution's domain name. */
  aliasDnsName: string;
};

/**
 * An alias record to a CloudFront distribution in a hosted zone of another account, written through that account's
 * record-writer role: UPSERT on create and update, DELETE on delete.
 */
export class ZoneRecord extends Construct {
  constructor(scope: Construct, id: string, props: ZoneRecordProps) {
    super(scope, id);
    const { callerRole, logGroup, roleArn, hostedZoneId, name, type, aliasDnsName } = props;
    const change = (action: 'UPSERT' | 'DELETE'): AwsSdkCall => ({
      service: 'Route53',
      action: 'changeResourceRecordSets',
      assumedRoleArn: roleArn,
      parameters: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: action,
              ResourceRecordSet: {
                Name: name,
                Type: type,
                AliasTarget: { HostedZoneId: CloudFrontTarget.CLOUDFRONT_ZONE_ID, DNSName: aliasDnsName, EvaluateTargetHealth: false },
              },
            },
          ],
        },
      },
      physicalResourceId: PhysicalResourceId.of(`${hostedZoneId}/${name}/${type}`),
    });
    new AwsCustomResource(this, 'Resource', {
      onCreate: change('UPSERT'),
      onUpdate: change('UPSERT'),
      onDelete: change('DELETE'),
      role: callerRole,
      logGroup,
      policy: AwsCustomResourcePolicy.fromStatements([new PolicyStatement({ actions: ['sts:AssumeRole'], resources: [roleArn] })]),
      installLatestAwsSdk: false,
    });
  }
}
