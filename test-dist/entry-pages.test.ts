import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/lib/contrast';

// Runs against dist/ from the production build that `npm run test:dist` makes first.
const page = (path: string) => readFileSync(`dist/${path}`, 'utf8');

describe('project and article pages', () => {
  it('renders a guide in the page order: start, intro, parts, steps, tags, Suggest a fix', () => {
    const html = page('projects/read-433mhz-codes/index.html');
    const order = ['<h1', 'class="summary"', 'class="demo"', 'class="date"', 'what the remote sends', 'class="parts"',
      'id="wire-the-receiver"', 'class="tags"', 'issues/new?template=content-fix.yml'].map((marker) => html.indexOf(marker));

    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('has none of the removed blocks and loads nothing from YouTube', () => {
    for (const path of ['projects/read-433mhz-codes/index.html', 'articles/pin-your-ci-actions/index.html']) {
      const html = page(path);
      for (const removed of ['aria-label="On this page"', 'class="why-how-result"', '← Projects', '← Articles', '<iframe']) {
        expect(html, `${path} ${removed}`).not.toContain(removed);
      }
    }
  });

  it('colours every token of a code block at 4.5:1 or more on its background', () => {
    const block = page('projects/read-433mhz-codes/index.html').match(/<pre[\s\S]*?<\/pre>/)?.[0] ?? '';
    const background = block.match(/background-color:(#[0-9a-f]{6})/i)?.[1] ?? '';
    const colours = new Set([...block.matchAll(/(?<!-)color:(#[0-9a-f]{6})/gi)].map(([, colour]) => colour));

    expect(colours.size).toBeGreaterThan(1);
    for (const colour of colours) {
      expect(contrastRatio(colour, background), colour).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('shows an article without a demo', () => {
    expect(page('articles/pin-your-ci-actions/index.html')).not.toContain('class="demo"');
  });

  it("links an entry's tags to their /tag/ pages", () => {
    const tags = page('projects/fpv-drone/index.html').match(/<div class="tags">[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(tags).toContain('href="/tag/arduino/"');
    expect(tags).toContain('href="/tag/drones/"');
  });

  it('shows the publish month and the updated year as one date', () => {
    expect(page('projects/read-433mhz-codes/index.html')).toMatch(/<p class="date">[^<]*<time[^>]*>Jun 2014<\/time>, updated 2026<\/p>/);
  });

  it('shows old comments under the entry they belong to, and only there', () => {
    expect(page('projects/read-433mhz-codes/index.html')).toContain('id="comment-101"');
    expect(page('projects/fpv-drone/index.html')).not.toContain('Earlier discussion');
  });

  it('links a project to its source code and its related articles', () => {
    const links = page('projects/fpv-drone/index.html').match(/<p class="links">[\s\S]*?<\/p>/)?.[0] ?? '';

    expect(links).toContain('href="https://github.com/example/fpv-drone-config"');
    expect(links).toContain('href="/articles/pin-your-ci-actions/"');
  });

  it('renders a showcase project without a parts list', () => {
    expect(page('projects/fpv-drone/index.html')).not.toContain('class="parts"');
  });

  it('renders the article', () => {
    expect(existsSync('dist/articles/pin-your-ci-actions/index.html')).toBe(true);
  });

  it('builds no page for a draft', () => {
    expect(existsSync('dist/projects/draft-robot/index.html')).toBe(false);
  });
});
