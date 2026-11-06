import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { describe, expect, it } from 'vitest';
import { ZoneRecord } from '../lib/zone-record.js';
import { ZoneValidatedCertificate } from '../lib/zone-validated-certificate.js';
import { SITE_ROLE_PREFIX, recordWriterRoleArn } from '../lib/zone-access-stack.js';

const roleArn = recordWriterRoleArn('222222222222');
const hostedZoneId = 'Z0000000000EXAMPLE';

type Statement = { Action: string | string[]; Resource: unknown; Condition?: Record<string, Record<string, unknown>> };

function stackWith(build: (stack: Stack) => void): Template {
  const stack = new Stack(new App(), 'Site', { env: { account: '111111111111', region: 'us-east-1' } });
  build(stack);
  return Template.fromStack(stack);
}

function policyStatements(template: Template): Statement[] {
  return Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
    (policy) => policy.Properties.PolicyDocument.Statement as Statement[],
  );
}

function roleNames(template: Template): unknown[] {
  return Object.values(template.findResources('AWS::IAM::Role')).map((role) => role.Properties.RoleName);
}

describe('ZoneRecord', () => {
  const template = stackWith((stack) => {
    const callerRole = new Role(stack, 'Caller', {
      roleName: `${SITE_ROLE_PREFIX}ZoneRecords`,
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    new ZoneRecord(stack, 'Apex', {
      callerRole,
      logGroup: new LogGroup(stack, 'ZoneRecordLogs'),
      roleArn,
      hostedZoneId,
      name: 'princetronics.com',
      type: 'A',
      aliasDnsName: 'd111111abcdef8.cloudfront.net',
    });
  });

  it('upserts on create and deletes on delete, through the record-writer role, aliased to CloudFront', () => {
    const [record] = Object.values(template.findResources('Custom::AWS'));
    const create = JSON.stringify(record.Properties.Create);
    const remove = JSON.stringify(record.Properties.Delete);
    for (const call of [create, remove]) {
      expect(call).toContain(roleArn);
      expect(call).toContain(hostedZoneId);
      expect(call).toContain('Z2FDTNDATAQYW2');
      expect(call).toContain('d111111abcdef8.cloudfront.net');
    }
    expect(create).toContain('UPSERT');
    expect(remove).toContain('DELETE');
    expect(create).toContain(`${hostedZoneId}/princetronics.com/A`);
  });

  it('logs to the log group it is given', () => {
    const [logGroupId] = Object.keys(template.findResources('AWS::Logs::LogGroup'));
    const [fn] = Object.values(template.findResources('AWS::Lambda::Function'));
    expect(fn.Properties.LoggingConfig).toEqual({ LogGroup: { Ref: logGroupId } });
  });

  it('lets its caller assume only the record-writer role', () => {
    const statements = policyStatements(template);
    expect(statements).toEqual([expect.objectContaining({ Action: 'sts:AssumeRole', Resource: roleArn })]);
  });
});

describe('ZoneValidatedCertificate', () => {
  const template = stackWith((stack) => {
    new ZoneValidatedCertificate(stack, 'Certificate', {
      roleArn,
      hostedZoneId,
      domainName: 'princetronics.com',
      alternativeNames: ['www.princetronics.com', 'www-static.princetronics.com'],
    });
  });

  it("waits up to the provider framework's hour, polling every minute", () => {
    const [machine] = Object.values(template.findResources('AWS::StepFunctions::StateMachine'));
    const definition = JSON.stringify(machine.Properties.DefinitionString);
    expect(definition).toContain('\\"IntervalSeconds\\":60');
    expect(definition).toContain('\\"MaxAttempts\\":60');
  });

  it('runs its handlers on Node 24 under a role the record-writer trusts', () => {
    const handlers = Object.values(template.findResources('AWS::Lambda::Function')).filter(
      (fn) => fn.Properties.Handler === 'index.onEvent' || fn.Properties.Handler === 'index.isComplete',
    );
    expect(handlers.map((fn) => fn.Properties.Runtime)).toEqual(['nodejs24.x', 'nodejs24.x']);
    expect(roleNames(template)).toContain(`${SITE_ROLE_PREFIX}Certificate`);
  });

  it('limits every ACM permission to certificates tagged managed-by=princetronics-certificate', () => {
    const acm = policyStatements(template).filter((statement) => [statement.Action].flat().some((a) => a.startsWith('acm:')));
    expect(acm.length).toBeGreaterThan(0);
    for (const statement of acm) {
      const tag = statement.Condition?.StringEquals;
      expect(tag?.['aws:RequestTag/managed-by'] ?? tag?.['aws:ResourceTag/managed-by']).toBe('princetronics-certificate');
    }
    const actions = acm.flatMap((statement) => [statement.Action].flat()).sort();
    expect(actions).toEqual(['acm:AddTagsToCertificate', 'acm:DeleteCertificate', 'acm:DescribeCertificate', 'acm:RequestCertificate']);
  });

  it('lets its handlers assume only the record-writer role', () => {
    const assume = policyStatements(template).filter((statement) => [statement.Action].flat().includes('sts:AssumeRole'));
    expect(assume.map((statement) => statement.Resource)).toEqual([roleArn]);
  });
});
