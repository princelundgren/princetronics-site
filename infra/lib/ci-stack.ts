import { BOOTSTRAP_QUALIFIER_CONTEXT, DefaultStackSynthesizer, Stack, type StackProps } from 'aws-cdk-lib';
import { OidcProviderNative, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { GITHUB_AUDIENCE, GITHUB_TOKENS, contentRepoWorkflow } from './github-oidc.js';
import type { Inputs } from './inputs.js';

/**
 * GitHub's OIDC provider, imported from `oidcProviderArn` when given, and the role the content repo's infrastructure
 * workflow assumes on its main branch to deploy the CDK app through the CDK bootstrap roles.
 */
export class CiStack extends Stack {
  readonly oidcProviderArn: string;

  constructor(scope: Construct, id: string, props: StackProps & { inputs: Inputs }) {
    super(scope, id, props);
    const { inputs } = props;
    this.oidcProviderArn =
      inputs.oidcProviderArn ??
      new OidcProviderNative(this, 'GitHubOidc', { url: `https://${GITHUB_TOKENS}`, clientIds: [GITHUB_AUDIENCE] }).oidcProviderArn;

    const infra = new Role(this, 'InfraRole', {
      roleName: 'PrinceTronics-Infra',
      assumedBy: contentRepoWorkflow(this.oidcProviderArn, inputs.contentRepo, 'infrastructure.yml'),
    });
    infra.addToPolicy(new PolicyStatement({ actions: ['sts:AssumeRole'], resources: this.bootstrapRoleArns() }));
  }

  /** The deploy, file-publishing and lookup roles `cdk deploy` assumes, named as the default synthesizer names them. */
  private bootstrapRoleArns(): string[] {
    const qualifier = this.node.tryGetContext(BOOTSTRAP_QUALIFIER_CONTEXT) ?? DefaultStackSynthesizer.DEFAULT_QUALIFIER;
    return [
      DefaultStackSynthesizer.DEFAULT_DEPLOY_ROLE_ARN,
      DefaultStackSynthesizer.DEFAULT_FILE_ASSET_PUBLISHING_ROLE_ARN,
      DefaultStackSynthesizer.DEFAULT_LOOKUP_ROLE_ARN,
    ].map((template) =>
      template
        .replace('${AWS::Partition}', 'aws')
        .replaceAll('${AWS::AccountId}', this.account)
        .replace('${AWS::Region}', this.region)
        .replace('${Qualifier}', qualifier),
    );
  }
}
