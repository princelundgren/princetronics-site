import { describe, expect, it } from 'vitest';
import { collectTags, tagSlug } from '../src/lib/tags';

describe('collectTags', () => {
  it('counts spellings that differ only in case or spacing as one tag, labelled as first seen', () => {
    const tags = collectTags([
      { data: { tags: ['Arduino', '433 MHz'] } },
      { data: { tags: ['arduino'] } },
      { data: { tags: ['Arduino '] } },
    ]);

    expect([...tags.keys()]).toEqual(['arduino', '433-mhz']);
    expect(tags.get('arduino')).toEqual({ label: 'Arduino', count: 3 });
  });
});

describe('tagSlug', () => {
  it('ignores case and surrounding spaces', () => {
    expect(tagSlug('Arduino')).toBe('arduino');
    expect(tagSlug(' arduino ')).toBe('arduino');
    expect(tagSlug('ARDUINO')).toBe('arduino');
  });

  it('joins words with a hyphen', () => {
    expect(tagSlug('433 MHz')).toBe('433-mhz');
  });

  it('keeps C, C++ and C# apart', () => {
    expect(tagSlug('C')).toBe('c');
    expect(tagSlug('C++')).toBe('c-plus-plus');
    expect(tagSlug('C#')).toBe('c-sharp');
  });
});
