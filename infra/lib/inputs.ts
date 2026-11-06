import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** The deploy inputs, all from CDK context (`-c key=value` or an uncommitted `cdk.context.json`). */
export type Inputs = {
  workloadAccount: string;
  zoneAccount: string;
  hostedZoneId: string;
  contentRepo: string;
  budgetEmail: string;
  oidcProviderArn: string | undefined;
  functionCode: string;
};

const DEFAULT_FUNCTION_CODE = '../edge-dist/viewer-request.js';

const FORMS: Record<string, { pattern: RegExp; form: string }> = {
  workloadAccount: { pattern: /^\d{12}$/, form: '12 digits' },
  zoneAccount: { pattern: /^\d{12}$/, form: '12 digits' },
  hostedZoneId: { pattern: /^Z[A-Z0-9]+$/, form: 'a Route 53 zone id such as Z0123456789ABCDEFGHIJ' },
  contentRepo: { pattern: /^[^\s@/]+@\d+\/[^\s@/]+@\d+$/, form: '<owner>@<owner id>/<repo>@<repo id>' },
  budgetEmail: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, form: 'an email address' },
  oidcProviderArn: {
    pattern: /^arn:aws:iam::\d{12}:oidc-provider\/token\.actions\.githubusercontent\.com$/,
    form: 'arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com',
  },
};

function required(context: Record<string, unknown>, key: string): string {
  const value = context[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing context input ${key}: pass -c ${key}=<${FORMS[key].form}>`);
  }
  return matching(key, value);
}

function matching(key: string, value: unknown): string {
  if (typeof value !== 'string' || !FORMS[key].pattern.test(value)) {
    throw new Error(`Context input ${key} must be ${FORMS[key].form}, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Reads and checks the deploy inputs. Throws naming the first missing or malformed key and the form it expects, or
 * the `functionCode` path (resolved against the working directory) when no file is there.
 */
export function readInputs(context: Record<string, unknown>): Inputs {
  const functionCode = typeof context.functionCode === 'string' ? context.functionCode : DEFAULT_FUNCTION_CODE;
  const inputs: Inputs = {
    workloadAccount: required(context, 'workloadAccount'),
    zoneAccount: required(context, 'zoneAccount'),
    hostedZoneId: required(context, 'hostedZoneId'),
    contentRepo: required(context, 'contentRepo'),
    budgetEmail: required(context, 'budgetEmail'),
    oidcProviderArn: context.oidcProviderArn === undefined ? undefined : matching('oidcProviderArn', context.oidcProviderArn),
    functionCode,
  };
  if (!existsSync(resolve(functionCode))) {
    throw new Error(`Context input functionCode names ${resolve(functionCode)}, which does not exist: run npm run build:edge first`);
  }
  return inputs;
}
