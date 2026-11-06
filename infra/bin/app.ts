import { App, Tags, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { CiStack } from '../lib/ci-stack.js';
import { readInputs } from '../lib/inputs.js';
import { SiteStack } from '../lib/site-stack.js';
import { ZoneAccessStack } from '../lib/zone-access-stack.js';

const app = new App();
const inputs = readInputs(app.node.getAllContext());
const inRegion = (account: string) => ({ account, region: 'us-east-1' });

new ZoneAccessStack(app, 'PrinceTronics-ZoneAccess', { env: inRegion(inputs.zoneAccount), inputs });
const ci = new CiStack(app, 'PrinceTronics-Ci', { env: inRegion(inputs.workloadAccount), inputs });
new SiteStack(app, 'PrinceTronics-Site', { env: inRegion(inputs.workloadAccount), inputs, oidcProviderArn: ci.oidcProviderArn });

Tags.of(app).add('project', 'princetronics');
Validations.of(app).addPlugins(new AwsSolutionsChecks(app));
