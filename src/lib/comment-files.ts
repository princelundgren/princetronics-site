import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Throws naming the first `comments/<section>/<slug>.json` with no `<section>/<slug>.md` or `.mdx`
 * beside it, so comments whose entry was renamed fail the build instead of vanishing.
 */
export function checkCommentFilesHaveEntries(contentDir: string): void {
  const commentsDir = join(contentDir, 'comments');
  if (!existsSync(commentsDir)) return;

  const commentFiles = (readdirSync(commentsDir, { recursive: true }) as string[]).filter((path) => path.endsWith('.json'));
  for (const commentFile of commentFiles) {
    const entryPath = join(contentDir, commentFile.slice(0, -'.json'.length));
    if (!existsSync(`${entryPath}.md`) && !existsSync(`${entryPath}.mdx`)) {
      throw new Error(
        `Comments file has no matching entry: ${join(commentsDir, commentFile)} (expected ${entryPath}.md or .mdx)`,
      );
    }
  }
}
