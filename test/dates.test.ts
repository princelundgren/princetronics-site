import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { monthYear } from '../src/lib/dates';

describe('monthYear', () => {
  const originalTimeZone = process.env.TZ;

  // A zone behind UTC, where midnight UTC on 1 July is still 30 June locally.
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });

  afterAll(() => {
    process.env.TZ = originalTimeZone;
  });

  it('shows the month a date-only frontmatter value names, whatever the local time zone', () => {
    expect(monthYear(new Date('2014-07-01'))).toBe('Jul 2014');
  });
});
