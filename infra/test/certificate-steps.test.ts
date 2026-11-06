import { describe, expect, it } from 'vitest';
import { certificateDone, validationChanges } from '../lambda/certificate/steps.mjs';

const apexRecord = { Name: '_aaa.princetronics.com.', Type: 'CNAME', Value: '_bbb.acm-validations.aws.' };
const wwwRecord = { Name: '_ccc.www.princetronics.com.', Type: 'CNAME', Value: '_ddd.acm-validations.aws.' };

describe('validationChanges', () => {
  it('gives one UPSERT per distinct validation record', () => {
    const certificate = {
      DomainValidationOptions: [
        { DomainName: 'princetronics.com', ResourceRecord: apexRecord },
        { DomainName: 'www.princetronics.com', ResourceRecord: wwwRecord },
        { DomainName: 'www-static.princetronics.com', ResourceRecord: wwwRecord },
      ],
    };
    expect(validationChanges(certificate)).toEqual([
      { Action: 'UPSERT', ResourceRecordSet: { Name: apexRecord.Name, Type: 'CNAME', TTL: 300, ResourceRecords: [{ Value: apexRecord.Value }] } },
      { Action: 'UPSERT', ResourceRecordSet: { Name: wwwRecord.Name, Type: 'CNAME', TTL: 300, ResourceRecords: [{ Value: wwwRecord.Value }] } },
    ]);
  });

  it('gives no changes while ACM has not listed every record yet', () => {
    const certificate = {
      DomainValidationOptions: [
        { DomainName: 'princetronics.com', ResourceRecord: apexRecord },
        { DomainName: 'www.princetronics.com' },
      ],
    };
    expect(validationChanges(certificate)).toEqual([]);
  });

  it('gives no changes before ACM lists any validation option', () => {
    expect(validationChanges({})).toEqual([]);
  });
});

describe('certificateDone', () => {
  it('is done once the certificate is issued', () => {
    expect(certificateDone({ Status: 'ISSUED' })).toBe(true);
  });

  it('keeps waiting while validation is pending', () => {
    expect(certificateDone({ Status: 'PENDING_VALIDATION' })).toBe(false);
  });

  it("fails naming the status and ACM's reason otherwise", () => {
    expect(() => certificateDone({ Status: 'FAILED', FailureReason: 'CAA_ERROR' })).toThrow(/FAILED.*CAA_ERROR/);
  });
});
