/**
 * The Route 53 changes that write a certificate's DNS validation records: one UPSERT per distinct record, or none
 * until ACM has listed a record for every name.
 * @param {{ DomainValidationOptions?: { ResourceRecord?: { Name: string, Type: string, Value: string } }[] }} certificate
 */
export function validationChanges(certificate) {
  const options = certificate.DomainValidationOptions ?? [];
  if (options.length === 0 || options.some((option) => !option.ResourceRecord)) return [];
  const records = new Map(options.map(({ ResourceRecord: record }) => [record.Name, record]));
  return [...records.values()].map((record) => ({
    Action: 'UPSERT',
    ResourceRecordSet: { Name: record.Name, Type: record.Type, TTL: 300, ResourceRecords: [{ Value: record.Value }] },
  }));
}

/**
 * Whether the certificate is issued: true once ISSUED, false while PENDING_VALIDATION. Throws naming the status and
 * ACM's failure reason for any other status, since none of them ends in an issued certificate.
 * @param {{ CertificateArn?: string, Status?: string, FailureReason?: string }} certificate
 */
export function certificateDone(certificate) {
  if (certificate.Status === 'ISSUED') return true;
  if (certificate.Status === 'PENDING_VALIDATION') return false;
  throw new Error(
    `Certificate ${certificate.CertificateArn ?? ''} is ${certificate.Status}: ${certificate.FailureReason ?? 'ACM gave no reason'}`,
  );
}
