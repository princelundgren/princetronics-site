import { describe, expect, it } from 'vitest';
import { collectTags } from '../src/lib/tags';

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
