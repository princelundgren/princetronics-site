import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCommentFilesHaveEntries } from '../src/lib/comment-files';

describe('checkCommentFilesHaveEntries', () => {
  let contentDir: string;

  const touch = (path: string) => {
    mkdirSync(join(contentDir, path, '..'), { recursive: true });
    writeFileSync(join(contentDir, path), '');
  };

  beforeEach(() => {
    contentDir = mkdtempSync(join(tmpdir(), 'comment-files-'));
  });

  afterEach(() => {
    rmSync(contentDir, { recursive: true, force: true });
  });

  it('accepts comments whose entry exists as .md or .mdx, drafts included', () => {
    touch('projects/robot.mdx');
    touch('articles/pins.md');
    touch('comments/projects/robot.json');
    touch('comments/articles/pins.json');

    expect(() => checkCommentFilesHaveEntries(contentDir)).not.toThrow();
  });

  it('accepts a content folder with no comments', () => {
    touch('projects/robot.mdx');

    expect(() => checkCommentFilesHaveEntries(contentDir)).not.toThrow();
  });

  it('fails naming a comments file whose entry was renamed', () => {
    touch('projects/read-433mhz-codes.mdx');
    touch('comments/projects/read-433mhz-code.json');

    expect(() => checkCommentFilesHaveEntries(contentDir)).toThrow(
      join(contentDir, 'comments/projects/read-433mhz-code.json'),
    );
  });

  it('fails for a comments file filed under the wrong section', () => {
    touch('projects/robot.mdx');
    touch('comments/articles/robot.json');

    expect(() => checkCommentFilesHaveEntries(contentDir)).toThrow(/comments\/articles\/robot\.json/);
  });
});
