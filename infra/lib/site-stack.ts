import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps, Validations } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HttpVersion,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { CfnSubscription } from 'aws-cdk-lib/aws-pricingplanmanager';
import { BlockPublicAccess, Bucket, BucketEncryption, CfnBucket, type IBucket } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { contentRepoWorkflow } from './github-oidc.js';
import type { Inputs } from './inputs.js';
import { SiteBudget } from './site-budget.js';
import { WebAcl } from './web-acl.js';
import { ZoneRecord } from './zone-record.js';
import { ZoneValidatedCertificate } from './zone-validated-certificate.js';
import { DOMAIN, HOST_NAMES, SITE_ROLE_PREFIX, recordWriterRoleArn } from './zone-access-stack.js';

const NOT_FOUND_PAGE = '/404.html';

/**
 * In the workload account: the private bucket, the distribution with its viewer-request function, certificate and
 * web ACL, the CloudFront free-plan subscription, the six alias records in the hosted zone's account, the role the
 * content repo's deploy workflow assumes, and a budget.
 */
export class SiteStack extends Stack {
  readonly bucket: IBucket;
  readonly distribution: Distribution;
  readonly viewerRequest: CloudFrontFunction;

  constructor(scope: Construct, id: string, props: StackProps & { inputs: Inputs; oidcProviderArn: string }) {
    super(scope, id, props);
    const { inputs } = props;
    const roleArn = recordWriterRoleArn(inputs.zoneAccount);

    const bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    Validations.of(bucket).acknowledge({
      id: 'AwsSolutions::AwsSolutions-S1',
      reason: 'No access logs at launch (spec); only the distribution reads the bucket, through origin access control.',
    });

    const certificate = new ZoneValidatedCertificate(this, 'Certificate', {
      roleArn,
      hostedZoneId: inputs.hostedZoneId,
      domainName: DOMAIN,
      alternativeNames: HOST_NAMES.filter((host) => host !== DOMAIN),
    });

    const viewerRequest = new CloudFrontFunction(this, 'ViewerRequest', {
      code: FunctionCode.fromFile({ filePath: inputs.functionCode }),
      runtime: FunctionRuntime.JS_2_0,
    });

    const webAcl = new WebAcl(this, 'WebAcl');
    const notFound = (httpStatus: number) => ({
      httpStatus,
      responseHttpStatus: 404,
      responsePagePath: NOT_FOUND_PAGE,
      ttl: Duration.days(1),
    });
    const distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        compress: true,
        functionAssociations: [{ function: viewerRequest, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      domainNames: HOST_NAMES,
      certificate: Certificate.fromCertificateArn(this, 'SiteCertificate', certificate.certificateArn),
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      errorResponses: [notFound(403), notFound(404)],
      webAclId: webAcl.arn,
    });
    distribution.applyRemovalPolicy(RemovalPolicy.RETAIN);
    Validations.of(distribution).acknowledge({ id: 'AwsSolutions::AwsSolutions-CFR1', reason: 'A public site, served everywhere.' });
    Validations.of(distribution).acknowledge({ id: 'AwsSolutions::AwsSolutions-CFR3', reason: 'No access logs at launch (spec).' });

    const subscription = new CfnSubscription(this, 'PlanSubscription', {
      planFamily: 'CloudFront',
      planTier: 'FREE',
      resourceArns: [distribution.distributionArn, webAcl.arn],
    });

    const callerRole = new Role(this, 'ZoneRecordsRole', {
      roleName: `${SITE_ROLE_PREFIX}ZoneRecords`,
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    const logGroup = new LogGroup(this, 'ZoneRecordsLogs', { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY });
    logGroup.grantWrite(callerRole);
    for (const name of HOST_NAMES) {
      for (const type of ['A', 'AAAA'] as const) {
        new ZoneRecord(this, `${name}-${type}`, {
          callerRole,
          logGroup,
          roleArn,
          hostedZoneId: inputs.hostedZoneId,
          name,
          type,
          aliasDnsName: distribution.distributionDomainName,
        });
      }
    }

    const deploy = new Role(this, 'DeployRole', {
      roleName: 'PrinceTronics-Deploy',
      assumedBy: contentRepoWorkflow(props.oidcProviderArn, inputs.contentRepo, 'deploy.yml'),
    });
    deploy.addToPolicy(new PolicyStatement({ actions: ['s3:ListBucket'], resources: [bucket.bucketArn] }));
    deploy.addToPolicy(new PolicyStatement({ actions: ['s3:PutObject', 's3:DeleteObject'], resources: [bucket.arnForObjects('*')] }));
    deploy.addToPolicy(new PolicyStatement({ actions: ['cloudfront:GetFunction'], resources: [viewerRequest.functionArn] }));
    Validations.of(deploy).acknowledge({
      id: `AwsSolutions::AwsSolutions-IAM5[Resource::<${this.getLogicalId(bucket.node.defaultChild as CfnBucket)}.Arn>/*]`,
      reason: 'A deploy writes and deletes any key in the site bucket, and only there.',
    });

    new SiteBudget(this, 'Budget', { email: inputs.budgetEmail });

    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'FunctionName', { value: viewerRequest.functionName });
    new CfnOutput(this, 'CertificateArn', { value: certificate.certificateArn });
    new CfnOutput(this, 'PlanSubscriptionStatus', { value: subscription.attrStatus });

    this.bucket = bucket;
    this.distribution = distribution;
    this.viewerRequest = viewerRequest;
  }
}
