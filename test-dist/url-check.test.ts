import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildStep, checkUrl, type InventoryEntry } from '../edge/url-check';

// Runs against dist/ and edge-dist/ from the build that `npm run test:dist` makes first.
const step = buildStep(readFileSync('edge-dist/viewer-request.js', 'utf8'), 'dist');
const inventory: InventoryEntry[] = JSON.parse(readFileSync('fixtures/inventory.json', 'utf8'));

describe('the URL check over the fixture build', () => {
  for (const entry of inventory) {
    it(`passes ${entry.url}`, async () => {
      const result = await checkUrl(entry, step);
      expect(result.ok, result.hops.join(' → ')).toBe(true);
    });
  }

  it('takes plain http to https before the function answers 410', async () => {
    expect(await checkUrl({ url: 'http://princetronics.com/xmlrpc.php', gone: true }, step)).toEqual({
      ok: true,
      hops: ['301 http://princetronics.com/xmlrpc.php', '410 https://princetronics.com/xmlrpc.php'],
    });
  });

  it('fails an upload that is not in the build', async () => {
    const url = 'https://www-static.princetronics.com/wp-content/uploads/2014/06/missing.jpg';
    expect(await checkUrl({ url }, step)).toEqual({ ok: false, hops: [`404 ${url}`] });
  });
});
