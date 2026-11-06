import { Stack, type StackProps } from 'aws-cdk-lib';
import { AccountPrincipal, Effect, PolicyDocument, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { Inputs } from './inputs.js';
import { SiteBudget } from './site-budget.js';

export const RECORD_WRITER_ROLE_NAME = 'PrinceTronics-RecordWriter';
/** Every role in the site stack that writes records is named with this prefix; the record-writer trusts no other. */
export const SITE_ROLE_PREFIX = 'PrinceTronics-Site-';
export const DOMAIN = 'princetronics.com';
export const HOST_NAMES = [DOMAIN, `www.${DOMAIN}`, `www-static.${DOMAIN}`];

/** The ARN of the record-writer role in the hosted zone's account, built from the account id alone. */
export function recordWriterRoleArn(zoneAccount: string): string {
  return `arn:aws:iam::${zoneAccount}:role/${RECORD_WRITER_ROLE_NAME}`;
}

const CHANGE_ACTIONS = ['UPSERT', 'DELETE'];

/** ACM names a validation record `_<token>.<host>`, the token 32 hex characters; IAM's `?` matches any one. */
const VALIDATION_NAMES = HOST_NAMES.map((host) => `_${'?'.repeat(32)}.${host}`);

/** The validation-shaped names whose token holds a dot: each would be a validation name for some other host. */
const DOTTED_TOKEN_NAMES = HOST_NAMES.flatMap((host) =>
  Array.from({ length: 32 }, (_, dot) => `_${'?'.repeat(dot)}.${'?'.repeat(31 - dot)}.${host}`),
);

/**
 * Names other services verify the domain or read policy at, which a CNAME would hand to its target: ACME challenges
 * (any CA's certificates), SES, Bluesky, Azure and GitHub verification, DMARC, MTA-STS and DKIM, and any name below a
 * second underscore label (SRV, `_smtp._tls`, a DKIM selector). ACM's validation names match none of them.
 */
const PROTECTED_UNDERSCORE_NAMES = [
  '_acme-challenge*',
  '_amazonses*',
  '_atproto*',
  '_dmarc*',
  '_dnsauth*',
  '_domainkey*',
  '_github*',
  '_mta-sts*',
  '*._*',
];

/**
 * In the hosted zone's account: the role the site stack's roles assume to write its A and AAAA aliases and its
 * certificate-validation CNAMEs, and nothing else in the zone, plus the account's budget.
 */
export class ZoneAccessStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { inputs: Inputs }) {
    super(scope, id, props);
    const { hostedZoneId, workloadAccount, budgetEmail } = props.inputs;
    const zoneArn = `arn:aws:route53:::hostedzone/${hostedZoneId}`;

    new Role(this, 'RecordWriter', {
      roleName: RECORD_WRITER_ROLE_NAME,
      assumedBy: new AccountPrincipal(workloadAccount).withConditions({
        ArnLike: { 'aws:PrincipalArn': `arn:aws:iam::${workloadAccount}:role/${SITE_ROLE_PREFIX}*` },
      }),
      inlinePolicies: {
        SiteRecords: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['route53:ChangeResourceRecordSets'],
              resources: [zoneArn],
              conditions: {
                'ForAllValues:StringEquals': {
                  'route53:ChangeResourceRecordSetsRecordTypes': ['A', 'AAAA'],
                  'route53:ChangeResourceRecordSetsActions': CHANGE_ACTIONS,
                  'route53:ChangeResourceRecordSetsNormalizedRecordNames': HOST_NAMES,
                },
              },
            }),
            new PolicyStatement({
              actions: ['route53:ChangeResourceRecordSets'],
              resources: [zoneArn],
              conditions: {
                'ForAllValues:StringEquals': {
                  'route53:ChangeResourceRecordSetsRecordTypes': ['CNAME'],
                  'route53:ChangeResourceRecordSetsActions': CHANGE_ACTIONS,
                },
                'ForAllValues:StringLike': { 'route53:ChangeResourceRecordSetsNormalizedRecordNames': VALIDATION_NAMES },
              },
            }),
            new PolicyStatement({
              effect: Effect.DENY,
              actions: ['route53:ChangeResourceRecordSets'],
              resources: [zoneArn],
              conditions: {
                'ForAnyValue:StringLike': {
                  'route53:ChangeResourceRecordSetsNormalizedRecordNames': [...PROTECTED_UNDERSCORE_NAMES, ...DOTTED_TOKEN_NAMES],
                },
              },
            }),
          ],
        }),
      },
    });

    new SiteBudget(this, 'Budget', { email: budgetEmail });
  }
}
