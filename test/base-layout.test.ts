import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import BaseLayout from '../src/layouts/BaseLayout.astro';

describe('BaseLayout', () => {
  let html: string;

  beforeAll(async () => {
    const container = await AstroContainer.create();
    html = await container.renderToString(BaseLayout, {
      props: { title: 'About', description: 'Who writes this site.', canonicalPath: '/about/', showLearning: false },
      slots: { default: '<p>Body</p>' },
    });
  });

  it('renders link-preview metadata', () => {
    expect(html).toContain('<meta property="og:title" content="About"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
  });

  it('renders an absolute canonical URL on the www host', () => {
    expect(html).toContain('<link rel="canonical" href="https://www.princetronics.com/about/"');
  });

  it('links the RSS feed for feed readers', () => {
    expect(html).toMatch(/<link rel="alternate" type="application\/rss\+xml"[^>]*href="\/rss\.xml"/);
  });

  it('has Projects, Articles and About in the navigation, and Learning only when asked', () => {
    const nav = html.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? '';

    expect(nav).toContain('href="/projects/"');
    expect(nav).toContain('href="/articles/"');
    expect(nav).toContain('href="/about/"');
    expect(nav).not.toContain('href="/learning/"');
  });

  it('links Follow, RSS and About in the footer, under the site name', () => {
    const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';

    expect(footer).toContain('PrinceTronics');
    expect(footer).toContain('href="/follow/"');
    expect(footer).toContain('href="/rss.xml"');
    expect(footer).toContain('href="/about/"');
  });

  it('opens the header with the P mark, a home link named PrinceTronics', () => {
    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
    const [, attributes = '', text] = header.match(/<a([^>]*)>([^<]*)<\/a>/) ?? [];

    expect(attributes).toContain('href="/"');
    expect(attributes).toContain('aria-label="PrinceTronics"');
    expect(text).toBe('P');
    expect(header.replace(/<[^>]+>/g, ' ')).not.toContain('PrinceTronics');
  });

  it('marks the current section in the navigation', async () => {
    const container = await AstroContainer.create();
    const projects = await container.renderToString(BaseLayout, {
      props: { title: 'Projects', description: 'All projects.', canonicalPath: '/projects/', showLearning: false, currentSection: 'projects' },
    });
    const nav = projects.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? '';

    expect(nav).toMatch(/<a[^>]*href="\/projects\/"[^>]*aria-current="true"|<a[^>]*aria-current="true"[^>]*href="\/projects\/"/);
    expect(nav.match(/aria-current/g)).toHaveLength(1);
    expect(html).not.toContain('aria-current');
  });

  it('leaves out the canonical URL and og:url for a page with no address of its own', async () => {
    const container = await AstroContainer.create();
    const notFound = await container.renderToString(BaseLayout, {
      props: { title: 'Page not found', description: 'This page does not exist.', showLearning: false },
    });

    expect(notFound).not.toContain('rel="canonical"');
    expect(notFound).not.toContain('og:url');
  });
});
