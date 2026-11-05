import type { Comment } from './schemas';

export type ThreadNode = { comment: Comment; replies: ThreadNode[] };

export type TextBlock = { kind: 'paragraph' | 'code'; text: string };

/**
 * Nests comments by `parent`, siblings oldest first. A comment whose parent is `null` or absent
 * (removed as spam) is top-level, so no real reply is lost.
 */
export function buildThread(comments: Comment[]): ThreadNode[] {
  const nodes = new Map(comments.map((comment) => [comment.id, { comment, replies: [] as ThreadNode[] }]));
  const topLevel: ThreadNode[] = [];
  for (const node of [...nodes.values()].sort((a, b) => a.comment.date.getTime() - b.comment.date.getTime())) {
    const parent = node.comment.parent === null ? undefined : nodes.get(node.comment.parent);
    (parent ? parent.replies : topLevel).push(node);
  }
  return topLevel;
}

/** Splits plain comment text into paragraphs (on blank lines) and ``` fenced code blocks; drops empty blocks. */
export function textToBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let lines: string[] = [];
  let inCode = false;

  const flush = (kind: TextBlock['kind']) => {
    const blockText = kind === 'code' ? lines.join('\n') : lines.join('\n').trim();
    if (blockText.trim() !== '') blocks.push({ kind, text: blockText });
    lines = [];
  };

  for (const line of text.split('\n')) {
    if (line.trim().startsWith('```')) {
      flush(inCode ? 'code' : 'paragraph');
      inCode = !inCode;
    } else if (!inCode && line.trim() === '') {
      flush('paragraph');
    } else {
      lines.push(line);
    }
  }
  flush(inCode ? 'code' : 'paragraph');
  return blocks;
}
