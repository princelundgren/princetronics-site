import { WebIdentityPrincipal } from 'aws-cdk-lib/aws-iam';

export const GITHUB_TOKENS = 'token.actions.githubusercontent.com';
export const GITHUB_AUDIENCE = 'sts.amazonaws.com';

/**
 * A principal for one workflow file of `contentRepo` (`<owner>@<id>/<repo>@<id>`), run from its main branch, through
 * GitHub's OIDC provider: `sub` pins the repository by its immutable ids, `job_workflow_ref` the workflow by its path.
 */
export function contentRepoWorkflow(oidcProviderArn: string, contentRepo: string, workflowFile: string): WebIdentityPrincipal {
  const repoPath = contentRepo.replace(/@\d+/g, '');
  return new WebIdentityPrincipal(oidcProviderArn, {
    StringEquals: {
      [`${GITHUB_TOKENS}:aud`]: GITHUB_AUDIENCE,
      [`${GITHUB_TOKENS}:sub`]: `repo:${contentRepo}:ref:refs/heads/main`,
      [`${GITHUB_TOKENS}:job_workflow_ref`]: `${repoPath}/.github/workflows/${workflowFile}@refs/heads/main`,
    },
  });
}
