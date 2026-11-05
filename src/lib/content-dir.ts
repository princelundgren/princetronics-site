import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Returns the absolute path of the content folder: `env.CONTENT_DIR` resolved against `cwd`, or
 * `<cwd>/fixtures/content` when it is unset. Throws when the folder or its `projects/` subfolder
 * is missing, so a wrong path fails the build instead of producing an empty site.
 */
export function resolveContentDir(env: Record<string, string | undefined>, cwd: string): string {
  const contentDir = resolve(cwd, env.CONTENT_DIR ?? 'fixtures/content');
  if (!existsSync(contentDir)) {
    throw new Error(`Content folder not found: ${contentDir} (set CONTENT_DIR to the content checkout)`);
  }
  const projectsDir = join(contentDir, 'projects');
  if (!existsSync(projectsDir)) {
    throw new Error(`Content folder has no projects/ folder: ${projectsDir}`);
  }
  return contentDir;
}
