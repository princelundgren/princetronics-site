import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import GuideAtAGlance from '../src/components/GuideAtAGlance.astro';
import OnThisPage from '../src/components/OnThisPage.astro';
import PartsTable from '../src/components/PartsTable.astro';

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('PartsTable', () => {
  it('renders one row per part with its quantity, and a dash for a missing price', async () => {
    const html = await container.renderToString(PartsTable, {
      props: {
        parts: [
          { name: 'Arduino Uno', quantity: 1, price: '~250 SEK', whereToBuy: 'Any electronics shop' },
          { name: 'Jumper wires', quantity: 3, whereToBuy: 'Any electronics shop' },
        ],
      },
    });
    const rows = html.match(/<tbody[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g) ?? [];

    expect(rows).toHaveLength(2);
    expect(html).toMatch(/<td[^>]*>3<\/td>/);
    expect(html).toMatch(/<td[^>]*>—<\/td>/);
  });
});

describe('GuideAtAGlance', () => {
  it('shows difficulty, time and cost on one line', async () => {
    const html = await container.renderToString(GuideAtAGlance, {
      props: { difficulty: 'beginner', time: '~1 hour', cost: '~100 SEK' },
    });

    expect(html).toContain('Beginner · ~1 hour · ~100 SEK');
  });
});

describe('OnThisPage', () => {
  const headings = [
    { depth: 2, slug: 'wire-the-receiver', text: 'Wire the receiver' },
    { depth: 3, slug: 'a-detail', text: 'A detail' },
    { depth: 2, slug: 'read-the-codes', text: 'Read the codes' },
    { depth: 2, slug: 'troubleshooting', text: 'Troubleshooting' },
    { depth: 2, slug: 'downloads', text: 'Downloads' },
  ];
  const linksIn = (html: string) =>
    [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => [href, text]);

  it("lists What you'll need, then each section heading as an anchor link", async () => {
    const html = await container.renderToString(OnThisPage, { props: { headings } });

    expect(linksIn(html)).toEqual([
      ['#what-youll-need', 'What you’ll need'],
      ['#wire-the-receiver', 'Wire the receiver'],
      ['#read-the-codes', 'Read the codes'],
      ['#troubleshooting', 'Troubleshooting'],
      ['#downloads', 'Downloads'],
    ]);
  });

  it('numbers only the steps', async () => {
    const html = await container.renderToString(OnThisPage, { props: { headings } });
    const numbered = html.match(/<ol[\s\S]*?<\/ol>/)?.[0] ?? '';

    expect(linksIn(numbered)).toEqual([
      ['#wire-the-receiver', 'Wire the receiver'],
      ['#read-the-codes', 'Read the codes'],
    ]);
  });
});
