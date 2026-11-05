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

  it('links Follow and RSS in the footer', () => {
    const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';

    expect(footer).toContain('href="/follow/"');
    expect(footer).toContain('href="/rss.xml"');
  });
});
