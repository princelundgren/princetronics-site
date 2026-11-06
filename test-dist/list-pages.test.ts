import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs against dist/ from the production build that `npm run test:dist` makes first.
const page = (path: string) => readFileSync(`dist/${path}`, 'utf8');
const linkedEntries = (html: string) => [...html.matchAll(/href="\/(projects|articles)\/([^/"]+)\/"/g)].map(([, , id]) => id);

const cardsIn = (html: string) => html.match(/<article class="entry-card"[\s\S]*?<\/article>/g) ?? [];
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('home page', () => {
  it("opens with the site's name and the About page's summary", () => {
    expect(page('index.html')).toMatch(/<h1[^>]*>PrinceTronics<\/h1>\s*<p[^>]*>Who writes this site and why\.<\/p>/);
  });

  it('shows each card as cover, kind and date, linked title, then summary', () => {
    const [drone = '', article = ''] = cardsIn(page('index.html'));

    expect(drone.indexOf('<img')).toBeLessThan(drone.indexOf('Project'));
    expect(textOf(drone)).toMatch(/Project · Mar 2026\s*A 3-inch FPV drone\s*A small, quiet/);
    expect(textOf(article)).toMatch(/Article · Feb 2026\s*Pin your CI actions to commit SHAs\s*A tag can move under you/);
  });

  it('gives each card exactly one link, its title', () => {
    for (const card of cardsIn(page('index.html'))) {
      expect(card.match(/<a\b/g)).toHaveLength(1);
      expect(card).toMatch(/<h2[^>]*><a\b/);
    }
  });

  it('lists every published project and article, newest first, without drafts', () => {
    expect(linkedEntries(page('index.html'))).toEqual(['fpv-drone', 'pin-your-ci-actions', 'read-433mhz-codes']);
  });

  it('links Learning in the navigation when the learning list has entries', () => {
    expect(page('index.html').match(/<nav[\s\S]*?<\/nav>/)?.[0]).toContain('href="/learning/"');
  });
});

describe('section pages', () => {
  it('lists only their own section', () => {
    expect(linkedEntries(page('projects/index.html'))).toEqual(['fpv-drone', 'read-433mhz-codes']);
    expect(linkedEntries(page('articles/index.html'))).toEqual(['pin-your-ci-actions']);
  });
});

describe('tag pages', () => {
  it('builds one page for a tag spelled two ways, listing its published entries only', () => {
    expect(readdirSync('dist/tag').filter((tag) => tag.toLowerCase() === 'arduino')).toEqual(['arduino']);
    expect(linkedEntries(page('tag/arduino/index.html'))).toEqual(['fpv-drone', 'read-433mhz-codes']);
  });

  it('builds no page for a tag only a draft uses', () => {
    expect(existsSync('dist/tag/robots')).toBe(false);
  });
});

describe('learning page', () => {
  it('groups the learning list by topic', () => {
    const html = page('learning/index.html');

    expect(html).toMatch(/<h2[^>]*>Electronics<\/h2>[\s\S]*Getting started with Arduino/);
    expect(html).toMatch(/<h2[^>]*>Web<\/h2>[\s\S]*Astro/);
  });
});
