import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { readInputs } from '../lib/inputs.js';
import { RECORD_WRITER_ROLE_NAME, SITE_ROLE_PREFIX, ZoneAccessStack, recordWriterRoleArn } from '../lib/zone-access-stack.js';
import { testContext } from './test-inputs.js';

type Statement = {
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: unknown;
  Condition?: Record<string, Record<string, unknown>>;
};

function synth(): Template {
  const inputs = readInputs(testContext());
  const stack = new ZoneAccessStack(new App(), 'Zone', {
    env: { account: inputs.zoneAccount, region: 'us-east-1' },
    inputs,
  });
  return Template.fromStack(stack);
}

function statements(template: Template): Statement[] {
  const roles = Object.values(template.findResources('AWS::IAM::Role'));
  return roles.flatMap((role) =>
    (role.Properties.Policies ?? []).flatMap((policy: { PolicyDocument: { Statement: Statement[] } }) => policy.PolicyDocument.Statement),
  );
}

function actionsOf(statement: Statement): string[] {
  return [statement.Action].flat();
}

function changeStatements(template: Template): Statement[] {
  return statements(template).filter((statement) => actionsOf(statement).includes('route53:ChangeResourceRecordSets'));
}

function hasType(statement: Statement, type: string): boolean {
  const types = statement.Condition?.['ForAllValues:StringEquals']?.['route53:ChangeResourceRecordSetsRecordTypes'];
  return Array.isArray(types) && types.includes(type);
}

describe('recordWriterRoleArn', () => {
  it('names the record-writer role in the zone account', () => {
    expect(recordWriterRoleArn('222222222222')).toBe('arn:aws:iam::222222222222:role/PrinceTronics-RecordWriter');
  });
});

const HOSTS = ['princetronics.com', 'www.princetronics.com', 'www-static.princetronics.com'];
const NAMES_KEY = 'route53:ChangeResourceRecordSetsNormalizedRecordNames';

/** IAM's StringLike: `*` matches any run of characters, `?` exactly one, everything else itself. */
function stringLike(pattern: string, value: string): boolean {
  const source = [...pattern].map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join('');
  return new RegExp(`^${source}$`).test(value);
}

function deniedNames(): string[] {
  const deny = changeStatements(synth()).find((statement) => statement.Effect === 'Deny');
  return (deny?.Condition?.['ForAnyValue:StringLike']?.[NAMES_KEY] ?? []) as string[];
}

function validationNames(): string[] {
  const allow = changeStatements(synth()).find((statement) => statement.Effect === 'Allow' && hasType(statement, 'CNAME'));
  return (allow?.Condition?.['ForAllValues:StringLike']?.[NAMES_KEY] ?? []) as string[];
}

