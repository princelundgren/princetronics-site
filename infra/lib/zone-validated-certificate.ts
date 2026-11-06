import { CustomResource, Duration, RemovalPolicy, Stack, Validations } from 'aws-cdk-lib';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnFunction, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct, type IConstruct } from 'constructs';
import { fileURLToPath } from 'node:url';
import { SITE_ROLE_PREFIX } from './zone-access-stack.js';

const TAG_KEY = 'managed-by';
const TAG_VALUE = 'princetronics-certificate';

export type ZoneValidatedCertificateProps = {
  /** The record-writer role in the hosted zone's account. */
  roleArn: string;
  hostedZoneId: string;
  domainName: string;
  alternativeNames: string[];
};

/**
 * A DNS-validated ACM certificate whose validation records go into a hosted zone of another account, through that
 * account's record-writer role. Deploying it waits up to an hour for the certificate to be issued.
 */
export class ZoneValidatedCertificate extends Construct {
  readonly certificateArn: string;

  constructor(scope: Construct, id: string, props: ZoneValidatedCertificateProps) {
    super(scope, id);
    const role = new Role(this, 'Role', {
      roleName: `${SITE_ROLE_PREFIX}Certificate`,
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    const { account, region } = Stack.of(this);
    const certificates = Stack.of(this).formatArn({ service: 'acm', resource: 'certificate', resourceName: '*' });
    const requestTag = { StringEquals: { [`aws:RequestTag/${TAG_KEY}`]: TAG_VALUE } };
    role.addToPolicy(new PolicyStatement({ actions: ['acm:RequestCertificate'], resources: ['*'], conditions: requestTag }));
    role.addToPolicy(new PolicyStatement({ actions: ['acm:AddTagsToCertificate'], resources: [certificates], conditions: requestTag }));
    role.addToPolicy(
      new PolicyStatement({
        actions: ['acm:DescribeCertificate', 'acm:DeleteCertificate'],
        resources: [certificates],
        conditions: { StringEquals: { [`aws:ResourceTag/${TAG_KEY}`]: TAG_VALUE } },
      }),
    );
    role.addToPolicy(new PolicyStatement({ actions: ['sts:AssumeRole'], resources: [props.roleArn] }));
    Validations.of(role).acknowledge({
      id: 'AwsSolutions::AwsSolutions-IAM5[Resource::*]',
      reason: 'acm:RequestCertificate has no resource type; the request must carry the managed-by tag.',
    });
    Validations.of(role).acknowledge({
      id: `AwsSolutions::AwsSolutions-IAM5[Resource::arn:<AWS::Partition>:acm:${region}:${account}:certificate/*]`,
      reason:
        "The certificate's ARN exists only after the request; every statement on it requires the managed-by tag. " +
        'Accepted: the role could tag, then delete, another certificate in the account; a new one has no tag to check yet.',
    });

    const code = Code.fromAsset(fileURLToPath(new URL('../lambda/certificate', import.meta.url)));
    const handler = (id: string, handlerName: string) => {
      const logGroup = new LogGroup(this, `${id}Logs`, { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY });
      logGroup.grantWrite(role);
      return new Function(this, id, { runtime: Runtime.NODEJS_24_X, code, handler: handlerName, role, logGroup, timeout: Duration.minutes(1) });
    };

    const onEvent = handler('OnEvent', 'index.onEvent');
    const isComplete = handler('IsComplete', 'index.isComplete');
    const provider = new Provider(this, 'Provider', {
      onEventHandler: onEvent,
      isCompleteHandler: isComplete,
      totalTimeout: Duration.hours(1),
      queryInterval: Duration.minutes(1),
    });
    acknowledgeProviderFindings(provider, [onEvent, isComplete, provider.node.findChild('framework-isComplete'), provider.node.findChild('framework-onTimeout')]);
    const certificate = new CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      resourceType: 'Custom::ZoneValidatedCertificate',
      properties: {
        DomainName: props.domainName,
        AlternativeNames: props.alternativeNames,
        HostedZoneId: props.hostedZoneId,
        RoleArn: props.roleArn,
      },
    });
    this.certificateArn = certificate.ref;
  }
}

/** cdk-nag matches an acknowledgement only by its exact finding id, which names each invoked function's logical id. */
function acknowledgeProviderFindings(provider: Provider, invokedFunctions: IConstruct[]): void {
  const stack = Stack.of(provider);
  const findings: [string, string][] = [
    [
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]',
      "The provider framework's own functions use the AWS basic execution policy.",
    ],
    ['AwsSolutions-SF1', "The provider framework's waiter logs through its functions; a stuck certificate fails the stack."],
    ['AwsSolutions-SF2', "The provider framework's waiter runs on deploy only; X-Ray adds nothing there."],
  ];
  for (const fn of invokedFunctions) {
    const logicalId = stack.getLogicalId(fn.node.defaultChild as CfnFunction);
    findings.push([`AwsSolutions-IAM5[Resource::<${logicalId}.Arn>:*]`, "The provider framework invokes its functions' versions, ARN suffix ':*'."]);
  }
  for (const [id, reason] of findings) {
    Validations.of(provider).acknowledge({ id: `AwsSolutions::${id}`, reason });
  }
}
