import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import EntryDemo from '../src/components/EntryDemo.astro';
import PartsList from '../src/components/PartsList.astro';

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('PartsList', () => {
  const render = (parts: object[], tools: string[] = []) =>
    container.renderToString(PartsList, { props: { parts, tools } });

  it('renders one item per part with its quantity', async () => {
    const html = await render([
      { name: 'Arduino Uno', quantity: 1 },
      { name: 'Jumper wires', quantity: 3 },
    ]);

    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain('Jumper wires');
    expect(html).toMatch(/class="qty"[^>]*>3</);
  });

  it('shows a price when one is given', async () => {
    expect(await render([{ name: 'Arduino Uno', quantity: 1, price: '~250 SEK' }])).toContain('~250 SEK');
  });

  it('links an https shop, set apart from the name', async () => {
    const html = await render([{ name: 'Uno', quantity: 1, whereToBuy: 'https://store.arduino.cc/uno' }]);
    expect(html).toContain('Uno · <a href="https://store.arduino.cc/uno"');
  });

  it('shows plain text and a javascript: URL as text, never as a link', async () => {
    const html = await render([
      { name: 'Wires', quantity: 1, whereToBuy: 'Any electronics retailer' },
      { name: 'Trap', quantity: 1, whereToBuy: 'javascript:alert(1)' },
    ]);

    expect(html).toContain('Any electronics retailer');
    expect(html).toContain('javascript:alert(1)');
    expect(html).not.toContain('href');
  });

  it('lists the tools when there are any', async () => {
    expect(await render([{ name: 'Uno', quantity: 1 }], ['USB cable', 'A computer'])).toMatch(
      /Tools:[\s\S]*USB cable, A computer/,
    );
    expect(await render([{ name: 'Uno', quantity: 1 }])).not.toContain('Tools:');
  });
});

describe('EntryDemo', () => {
  const cover = { src: '/cover.jpg', width: 1200, height: 800, format: 'jpg' as const };

  it('links the cover to the video, loading nothing from YouTube', async () => {
    const html = await container.renderToString(EntryDemo, {
      props: { cover, coverAlt: 'The board', video: 'https://www.youtube.com/watch?v=abc123' },
    });

    expect(html).toContain('href="https://www.youtube.com/watch?v=abc123"');
    expect(html).toContain('aria-label="Watch the video on YouTube"');
    expect(html).not.toContain('<iframe');
  });

  it('shows the cover alone without a video', async () => {
    const html = await container.renderToString(EntryDemo, { props: { cover, coverAlt: 'The board' } });

    expect(html).toContain('alt="The board"');
    expect(html).not.toContain('<a');
  });
});
