import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import EarlierDiscussion from '../src/components/EarlierDiscussion.astro';
import { commentFileSchema } from '../src/lib/schemas';

// The fixture holds a thread, an orphaned reply, and a comment with <script>, <a href> and a code fence.
const { comments } = commentFileSchema.parse(
  JSON.parse(readFileSync('fixtures/content/comments/projects/read-433mhz-codes.json', 'utf8')),
);

describe('EarlierDiscussion', () => {
  let container: AstroContainer;
  let html: string;

  beforeAll(async () => {
    container = await AstroContainer.create();
    html = await container.renderToString(EarlierDiscussion, { props: { comments } });
  });

  it('shows markup in comments as text, never as markup', () => {
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;b&gt;Mallory&lt;/b&gt;');
  });

  it('has no links, not even in a comment that contains one', () => {
    expect(html).not.toMatch(/<a[\s>]/);
  });

  it('anchors each comment by its old id', () => {
    for (const { id } of comments) {
      expect(html).toContain(`id="comment-${id}"`);
    }
  });

  it('keeps single line breaks inside a paragraph', async () => {
    const wiring = { ...comments[0], text: 'My wiring:\nVCC -> 5V\nGND -> GND' };
    const rendered = await container.renderToString(EarlierDiscussion, { props: { comments: [wiring] } });

    expect(rendered).toMatch(/<p>My wiring:<br\/?>VCC -&gt; 5V<br\/?>GND -&gt; GND<\/p>/);
  });

  it('renders a fenced block as code', () => {
    expect(html).toMatch(/<pre><code>void loop\(\) \{\n {2}blink\(\);\n\}<\/code><\/pre>/);
  });

  it('renders nothing without comments', async () => {
    expect((await container.renderToString(EarlierDiscussion, { props: { comments: [] } })).trim()).toBe('');
  });
});
