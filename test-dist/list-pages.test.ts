import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs against dist/ from the production build that `npm run test:dist` makes first.
const page = (path: string) => readFileSync(`dist/${path}`, 'utf8');
const linkedEntries = (html: string) => [...html.matchAll(/href="\/(projects|articles)\/([^/"]+)\/"/g)].map(([, , id]) => id);

describe('home page', () => {
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
