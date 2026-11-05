import { join } from 'node:path';
import { getEntry } from 'astro:content';
import { resolveContentDir } from './content-dir';

/** A standalone page from the content folder's `pages/`; throws naming the file when it is missing. */
export async function requirePage(id: 'about' | 'follow') {
  const page = await getEntry('pages', id);
  if (!page) {
    const file = join(resolveContentDir(process.env, process.cwd()), 'pages', `${id}.md`);
    throw new Error(`Missing page: ${file}`);
  }
  return page;
}
