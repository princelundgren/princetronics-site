import {
  ACMClient,
  DeleteCertificateCommand,
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from '@aws-sdk/client-acm';
import { ChangeResourceRecordSetsCommand, Route53Client } from '@aws-sdk/client-route-53';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { certificateDone, validationChanges } from './steps.mjs';

const TAG = { Key: 'managed-by', Value: 'princetronics-certificate' };
const acm = new ACMClient({});

function sameNames(properties, oldProperties) {
  return (
    properties.DomainName === oldProperties.DomainName &&
    JSON.stringify(properties.AlternativeNames) === JSON.stringify(oldProperties.AlternativeNames)
  );
}

async function requestCertificate(event) {
  const { DomainName, AlternativeNames } = event.ResourceProperties;
  const { CertificateArn } = await acm.send(
    new RequestCertificateCommand({
      DomainName,
      SubjectAlternativeNames: AlternativeNames,
      ValidationMethod: 'DNS',
      IdempotencyToken: event.RequestId.replaceAll('-', '').slice(0, 32),
      Tags: [TAG],
    }),
  );
  return CertificateArn;
}

async function deleteCertificate(certificateArn) {
  if (!certificateArn.startsWith('arn:')) return;
  try {
    await acm.send(new DeleteCertificateCommand({ CertificateArn: certificateArn }));
  } catch (error) {
    if (error.name !== 'ResourceNotFoundException') throw error;
  }
}

async function zoneClient(roleArn) {
  const { Credentials } = await new STSClient({}).send(
    new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'princetronics-certificate' }),
  );
  return new Route53Client({
    region: 'us-east-1',
    credentials: {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
    },
  });
}

/** Requests the certificate on Create, or on an Update that changes its names; deletes it on Delete. */
export async function onEvent(event) {
  if (event.RequestType === 'Delete') {
    await deleteCertificate(event.PhysicalResourceId);
    return { PhysicalResourceId: event.PhysicalResourceId };
  }
  if (event.RequestType === 'Update' && sameNames(event.ResourceProperties, event.OldResourceProperties)) {
    return { PhysicalResourceId: event.PhysicalResourceId };
  }
  return { PhysicalResourceId: await requestCertificate(event) };
}

/** Writes the validation records once ACM lists them, and completes when the certificate is issued. */
export async function isComplete(event) {
  if (event.RequestType === 'Delete') return { IsComplete: true };
  const { Certificate } = await acm.send(new DescribeCertificateCommand({ CertificateArn: event.PhysicalResourceId }));
  if (certificateDone(Certificate)) return { IsComplete: true };
  const changes = validationChanges(Certificate);
  if (changes.length > 0) {
    const { HostedZoneId, RoleArn } = event.ResourceProperties;
    const route53 = await zoneClient(RoleArn);
    await route53.send(new ChangeResourceRecordSetsCommand({ HostedZoneId, ChangeBatch: { Changes: changes } }));
  }
  return { IsComplete: false };
}
