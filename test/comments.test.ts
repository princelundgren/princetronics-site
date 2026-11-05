import { describe, expect, it } from 'vitest';
import { buildThread, textToBlocks } from '../src/lib/comments';
import type { Comment } from '../src/lib/schemas';

function comment(id: number, parent: number | null, date: string): Comment {
  return { id, parent, author: `Reader ${id}`, date: new Date(date), text: `Comment ${id}` };
}

const ids = (nodes: ReturnType<typeof buildThread>) => nodes.map((node) => node.comment.id);

describe('buildThread', () => {
  it('nests a reply under its parent', () => {
    const thread = buildThread([comment(1, null, '2014-07-01'), comment(2, 1, '2014-07-02')]);

    expect(ids(thread)).toEqual([1]);
    expect(ids(thread[0].replies)).toEqual([2]);
  });

  it('shows a reply whose parent was removed at the top level', () => {
    const thread = buildThread([comment(1, null, '2014-07-01'), comment(4, 3, '2014-07-04')]);

    expect(ids(thread)).toEqual([1, 4]);
  });

  it('sorts siblings oldest first', () => {
    const thread = buildThread([
      comment(3, null, '2014-07-03'),
      comment(1, null, '2014-07-01'),
      comment(5, 1, '2014-07-05'),
      comment(2, 1, '2014-07-02'),
    ]);

    expect(ids(thread)).toEqual([1, 3]);
    expect(ids(thread[0].replies)).toEqual([2, 5]);
  });
});

describe('textToBlocks', () => {
  it('splits paragraphs on blank lines', () => {
    expect(textToBlocks('a\n\nb')).toEqual([
      { kind: 'paragraph', text: 'a' },
      { kind: 'paragraph', text: 'b' },
    ]);
  });

  it('turns a fenced block into one code block that keeps its newlines', () => {
    expect(textToBlocks('Try this:\n```\nvoid loop() {\n\n  blink();\n}\n```\nThanks')).toEqual([
      { kind: 'paragraph', text: 'Try this:' },
      { kind: 'code', text: 'void loop() {\n\n  blink();\n}' },
      { kind: 'paragraph', text: 'Thanks' },
    ]);
  });

  it('drops empty blocks', () => {
    expect(textToBlocks('\n\n\na\n\n\n\n')).toEqual([{ kind: 'paragraph', text: 'a' }]);
  });
});
