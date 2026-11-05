import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs against dist/ from the production build that `npm run test:dist` makes first.
const read = (path: string) => readFileSync(`dist/${path}`, 'utf8');
const htmlFiles = (readdirSync('dist', { recursive: true }) as string[]).filter((path) => path.endsWith('.html'));

describe('RSS feed', () => {
  it('is an RSS document with one item per published entry, newest first', () => {
    const feed = read('rss.xml');
    expect(feed).toMatch(/^<\?xml[^>]*\?><rss[\s\S]*<\/rss>$/);
    const links = [...feed.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map(([, link]) => link);
    expect(links).toEqual([
      'https://www.princetronics.com/projects/fpv-drone/',
      'https://www.princetronics.com/articles/pin-your-ci-actions/',
      'https://www.princetronics.com/projects/read-433mhz-codes/',
    ]);
  });

  it('leaves drafts out', () => {
    expect(read('rss.xml')).not.toContain('draft-robot');
  });
});

describe('draft files', () => {
  it('are not copied into the build, not even unlinked', () => {
    const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
    const draftFolder = 'fixtures/content/projects/draft-robot';
    const draftDigests = readdirSync(draftFolder).map((file) => digest(`${draftFolder}/${file}`));
    const builtDigests = readdirSync('dist', { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => digest(`${entry.parentPath}/${entry.name}`));

    expect(draftDigests).toHaveLength(2);
    expect(builtDigests.filter((built) => draftDigests.includes(built))).toEqual([]);
  });
});

describe('sitemap', () => {
  it('exists and lists neither drafts nor the 404 page', () => {
    expect(existsSync('dist/sitemap-index.xml')).toBe(true);
    const sitemaps = readdirSync('dist').filter((file) => file.startsWith('sitemap'));
    for (const file of sitemaps) {
      expect(read(file)).not.toContain('draft-robot');
      expect(read(file)).not.toContain('404');
    }
    expect(sitemaps.map(read).join('')).toContain('https://www.princetronics.com/about/');
  });
});

describe('standalone pages', () => {
  it('has a 404 page at the root', () => {
    expect(existsSync('dist/404.html')).toBe(true);
  });

  it('has About and Follow, and Follow shows the feed address', () => {
    expect(existsSync('dist/about/index.html')).toBe(true);
    expect(read('follow/index.html')).toContain('https://www.princetronics.com/rss.xml');
  });
});

describe('client-side JavaScript', () => {
  it('is only the copy button: one inline script per page and no islands', () => {
    for (const path of htmlFiles) {
      const html = read(path);

      expect(html.match(/<script/g) ?? [], path).toHaveLength(1);
      expect(html, path).toContain('navigator.clipboard');
      expect(html, path).not.toContain('<astro-island');
    }
  });
});

describe('URL shape', () => {
  it('writes every page as <folder>/index.html', () => {
    expect(htmlFiles.filter((path) => path !== '404.html' && !path.endsWith('/index.html') && path !== 'index.html')).toEqual([]);
  });

  it('links internally only to paths ending in a slash or a file extension', () => {
    const internalLinks = htmlFiles.flatMap((path) =>
      [...read(path).matchAll(/href="(\/(?!\/)[^"#?]*)/g)].map(([, href]) => href),
    );
    expect(internalLinks.length).toBeGreaterThan(0);
    expect(internalLinks.filter((href) => !/(\/|\.[a-z0-9]+)$/.test(href))).toEqual([]);
  });
});