describe('ZoneAccessStack', () => {
  it("creates the record-writer role, trusted only by the site stack's roles in the workload account", () => {
    const roles = Object.values(synth().findResources('AWS::IAM::Role'));
    expect(roles).toHaveLength(1);
    expect(roles[0].Properties.RoleName).toBe(RECORD_WRITER_ROLE_NAME);
    const trust = roles[0].Properties.AssumeRolePolicyDocument.Statement;
    expect(trust).toHaveLength(1);
    expect(trust[0]).toMatchObject({ Effect: 'Allow', Action: 'sts:AssumeRole' });
    expect(JSON.stringify(trust[0].Principal)).toContain(':iam::111111111111:root');
    expect(trust[0].Condition).toEqual({
      ArnLike: { 'aws:PrincipalArn': `arn:aws:iam::111111111111:role/${SITE_ROLE_PREFIX}*` },
    });
  });

  it('lets the role alias only the three host names, by A and AAAA', () => {
    const hosts = changeStatements(synth()).find((statement) => statement.Effect === 'Allow' && hasType(statement, 'A'));
    expect(hosts?.Resource).toBe('arn:aws:route53:::hostedzone/Z0000000000EXAMPLE');
    expect(hosts?.Condition).toEqual({
      'ForAllValues:StringEquals': {
        'route53:ChangeResourceRecordSetsRecordTypes': ['A', 'AAAA'],
        'route53:ChangeResourceRecordSetsActions': ['UPSERT', 'DELETE'],
        'route53:ChangeResourceRecordSetsNormalizedRecordNames': [
          'princetronics.com',
          'www.princetronics.com',
          'www-static.princetronics.com',
        ],
      },
    });
  });

  it("lets the role write CNAMEs only at names in the shape of ACM's validation records for the three hosts", () => {
    const token = '?'.repeat(32);
    const validation = changeStatements(synth()).find((statement) => statement.Effect === 'Allow' && hasType(statement, 'CNAME'));
    expect(validation?.Condition).toEqual({
      'ForAllValues:StringEquals': {
        'route53:ChangeResourceRecordSetsRecordTypes': ['CNAME'],
        'route53:ChangeResourceRecordSetsActions': ['UPSERT', 'DELETE'],
      },
      'ForAllValues:StringLike': {
        'route53:ChangeResourceRecordSetsNormalizedRecordNames': [
          `_${token}.princetronics.com`,
          `_${token}.www.princetronics.com`,
          `_${token}.www-static.princetronics.com`,
        ],
      },
    });
  });

  it('denies the underscore names other services verify domains or read policy at, and any second underscore label', () => {
    const deny = changeStatements(synth()).find((statement) => statement.Effect === 'Deny');
    expect(deny?.Resource).toBe('arn:aws:route53:::hostedzone/Z0000000000EXAMPLE');
    expect(Object.keys(deny?.Condition ?? {})).toEqual(['ForAnyValue:StringLike']);
    expect(deniedNames()).toEqual(
      expect.arrayContaining(['_acme-challenge*', '_amazonses*', '_atproto*', '_dmarc*', '_dnsauth*', '_domainkey*', '_github*', '_mta-sts*', '*._*']),
    );
  });

  it("denies a validation-shaped name whose token holds a dot, so it can't name another host", () => {
    const denied = deniedNames();
    for (const host of HOSTS) {
      for (let dot = 0; dot < 32; dot++) {
        const name = `_${'a'.repeat(dot)}.${'b'.repeat(31 - dot)}.${host}`;
        expect(denied.some((pattern) => stringLike(pattern, name)), name).toBe(true);
      }
    }
  });

  it('leaves ACM validation names for the three hosts allowed and not denied', () => {
    const allowed = validationNames();
    const denied = deniedNames();
    for (const host of HOSTS) {
      const name = `_${'0123456789abcdef'.repeat(2)}.${host}`;
      expect(allowed.some((pattern) => stringLike(pattern, name)), name).toBe(true);
      expect(denied.some((pattern) => stringLike(pattern, name)), name).toBe(false);
    }
  });

  it("keeps the record-writer's inline policy under IAM's 10,240-character limit", () => {
    const [policy] = Object.values(synth().findResources('AWS::IAM::Role'))[0].Properties.Policies;
    expect(JSON.stringify(policy.PolicyDocument).length).toBeLessThan(10_240);
  });

  it('grants only ChangeResourceRecordSets, and only on the zone', () => {
    const all = statements(synth());
    expect(all.flatMap(actionsOf)).toEqual([
      'route53:ChangeResourceRecordSets',
      'route53:ChangeResourceRecordSets',
      'route53:ChangeResourceRecordSets',
    ]);
    for (const statement of all) expect(statement.Resource).toBe(`arn:aws:route53:::hostedzone/${readInputs(testContext()).hostedZoneId}`);
  });

  it('adds a 2 USD monthly budget on the project tag, alerting on actual and forecast spend', () => {
    synth().hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
        BudgetLimit: { Amount: 2, Unit: 'USD' },
        Metrics: ['UnblendedCost'],
        FilterExpression: { Tags: { Key: 'user:project', Values: ['princetronics'] } },
      },
      NotificationsWithSubscribers: [
        {
          Notification: { NotificationType: 'ACTUAL', ComparisonOperator: 'GREATER_THAN', Threshold: 100 },
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'budget@example.com' }],
        },
        {
          Notification: { NotificationType: 'FORECASTED', ComparisonOperator: 'GREATER_THAN', Threshold: 100 },
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'budget@example.com' }],
        },
      ],
    });
  });
});
