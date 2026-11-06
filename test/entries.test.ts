import { describe, expect, it } from 'vitest';
import { byNewest, isPublished } from '../src/lib/entries';
import { entryUrl } from '../src/lib/urls';

describe('entryUrl', () => {
  it('puts an entry under its section with a trailing slash', () => {
    expect(entryUrl('projects', 'fpv-drone')).toBe('/projects/fpv-drone/');
    expect(entryUrl('articles', 'pin-your-ci-actions')).toBe('/articles/pin-your-ci-actions/');
  });
});

describe('isPublished', () => {
  const draft = { data: { draft: true } };
  const published = { data: { draft: false } };

  it('hides drafts only in production', () => {
    expect(isPublished(draft, true)).toBe(false);
    expect(isPublished(draft, false)).toBe(true);
    expect(isPublished(published, true)).toBe(true);
  });
});

describe('byNewest', () => {
  it('sorts the newest publish date first', () => {
    const old = { data: { publishDate: new Date('2014-06-20') } };
    const recent = { data: { publishDate: new Date('2026-03-01') } };

    expect([old, recent].sort(byNewest)).toEqual([recent, old]);
  });
});
