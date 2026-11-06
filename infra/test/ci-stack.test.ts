import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { CiStack } from '../lib/ci-stack.js';
import { readInputs, type Inputs } from '../lib/inputs.js';
import { SiteStack } from '../lib/site-stack.js';
import { testContext } from './test-inputs.js';

type Statement = { Effect: string; Action: string | string[]; Resource?: unknown; Principal?: unknown; Condition?: unknown };

const GITHUB = 'token.actions.githubusercontent.com';
const EXISTING_PROVIDER = `arn:aws:iam::111111111111:oidc-provider/${GITHUB}`;

function ciTemplate(context: Record<string, unknown> = testContext()): { template: Template; site: Template } {
  const inputs: Inputs = readInputs(context);
  const app = new App();
  const env = { account: inputs.workloadAccount, region: 'us-east-1' };
  const ci = new CiStack(app, 'PrinceTronics-Ci', { env, inputs });
  const siteStack = new SiteStack(app, 'PrinceTronics-Site', { env, inputs, oidcProviderArn: ci.oidcProviderArn });
  return { template: Template.fromStack(ci), site: Template.fromStack(siteStack) };
}

function role(template: Template, name: string): Record<string, any> {
  const roles = Object.values(template.findResources('AWS::IAM::Role')).filter((r) => r.Properties.RoleName === name);
  expect(roles).toHaveLength(1);
  return roles[0];
}

function permissions(template: Template, name: string): Statement[] {
  const [logicalId] = Object.entries(template.findResources('AWS::IAM::Role')).find(([, r]) => r.Properties.RoleName === name)!;
  return Object.values(template.findResources('AWS::IAM::Policy'))
    .filter((policy) => JSON.stringify(policy.Properties.Roles) === JSON.stringify([{ Ref: logicalId }]))
    .flatMap((policy) => policy.Properties.PolicyDocument.Statement as Statement[]);
}

const { template, site } = ciTemplate();

describe('CiStack', () => {
  for (const [name, stack, workflow] of [
    ['PrinceTronics-Deploy', site, 'deploy.yml'],
    ['PrinceTronics-Infra', template, 'infrastructure.yml'],
  ] as const) {
    it(`lets only the content repo's ${workflow} on main assume ${name}`, () => {
      const statements = role(stack, name).Properties.AssumeRolePolicyDocument.Statement as Statement[];
      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatchObject({ Effect: 'Allow', Action: 'sts:AssumeRoleWithWebIdentity' });
      expect(statements[0].Condition).toEqual({
        StringEquals: {
          [`${GITHUB}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB}:sub`]: 'repo:example@111/content@222:ref:refs/heads/main',
          [`${GITHUB}:job_workflow_ref`]: `example/content/.github/workflows/${workflow}@refs/heads/main`,
        },
      });
    });
  }

  it('creates the GitHub OIDC provider when none is given', () => {
    const [provider] = Object.values(template.findResources('AWS::IAM::OIDCProvider'));
    expect(provider.Properties).toMatchObject({ Url: `https://${GITHUB}`, ClientIdList: ['sts.amazonaws.com'] });
  });

  it('imports the OIDC provider it is given and creates none', () => {
    const { template: imported, site: importedSite } = ciTemplate({ ...testContext(), oidcProviderArn: EXISTING_PROVIDER });
    expect(Object.keys(imported.findResources('AWS::IAM::OIDCProvider'))).toEqual([]);
    for (const [stack, name] of [
      [imported, 'PrinceTronics-Infra'],
      [importedSite, 'PrinceTronics-Deploy'],
    ] as const) {
      const statement = role(stack, name).Properties.AssumeRolePolicyDocument.Statement[0];
      expect(statement.Principal).toEqual({ Federated: EXISTING_PROVIDER });
    }
  });

  it('lets the deploy role list and write the bucket and read the function, and nothing else', () => {
    const statements = permissions(site, 'PrinceTronics-Deploy');
    const actions = statements.flatMap((statement) => [statement.Action].flat()).sort();
    expect(actions).toEqual(['cloudfront:GetFunction', 's3:DeleteObject', 's3:ListBucket', 's3:PutObject']);
    const resources = JSON.stringify(statements.map((statement) => statement.Resource));
    const [bucketId] = Object.keys(site.findResources('AWS::S3::Bucket'));
    const [functionId] = Object.keys(site.findResources('AWS::CloudFront::Function'));
    expect(resources).toContain(bucketId);
    expect(resources).toContain('/*');
    expect(resources).toContain(functionId);
    expect(statements.every((statement) => statement.Effect === 'Allow')).toBe(true);
    expect(resources).not.toContain('"*"');
  });

  it("lets the infra role assume only the workload account's CDK deploy, publishing and lookup roles", () => {
    const role = (kind: string) => `arn:aws:iam::111111111111:role/cdk-hnb659fds-${kind}-role-111111111111-us-east-1`;
    expect(permissions(template, 'PrinceTronics-Infra')).toEqual([
      { Effect: 'Allow', Action: 'sts:AssumeRole', Resource: [role('deploy'), role('file-publishing'), role('lookup')] },
    ]);
  });
});
