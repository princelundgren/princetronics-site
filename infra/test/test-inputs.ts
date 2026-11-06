import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Invented deploy inputs, with `functionCode` naming a real (stand-in) file. */
export function testContext(): Record<string, string> {
  const functionCode = join(mkdtempSync(join(tmpdir(), 'princetronics-function-')), 'viewer-request.js');
  writeFileSync(functionCode, 'function handler(event) { return event.request; }\n');
  return {
    workloadAccount: '111111111111',
    zoneAccount: '222222222222',
    hostedZoneId: 'Z0000000000EXAMPLE',
    contentRepo: 'example@111/content@222',
    budgetEmail: 'budget@example.com',
    functionCode,
  };
}
