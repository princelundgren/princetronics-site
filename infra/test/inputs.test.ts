import { describe, expect, it } from 'vitest';
import { readInputs } from '../lib/inputs.js';
import { testContext } from './test-inputs.js';

describe('readInputs', () => {
  it('returns every input from a valid context', () => {
    const context = testContext();
    expect(readInputs(context)).toEqual({ ...context, oidcProviderArn: undefined });
  });

  it.each(['workloadAccount', 'zoneAccount', 'hostedZoneId', 'contentRepo', 'budgetEmail'])(
    'fails naming %s when it is missing',
    (key) => {
      const context = testContext();
      delete context[key];
      expect(() => readInputs(context)).toThrow(new RegExp(key));
    },
  );

  it('fails on an account id that is not 12 digits, naming the form', () => {
    expect(() => readInputs({ ...testContext(), workloadAccount: '123' })).toThrow(/workloadAccount.*12 digits/);
  });

  it('fails on a repository name without its ids, naming the form', () => {
    expect(() => readInputs({ ...testContext(), contentRepo: 'owner/repo' })).toThrow(
      /contentRepo.*<owner>@<owner id>\/<repo>@<repo id>/,
    );
  });

  it('fails on a function file that does not exist, naming the path', () => {
    expect(() => readInputs({ ...testContext(), functionCode: '/nonexistent/viewer-request.js' })).toThrow(
      /\/nonexistent\/viewer-request\.js/,
    );
  });

  it('accepts an existing GitHub OIDC provider', () => {
    const arn = 'arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com';
    expect(readInputs({ ...testContext(), oidcProviderArn: arn }).oidcProviderArn).toBe(arn);
  });
});
