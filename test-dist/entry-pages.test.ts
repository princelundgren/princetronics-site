import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs against dist/ from the production build that `npm run test:dist` makes first.
const page = (path: string) => readFileSync(`dist/${path}`, 'utf8');

describe('project and article pages', () => {
  it('renders a guide with its parts table, step list and Suggest-a-fix link', () => {
    const html = page('projects/read-433mhz-codes/index.html');

    expect(html).toContain('<table class="parts"');
    expect(html).toContain('aria-label="On this page"');
    expect(html).toContain('https://github.com/princelundgren/princetronics-site/issues/new?template=content-fix.yml');
  });

  it('shows the publish month and the updated year as one date', () => {
    expect(page('projects/read-433mhz-codes/index.html')).toMatch(/<span class="date">[^<]*<time[^>]*>Jun 2014<\/time>, updated 2026<\/span>/);
  });

  it('shows old comments under the entry they belong to, and only there', () => {
    expect(page('projects/read-433mhz-codes/index.html')).toContain('id="comment-101"');
    expect(page('projects/fpv-drone/index.html')).not.toContain('Earlier discussion');
  });

  it('renders a showcase project without a parts table', () => {
    expect(page('projects/fpv-drone/index.html')).not.toContain('<table class="parts"');
  });

  it('renders the article', () => {
    expect(existsSync('dist/articles/pin-your-ci-actions/index.html')).toBe(true);
  });

  it('builds no page for a draft', () => {
    expect(existsSync('dist/projects/draft-robot/index.html')).toBe(false);
  });
});
