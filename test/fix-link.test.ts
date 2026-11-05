import { describe, expect, it } from 'vitest';
import { suggestFixUrl } from '../src/lib/fix-link';

describe('suggestFixUrl', () => {
  const pageUrl = 'https://www.princetronics.com/projects/a b/';
  const url = new URL(suggestFixUrl(pageUrl, 'Read 433 MHz codes & more'));

  it('opens the content-fix issue form on the platform repo', () => {
    expect(url.origin + url.pathname).toBe('https://github.com/princelundgren/princetronics-site/issues/new');
    expect(url.searchParams.get('template')).toBe('content-fix.yml');
  });

  it('pre-fills the page URL exactly', () => {
    expect(url.searchParams.get('page')).toBe(pageUrl);
  });

  it('titles the issue after the page', () => {
    expect(url.searchParams.get('title')).toBe('Content fix: Read 433 MHz codes & more');
  });
});
