import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { readInputs, type Inputs } from '../lib/inputs.js';
import { SiteStack } from '../lib/site-stack.js';
import { testContext } from './test-inputs.js';

const CACHING_OPTIMIZED = '658327ea-f89d-4fab-a63d-7e88639e58f6';
const SECURITY_HEADERS = '67f7725c-6f97-4210-82d7-5512b31e9d03';

function siteStack(inputs: Inputs = readInputs(testContext())): SiteStack {
  return new SiteStack(new App(), 'PrinceTronics-Site', {
    env: { account: inputs.workloadAccount, region: 'us-east-1' },
    inputs,
    oidcProviderArn: 'arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com',
  });
}

const template = Template.fromStack(siteStack());

function only(type: string): { logicalId: string; resource: Record<string, any> } {
  const resources = template.findResources(type);
  expect(Object.keys(resources)).toHaveLength(1);
  const [logicalId, resource] = Object.entries(resources)[0];
  return { logicalId, resource };
}

const distribution = only('AWS::CloudFront::Distribution');
const config = distribution.resource.Properties.DistributionConfig;
const webAcl = only('AWS::WAFv2::WebACL');

describe('SiteStack', () => {
  it('keeps the bucket private and retains it', () => {
    const { resource } = only('AWS::S3::Bucket');
    expect(resource.Properties.PublicAccessBlockConfiguration).toEqual({
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    expect(resource.Properties.WebsiteConfiguration).toBeUndefined();
    expect(resource.DeletionPolicy).toBe('Retain');
  });

  it('serves the three host names over HTTPS with one cache behaviour', () => {
    expect(config.Aliases).toEqual(['princetronics.com', 'www.princetronics.com', 'www-static.princetronics.com']);
    expect(config.CacheBehaviors ?? []).toEqual([]);
    expect(config.DefaultRootObject).toBeUndefined();
    expect(config.ViewerCertificate).toMatchObject({ MinimumProtocolVersion: 'TLSv1.2_2021', SslSupportMethod: 'sni-only' });
    expect(config.DefaultCacheBehavior).toMatchObject({
      ViewerProtocolPolicy: 'redirect-to-https',
      CachePolicyId: CACHING_OPTIMIZED,
      ResponseHeadersPolicyId: SECURITY_HEADERS,
      AllowedMethods: ['GET', 'HEAD'],
      Compress: true,
    });
    expect(config).toMatchObject({ HttpVersion: 'http2and3', IPV6Enabled: true });
  });

  it('answers 403 and 404 with the 404 page, cached for a day', () => {
    expect(config.CustomErrorResponses).toEqual([
      { ErrorCode: 403, ResponseCode: 404, ResponsePagePath: '/404.html', ErrorCachingMinTTL: 86400 },
      { ErrorCode: 404, ResponseCode: 404, ResponsePagePath: '/404.html', ErrorCachingMinTTL: 86400 },
    ]);
  });

  it('runs the viewer-request function on the JS 2.0 runtime', () => {
    const fn = only('AWS::CloudFront::Function');
    expect(fn.resource.Properties.FunctionConfig.Runtime).toBe('cloudfront-js-2.0');
    expect(fn.resource.Properties.FunctionCode).toContain('function handler(event)');
    expect(config.DefaultCacheBehavior.FunctionAssociations).toEqual([
      { EventType: 'viewer-request', FunctionARN: { 'Fn::GetAtt': [fn.logicalId, 'FunctionARN'] } },
    ]);
  });

  it('puts the distribution behind the web ACL and retains both', () => {
    expect(config.WebACLId).toEqual({ 'Fn::GetAtt': [webAcl.logicalId, 'Arn'] });
    expect(distribution.resource.DeletionPolicy).toBe('Retain');
    expect(webAcl.resource.DeletionPolicy).toBe('Retain');
  });

  it('gives the web ACL a rate limit and three AWS managed groups, and nothing else', () => {
    const { Scope, DefaultAction, Rules } = webAcl.resource.Properties;
    expect(Scope).toBe('CLOUDFRONT');
    expect(DefaultAction).toEqual({ Allow: {} });
    expect(Rules.map((rule: { Name: string }) => rule.Name)).toEqual([
      'RateLimit',
      'AWSManagedRulesAmazonIpReputationList',
      'AWSManagedRulesCommonRuleSet',
      'AWSManagedRulesKnownBadInputsRuleSet',
    ]);
    expect(Rules[0]).toMatchObject({
      Action: { Block: {} },
      Statement: { RateBasedStatement: { Limit: 1000, AggregateKeyType: 'IP', EvaluationWindowSec: 300 } },
    });
    for (const rule of Rules.slice(1)) {
      expect(rule.Statement.ManagedRuleGroupStatement).toEqual({ VendorName: 'AWS', Name: rule.Name });
    }
    expect(JSON.stringify(Rules)).not.toContain('RuleGroupReferenceStatement');
  });

  it('subscribes the distribution and the web ACL to the CloudFront free plan', () => {
    const { resource } = only('AWS::PricingPlanManager::Subscription');
    expect(resource.Properties).toEqual({
      PlanFamily: 'CloudFront',
      PlanTier: 'FREE',
      ResourceArns: [expect.anything(), { 'Fn::GetAtt': [webAcl.logicalId, 'Arn'] }],
    });
    expect(JSON.stringify(resource.Properties.ResourceArns[0])).toContain(distribution.logicalId);
  });

  it('writes an A and an AAAA alias for each host name', () => {
    const records = Object.values(template.findResources('Custom::AWS')).map((record) => JSON.stringify(record.Properties.Create));
    expect(records).toHaveLength(6);
    for (const host of ['princetronics.com', 'www.princetronics.com', 'www-static.princetronics.com']) {
      for (const type of ['A', 'AAAA']) {
        const physicalId = new RegExp(`Z0000000000EXAMPLE/${host.replaceAll('.', '\\.')}/${type}\\b`);
        expect(records.filter((record) => physicalId.test(record))).toHaveLength(1);
      }
    }
  });

  it('outputs what the deploy and the cut-over read', () => {
    expect(Object.keys(template.findOutputs('*')).sort()).toEqual([
      'BucketName',
      'CertificateArn',
      'DistributionDomainName',
      'DistributionId',
      'FunctionName',
      'PlanSubscriptionStatus',
    ]);
  });

  it('fails to synth naming a function file that is not there', () => {
    const inputs = { ...readInputs(testContext()), functionCode: '/nonexistent/viewer-request.js' };
    expect(() => siteStack(inputs)).toThrow(/\/nonexistent\/viewer-request\.js/);
  });
});
